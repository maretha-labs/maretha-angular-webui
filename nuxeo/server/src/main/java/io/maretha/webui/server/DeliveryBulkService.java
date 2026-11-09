package io.maretha.webui.server;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Function;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.nuxeo.ecm.core.api.Blob;
import org.nuxeo.ecm.core.api.CloseableCoreSession;
import org.nuxeo.ecm.core.api.CoreInstance;
import org.nuxeo.ecm.core.api.DocumentModel;
import org.nuxeo.ecm.core.api.IdRef;
import org.nuxeo.ecm.core.api.NuxeoPrincipal;
import org.nuxeo.ecm.core.api.impl.blob.FileBlob;
import org.nuxeo.ecm.core.api.impl.blob.ZipEntryBlob;
import org.nuxeo.ecm.core.api.security.SecurityConstants;
import org.nuxeo.ecm.core.io.download.DownloadHelper;
import org.nuxeo.ecm.core.io.download.DownloadService;
import org.nuxeo.ecm.core.transientstore.api.TransientStore;
import org.nuxeo.ecm.core.transientstore.api.TransientStoreService;
import org.nuxeo.ecm.core.work.api.WorkManager;
import org.nuxeo.ecm.platform.usermanager.UserManager;
import org.nuxeo.runtime.api.Framework;
import org.nuxeo.runtime.api.login.NuxeoLoginContext;
import org.nuxeo.runtime.kv.KeyValueService;
import org.nuxeo.runtime.transaction.TransactionHelper;

/** Background ZIP preparation and one-shot native delivery. Status never reads or claims the archive. */
public class DeliveryBulkService {
    private static final Logger log = LogManager.getLogger(DeliveryBulkService.class);

    public static final String STORE_NAME = "io.maretha.maretha-angular-webui.server.delivery.bulk";
    public static final String CATEGORY = STORE_NAME;
    protected static final String DOWNLOAD_REASON = "download";
    protected final DeliveryGrantStore grants;
    protected final DeliveryBulkStore jobs;

    protected record Candidate(String id, String relativeParent) { }
    protected record Captured(DeliveryBulkStore.Entry entry, Blob blob) { }

    public DeliveryBulkService() {
        this(new DeliveryGrantStore(Framework.getService(KeyValueService.class)
                .getKeyValueStore("io.maretha.maretha-angular-webui.server.delivery"), Clock.systemUTC(), new SecureRandom()));
    }
    public DeliveryBulkService(DeliveryGrantStore grants) { this.grants = grants; this.jobs = new DeliveryBulkStore(grants); }

    public DeliveryBulkStore.Created create(String cookie, String owner, String repository, List<String> ids,
            String filename) {
        DeliveryBulkStore.Created created = jobs.create(cookie, owner, repository, ids, filename);
        try {
            schedule(created.request().id());
        } catch (RuntimeException e) {
            jobs.finish(created.request().id(), "failed", "ZIP preparation could not be scheduled. Generate it again.");
            throw e;
        }
        return created;
    }

    protected void schedule(String id) {
        WorkManager manager = Framework.getService(WorkManager.class);
        if (!manager.isQueuingEnabled(manager.getCategoryQueueId(CATEGORY)))
            throw new DeliveryBulkStore.Limit("ZIP preparation is unavailable on this server.");
        manager.schedule(new DeliveryBulkWork(id), WorkManager.Scheduling.ENQUEUE, false);
    }

    public DeliveryBulkStore.Status status(String cookie, String id, String owner) {
        jobs.owned(cookie, id, owner, true);
        DeliveryBulkStore.Status status = jobs.status(id);
        if ("expired".equals(status.state())) removeArchive(id);
        return status;
    }

    public void cancel(String cookie, String id, String owner) {
        jobs.owned(cookie, id, owner, false);
        DeliveryBulkStore.Status status = jobs.finish(id, "cancelled", "ZIP preparation was cancelled.");
        if (!"consumed".equals(status.state())) removeArchive(id);
    }

    public DeliveryBulkStore.Created regenerate(String cookie, String id, String owner) {
        DeliveryBulkStore.Request request = jobs.owned(cookie, id, owner, true);
        DeliveryBulkStore.Status status = jobs.status(id);
        if ("queued".equals(status.state()) || "preparing".equals(status.state()))
            throw new DeliveryBulkStore.Limit("Cancel the current preparation before generating it again.");
        if ("ready".equals(status.state())) cancel(cookie, id, owner);
        return create(cookie, owner, request.repository(), request.documentIds(), request.filename());
    }

    public DeliveryGrantStore.Issued grant(String cookie, String id, String owner) {
        DeliveryBulkStore.Request request = jobs.owned(cookie, id, owner, true);
        if (!"ready".equals(jobs.status(id).state())) throw new DeliveryBulkStore.Stopped();
        archive(id); // Metadata/existence only; the native GET performs fresh checks for every source.
        if (!"ready".equals(jobs.status(id).state())) throw new DeliveryBulkStore.Stopped();
        return grants.mintBulk(cookie, owner, id, request.expiresAt());
    }

    /** The WorkManager may redeliver a work item; only a queued-to-preparing CAS owns preparation. */
    public void perform(String id, BooleanSupplier suspending) {
        if (!jobs.begin(id)) return;
        File temporary = null;
        boolean published = false;
        try {
            DeliveryBulkStore.Request request = jobs.request(id);
            Checkpoint checkpoint = new Checkpoint(id, suspending);
            List<Candidate> candidates = candidates(request, checkpoint);
            List<Captured> captured = new ArrayList<>();
            Set<String> names = new HashSet<>();
            long totalBytes = 0;
            for (Candidate candidate : candidates) {
                checkpoint.check(true);
                Captured source = capture(request, candidate, names);
                checkpoint.check(true);
                if (source == null) continue;
                totalBytes = Math.addExact(totalBytes, source.entry().length());
                if (captured.size() >= DeliveryBulkStore.MAX_ENTRIES || totalBytes > DeliveryBulkStore.MAX_BYTES)
                    throw new DeliveryBulkStore.Limit("ZIP downloads are limited to 5000 archive entries and 20 GiB of source data.");
                captured.add(source);
            }
            if (captured.isEmpty()) throw new DeliveryBulkStore.Limit("No downloadable files were found in this selection.");
            jobs.manifest(id, captured.stream().map(Captured::entry).toList());
            jobs.progress(id, 0, captured.size(), 0, totalBytes);
            temporary = Framework.createTempFile("maretha-bulk-", ".zip");
            MessageDigest digest = sha256();
            long copied = 0;
            int completed = 0;
            try (OutputStream file = Files.newOutputStream(temporary.toPath());
                    DigestOutputStream hashing = new DigestOutputStream(file, digest);
                    ZipOutputStream zip = new ZipOutputStream(hashing)) {
                byte[] buffer = new byte[64 * 1024];
                for (Captured source : captured) {
                    checkpoint.check(true);
                    validateEntry(request, source.entry(), source.blob(), null);
                    zip.putNextEntry(new ZipEntry(source.entry().archivePath()));
                    long entryBytes = 0;
                    try (InputStream input = source.blob().getStream()) {
                        int read;
                        while ((read = input.read(buffer)) != -1) {
                            checkpoint.check(false);
                            entryBytes += read;
                            if (entryBytes > source.entry().length())
                                throw new DeliveryBulkStore.Limit("A source file changed during preparation. Generate the ZIP again.");
                            zip.write(buffer, 0, read);
                            copied += read;
                            if (checkpoint.progressDue()) jobs.progress(id, completed, captured.size(), copied, totalBytes);
                        }
                    }
                    if (entryBytes != source.entry().length())
                        throw new DeliveryBulkStore.Limit("A source file changed during preparation. Generate the ZIP again.");
                    zip.closeEntry();
                    jobs.progress(id, ++completed, captured.size(), copied, totalBytes);
                }
            }
            checkpoint.check(true);
            FileBlob zip = new FileBlob(temporary, true);
            zip.setMimeType("application/zip");
            zip.setFilename(request.filename());
            zip.setDigest(HexFormat.of().formatHex(digest.digest()));
            zip.setDigestAlgorithm("SHA-256");
            long length = zip.getLength();
            withSession(request, session -> { validateContainers(session, request, zip); return null; });
            checkpoint.check(true);
            // The native store owns expiry and disk/blob-provider storage. Never call release before delivery.
            getTransientStore().putBlobs(id, List.of(zip));
            getTransientStore().setCompleted(id, true);
            checkpoint.check(true);
            published = jobs.ready(id, length, zip.getDigest());
            if (!published) removeArchive(id);
        } catch (DeliveryBulkStore.Stopped | DeliveryGrantStore.Denied e) {
            jobs.finish(id, "failed", "ZIP preparation ended because its session expired or was cancelled. Generate it again.");
        } catch (DeliveryBulkStore.Limit e) {
            jobs.finish(id, "failed", e.getMessage());
        } catch (IOException | RuntimeException e) {
            log.error("Bulk ZIP job {} failed", id, e);
            jobs.finish(id, "failed", "ZIP preparation failed. Check access and available storage, then generate it again.");
        } finally {
            try {
                if (!published) removeArchive(id);
            } finally {
                if (temporary != null) {
                    try { Files.deleteIfExists(temporary.toPath()); }
                    catch (IOException ignored) { Framework.trackFile(temporary, temporary); }
                }
            }
        }
    }

    protected List<Candidate> candidates(DeliveryBulkStore.Request request, Checkpoint checkpoint) {
        return withSession(request, session -> {
            Map<String, Candidate> candidates = new LinkedHashMap<>();
            Map<String, DeliveryBulkStore.Container> containers = new LinkedHashMap<>();
            java.util.ArrayDeque<Candidate> pending = new java.util.ArrayDeque<>();
            Set<String> queued = new HashSet<>();
            for (String id : request.documentIds()) { pending.add(new Candidate(id, "")); queued.add(id); }
            while (!pending.isEmpty()) {
                checkpoint.check(true);
                Candidate candidate = pending.removeFirst();
                String id = candidate.id();
                DocumentModel selected = readable(session, id);
                boolean collection = selected.hasFacet("Collection");
                if (!collection && !selected.hasFacet("Folderish")) {
                    candidates.putIfAbsent(id, candidate);
                    if (candidates.size() > DeliveryBulkStore.MAX_ENTRIES)
                        throw new DeliveryBulkStore.Limit("ZIP downloads are limited to 5000 selected or descendant files.");
                    continue;
                }
                String token = selected.getChangeToken();
                if (token == null) throw new DeliveryBulkStore.Limit("A selected container has no change token. Refresh it before creating a ZIP.");
                containers.put(id, new DeliveryBulkStore.Container(id, token));
                String root = selected.getPathAsString();
                String rootName = root.substring(root.lastIndexOf('/') + 1);
                String prefix = candidate.relativeParent() + rootName + "/";
                // IDs are validated before scheduling. Native query security filters unreadable descendants.
                String condition = collection ? "collectionMember:collectionIds/* = '" + id + "'"
                        : "ecm:ancestorId = '" + id + "' AND ecm:mixinType != 'Folderish'";
                // MongoDB (DBS) cannot project or order by ecm:path (QueryParseException from
                // DBSSession.convToInternal), so fetch documents and order in memory.
                String query = "SELECT * FROM Document WHERE " + condition
                        + " AND ecm:isTrashed = 0 AND ecm:isVersion = 0 AND ecm:mixinType != 'HiddenInNavigation'";
                long limit = DeliveryBulkStore.MAX_ENTRIES + DeliveryBulkStore.MAX_SELECTED + 1L;
                List<DocumentModel> children = new ArrayList<>(session.query(query, null, limit, 0, false));
                children.sort(java.util.Comparator.comparing(DocumentModel::getPathAsString,
                        java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder())));
                for (DocumentModel child : children) {
                    checkpoint.check(false);
                    String childId = child.getId();
                    String path = child.getPathAsString();
                    if (!queued.add(childId)) continue;
                    if (queued.size() > DeliveryBulkStore.MAX_ENTRIES + DeliveryBulkStore.MAX_SELECTED)
                        throw new DeliveryBulkStore.Limit("ZIP traversal is limited to 6000 documents including containers.");
                    String relativeParent = prefix;
                    if (!collection) {
                        if (path == null || !path.startsWith(root + "/")) throw new DeliveryBulkStore.Stopped();
                        relativeParent += path.substring(root.length() + 1, path.lastIndexOf('/') + 1);
                    }
                    pending.addLast(new Candidate(childId, relativeParent));
                }
            }
            jobs.containers(request.id(), List.copyOf(containers.values()));
            return List.copyOf(candidates.values());
        });
    }

    protected Captured capture(DeliveryBulkStore.Request request, Candidate candidate, Set<String> names) {
        return withSession(request, session -> {
            DocumentModel doc = readable(session, candidate.id());
            String before = doc.getChangeToken();
            Blob main = doc.hasSchema("file") ? getDownloadService().resolveBlob(doc, "file:content") : null;
            // Respect custom default download renditions (redaction/watermarking), even on File documents.
            Blob blob = getDownloadService().resolveBlob(doc);
            if (blob == null) return null;
            boolean persisted = main != null && blob.getDigest() != null && !blob.getDigest().isBlank()
                    && blob.getDigest().equals(main.getDigest()) && blob.getLength() == main.getLength()
                    && java.util.Objects.equals(blob.getMimeType(), main.getMimeType());
            String kind = persisted ? "persisted" : "virtual";
            String xpath = persisted ? "file:content" : null;
            if (!persisted && (before == null || !before.equals(doc.getChangeToken())))
                throw new DeliveryBulkStore.Limit("A generated rendition changed during preparation. Generate the ZIP again.");
            if (blob.getLength() < 0 || blob.getLength() > DeliveryBulkStore.MAX_BYTES)
                throw new DeliveryBulkStore.Limit("A source file has an unknown size or exceeds the 20 GiB ZIP limit.");
            if (!getDownloadService().checkPermission(doc, xpath, blob, DOWNLOAD_REASON, Map.of()))
                throw new DeliveryGrantStore.Denied();
            String filename = blob.getFilename() == null ? doc.getTitle() : blob.getFilename();
            String archivePath = uniquePath(candidate.relativeParent(), filename, names);
            return new Captured(new DeliveryBulkStore.Entry(doc.getId(), xpath, blob.getDigest(), blob.getLength(),
                    filename, kind, before, blob.getMimeType(), archivePath), blob);
        });
    }

    protected void validateManifest(DeliveryBulkStore.Request request, Blob archive, HttpServletRequest http) {
        withSession(request, session -> {
            validateContainers(session, request, archive);
            for (DeliveryBulkStore.Entry entry : jobs.manifest(request.id())) {
                Blob prepared = new ZipEntryBlob(archive, entry.archivePath());
                prepared.setFilename(entry.filename());
                prepared.setMimeType(entry.mimeType());
                validateEntry(session, entry, prepared, http);
            }
            return null;
        });
    }

    protected void validateEntry(DeliveryBulkStore.Request request, DeliveryBulkStore.Entry entry, Blob prepared,
            HttpServletRequest http) {
        withSession(request, session -> {
            validateEntry(session, entry, prepared, http);
            return null;
        });
    }

    protected void validateEntry(CloseableCoreSession session, DeliveryBulkStore.Entry entry, Blob prepared,
            HttpServletRequest http) {
        DocumentModel doc = readable(session, entry.documentId());
        Blob blob;
        if ("persisted".equals(entry.kind())) {
            blob = getDownloadService().resolveBlob(doc, entry.xpath());
            if (blob == null || !entry.digest().equals(blob.getDigest()) || entry.length() != blob.getLength())
                throw new DeliveryBulkStore.Limit("A source file changed. Generate the ZIP again.");
        } else {
            if (entry.changeToken() == null || !entry.changeToken().equals(doc.getChangeToken()))
                throw new DeliveryBulkStore.Limit("A source document changed. Generate the ZIP again.");
            blob = prepared;
        }
        if (!getDownloadService().checkPermission(doc, entry.xpath(), blob, DOWNLOAD_REASON, Map.of()))
            throw new DeliveryGrantStore.Denied();
        if (http != null && !"HEAD".equals(http.getMethod()))
            getDownloadService().logDownload(http, doc, entry.xpath(), entry.filename(), DOWNLOAD_REASON, Map.of());
    }

    protected void validateContainers(CloseableCoreSession session, DeliveryBulkStore.Request request, Blob archive) {
        for (DeliveryBulkStore.Container container : jobs.containers(request.id())) {
            DocumentModel doc = readable(session, container.documentId());
            if (container.changeToken() == null || !container.changeToken().equals(doc.getChangeToken()))
                throw new DeliveryBulkStore.Limit("A source folder or collection changed. Generate the ZIP again.");
            if (!getDownloadService().checkPermission(doc, null, archive, DOWNLOAD_REASON, Map.of()))
                throw new DeliveryGrantStore.Denied();
        }
    }

    public void deliver(DeliveryGrantStore.Grant grant, HttpServletRequest request, HttpServletResponse response) {
        String id = grant.bulkJobId();
        DeliveryBulkStore.Request job = jobs.request(id);
        if (!grant.owner().equals(job.owner()) || !grant.sessionKey().equals(job.sessionKey()))
            throw new DeliveryGrantStore.Denied();
        DeliveryBulkStore.Status status = jobs.status(id);
        if (!"ready".equals(status.state())) throw new DeliveryBulkStore.Stopped();
        Blob archive = archive(id);
        validateManifest(job, archive, request);
        // Expensive manifest validation must not bridge logout/cancel/expiry into a newly authorized stream.
        grants.requireSessionKey(grant.sessionKey(), grant.owner());
        if (grant.expiresAt() <= grants.clock.millis()) throw new DeliveryGrantStore.Denied();
        status = jobs.status(id);
        if (!"ready".equals(status.state())) throw new DeliveryBulkStore.Stopped();
        if ("HEAD".equals(request.getMethod())) {
            headers(request, response, job, status);
            return;
        }
        // This is the sole consuming operation. Status, grants and HEAD never claim a result.
        status = jobs.claim(id);
        headers(request, response, job, status);
        try {
            getDownloadService().transferBlobWithByteRange(archive, null, () -> {
                try { return response.getOutputStream(); }
                catch (IOException e) { throw new UncheckedIOException(e); }
            });
        } finally { removeArchive(id); }
    }

    protected void headers(HttpServletRequest request, HttpServletResponse response, DeliveryBulkStore.Request job,
            DeliveryBulkStore.Status status) {
        response.setStatus(200);
        response.setHeader("Accept-Ranges", "none");
        response.setContentType("application/zip");
        response.setContentLengthLong(status.zipLength());
        response.setHeader("ETag", '"' + status.zipDigest() + '"');
        response.setHeader("Content-Disposition", DownloadHelper.getRFC2231ContentDisposition(request, job.filename(), false));
    }

    protected Blob archive(String id) {
        DeliveryBulkStore.Status status = jobs.status(id);
        List<Blob> blobs = getTransientStore().getBlobs(id);
        if (blobs == null || blobs.size() != 1 || blobs.get(0).getLength() != status.zipLength()
                || !status.zipDigest().equals(blobs.get(0).getDigest())) {
            jobs.finish(id, "failed", "The prepared ZIP is no longer available. Generate it again.");
            throw new DeliveryBulkStore.Stopped();
        }
        return blobs.get(0);
    }

    protected DocumentModel readable(CloseableCoreSession session, String id) {
        IdRef ref = new IdRef(id);
        if (!session.hasPermission(ref, SecurityConstants.READ)) throw new DeliveryGrantStore.Denied();
        return session.getDocument(ref);
    }

    protected <T> T withSession(DeliveryBulkStore.Request request, Function<CloseableCoreSession, T> operation) {
        NuxeoPrincipal principal = getPrincipal(request.owner());
        if (principal == null || principal.isAnonymous() || principal.isTransient()
                || !request.owner().equals(principal.getName())) throw new DeliveryGrantStore.Denied();
        try (NuxeoLoginContext login = NuxeoLoginContext.create(principal)) {
            login.login();
            return inTransaction(() -> {
                try (CloseableCoreSession session = openSession(request.repository(), principal)) {
                    return operation.apply(session);
                }
            });
        }
    }

    protected <T> T inTransaction(java.util.function.Supplier<T> operation) { return TransactionHelper.runInTransaction(operation); }
    protected CloseableCoreSession openSession(String repository, NuxeoPrincipal principal) { return CoreInstance.openCoreSession(repository, principal); }
    protected NuxeoPrincipal getPrincipal(String owner) { return Framework.doPrivileged(() -> Framework.getService(UserManager.class).getPrincipal(owner)); }
    protected DownloadService getDownloadService() { return Framework.getService(DownloadService.class); }
    protected TransientStore getTransientStore() { return Framework.getService(TransientStoreService.class).getStore(STORE_NAME); }
    protected void removeArchive(String id) { getTransientStore().remove(id); }

    protected static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    protected static String leaf(String value) {
        String safe = Normalizer.normalize(value == null ? "download" : value, Normalizer.Form.NFC)
                .replaceAll("[\\\\/\\p{Cntrl}:]", "_").replace("..", "_").replaceAll("^[. ]+|[. ]+$", "");
        if (safe.isBlank()) safe = "download";
        return safe.length() > 180 ? safe.substring(0, 180) : safe;
    }

    protected static String uniquePath(String parent, String filename, Set<String> names) {
        StringBuilder prefix = new StringBuilder();
        for (String segment : parent.split("/")) if (!segment.isEmpty()) {
            String directory = leaf(segment);
            String original = directory;
            int suffix = 1;
            while (names.contains((prefix + directory).toLowerCase(Locale.ROOT))) directory = ++suffix + "-" + original;
            prefix.append(directory).append('/');
            names.add(prefix.toString().toLowerCase(Locale.ROOT));
        }
        String name = leaf(filename);
        String path = prefix + name;
        int suffix = 1;
        while (names.contains((path + "/").toLowerCase(Locale.ROOT)) || !names.add(path.toLowerCase(Locale.ROOT)))
            path = prefix + Integer.toString(++suffix) + "-" + name;
        return path;
    }

    protected class Checkpoint {
        protected final String id;
        protected final BooleanSupplier suspending;
        protected long lastCheck;
        protected long lastProgress;
        protected Checkpoint(String id, BooleanSupplier suspending) { this.id = id; this.suspending = suspending; }
        protected void check(boolean force) {
            long now = grants.clock.millis();
            if (Thread.currentThread().isInterrupted() || suspending.getAsBoolean()) throw new DeliveryBulkStore.Stopped();
            if (force || now - lastCheck >= 250) { jobs.checkpoint(id); lastCheck = now; }
        }
        protected boolean progressDue() {
            long now = grants.clock.millis();
            if (now - lastProgress < 250) return false;
            lastProgress = now;
            return true;
        }
    }
}
