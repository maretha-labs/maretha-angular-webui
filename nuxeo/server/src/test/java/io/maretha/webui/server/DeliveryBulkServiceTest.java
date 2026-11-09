package io.maretha.webui.server;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.Assert.*;
import static io.maretha.webui.server.DeliveryServletTest.proxy;
import static io.maretha.webui.server.DeliveryServletTest.principal;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.function.BiConsumer;
import java.util.zip.ZipInputStream;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.nuxeo.ecm.core.api.Blob;
import org.nuxeo.ecm.core.api.CloseableCoreSession;
import org.nuxeo.ecm.core.api.DocumentModel;
import org.nuxeo.ecm.core.api.DocumentNotFoundException;
import org.nuxeo.ecm.core.api.NuxeoPrincipal;
import org.nuxeo.ecm.core.api.impl.blob.ByteArrayBlob;
import org.nuxeo.ecm.core.api.impl.blob.FileBlob;
import org.nuxeo.ecm.core.io.download.DownloadService;
import org.nuxeo.ecm.core.io.download.DownloadServiceImpl;
import org.nuxeo.ecm.core.transientstore.SimpleTransientStore;
import org.nuxeo.ecm.core.transientstore.api.TransientStore;
import org.nuxeo.ecm.core.transientstore.api.TransientStoreConfig;
import org.nuxeo.runtime.test.runner.Features;
import org.nuxeo.runtime.test.runner.FeaturesRunner;
import org.nuxeo.runtime.test.runner.RuntimeFeature;

/** Real ZIP and native transfer behavior, with explicit repository and storage boundary doubles. */
@RunWith(FeaturesRunner.class)
@Features(RuntimeFeature.class)
public class DeliveryBulkServiceTest {
    protected final DeliveryGrantStoreTest.MutableClock clock = new DeliveryGrantStoreTest.MutableClock();
    protected final DeliveryGrantStoreTest.RaceStore backing = new DeliveryGrantStoreTest.RaceStore();
    protected final DeliveryGrantStore grants = new DeliveryGrantStore(backing, clock, new SecureRandom());
    protected final Harness service = new Harness();

    @After
    public void close() throws IOException {
        for (Path file : service.storedFiles) Files.deleteIfExists(file);
        backing.close();
    }

    protected DeliveryBulkStore.Created prepare(String... ids) {
        var created = service.create(null, "alice", "default", List.of(ids), "selection.zip");
        service.perform(created.request().id(), () -> false);
        return created;
    }

    protected void validateDownload(DeliveryBulkStore.Created job) {
        var issued = service.grant(job.cookie(), job.request().id(), "alice");
        var head = new DeliveryServletTest.Request("HEAD", "/content/" + issued.grant().id());
        service.deliver(issued.grant(), head.proxy(), new DeliveryServletTest.Response().proxy());
    }

    protected Doc document(String id, String filename, String content) {
        Doc doc = new Doc(id, filename, content);
        service.documents.put(id, doc);
        return doc;
    }

    @Test
    public void nativeTransientStoreRoundTripPreservesSha256AndActualZipContent() throws Exception {
        Path directory = Files.createTempDirectory("maretha-native-transient-");
        Path original = Files.createTempFile("maretha-native-archive-", ".zip");
        SimpleTransientStore nativeStore = new SimpleTransientStore();
        nativeStore.init(new TransientStoreConfig("bulk-roundtrip") {
            @Override public String getDataDir() { return directory.toString(); }
        });
        try {
            try (var zip = new java.util.zip.ZipOutputStream(Files.newOutputStream(original))) {
                zip.putNextEntry(new java.util.zip.ZipEntry("file.txt"));
                zip.write("native roundtrip".getBytes(UTF_8));
                zip.closeEntry();
            }
            byte[] expectedBytes = Files.readAllBytes(original);
            String expectedDigest = java.util.HexFormat.of().formatHex(
                    DeliveryBulkService.sha256().digest(expectedBytes));
            FileBlob archive = new FileBlob(original.toFile(), true);
            archive.setFilename("selection.zip");
            archive.setMimeType("application/zip");
            archive.setDigestAlgorithm("SHA-256");
            archive.setDigest(expectedDigest);
            assertEquals("SHA-256", archive.getDigestAlgorithm());
            nativeStore.putBlobs("job-id", List.of(archive));
            nativeStore.setCompleted("job-id", true);
            assertFalse("The native store owns the moved temporary file", Files.exists(original));
            List<Blob> restored = nativeStore.getBlobs("job-id");
            assertEquals(1, restored.size());
            Blob result = restored.get(0);
            assertEquals(expectedDigest, result.getDigest());
            assertEquals(expectedBytes.length, result.getLength());
            assertEquals("selection.zip", result.getFilename());
            assertEquals("application/zip", result.getMimeType());
            // Native transient metadata stores the digest, but does not persist its algorithm label.
            assertNull(result.getDigestAlgorithm());
            try (InputStream bytes = result.getStream()) {
                byte[] actual = bytes.readAllBytes();
                assertArrayEquals(expectedBytes, actual);
                assertEquals(expectedDigest, java.util.HexFormat.of().formatHex(
                        DeliveryBulkService.sha256().digest(actual)));
            }
            assertEquals(Map.of("file.txt", "native roundtrip"), unzip(result));
            assertTrue(nativeStore.isCompleted("job-id"));
            assertEquals(expectedDigest, nativeStore.getBlobs("job-id").get(0).getDigest());
            Path storedFile = result.getFile().toPath();
            nativeStore.remove("job-id");
            assertFalse(Files.exists(storedFile));
            assertFalse(nativeStore.exists("job-id"));
        } finally {
            nativeStore.remove("job-id");
            nativeStore.shutdown();
            Files.deleteIfExists(original);
            try (var paths = Files.walk(directory)) {
                for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
            }
        }
    }

    @Test
    public void preparesRealZipAndStatusAndDuplicateWorkNeverConsumeOrRemoveIt() throws Exception {
        document("one", "../unsafe.txt", "first");
        document("two", "../unsafe.txt", "second");
        var job = prepare("one", "two");
        String id = job.request().id();
        assertEquals("ready", service.jobs.status(id).state());
        assertEquals(2, unzip(service.archives.get(id)).size());
        Map<String, String> contents = unzip(service.archives.get(id));
        assertEquals(Set.of("first", "second"), Set.copyOf(contents.values()));
        assertTrue(contents.keySet().stream().noneMatch(name -> name.contains("..") || name.startsWith("/")));
        assertEquals(2, contents.keySet().stream().map(String::toLowerCase).distinct().count());
        int reads = service.archiveReads, removes = service.archiveRemoves;
        for (int i = 0; i < 3; i++) assertEquals("ready", service.status(job.cookie(), id, "alice").state());
        service.perform(id, () -> false);
        assertEquals(reads, service.archiveReads);
        assertEquals(removes, service.archiveRemoves);
        assertTrue(Files.exists(service.archives.get(id).getFile().toPath()));
        assertTrue(service.permissionChecks >= 4);
        assertNull("Scoped native login must be restored", NuxeoPrincipal.getCurrent());
    }

    @Test
    public void downloadRenditionIsPreservedInsteadOfExposingTheUnderlyingMainBlob() throws Exception {
        Doc doc = document("one", "original.txt", "unredacted original");
        doc.download = blob("redacted.txt", "redacted", "redacted-digest");
        var job = prepare("one");
        assertEquals("ready", service.jobs.status(job.request().id()).state());
        assertEquals(List.of("redacted"), new ArrayList<>(unzip(service.archives.get(job.request().id())).values()));
    }

    @Test
    public void cancellationDuringCopyClosesTheSourceAndPreventsPublication() {
        Doc doc = document("one", "large.bin", "placeholder");
        var job = service.create(null, "alice", "default", List.of("one"), "selection.zip");
        boolean[] closed = { false };
        byte[] content = new byte[256 * 1024];
        doc.main = doc.download = new ByteArrayBlob(content, "application/octet-stream") {
            @Override public InputStream getStream() {
                return new ByteArrayInputStream(content) {
                    @Override public synchronized int read(byte[] bytes, int offset, int length) {
                        int read = super.read(bytes, offset, length);
                        clock.advanceSeconds(1);
                        service.cancel(job.cookie(), job.request().id(), "alice");
                        return read;
                    }
                    @Override public void close() { closed[0] = true; }
                };
            }
        };
        doc.main.setDigest("large-digest");
        doc.main.setFilename("large.bin");
        service.perform(job.request().id(), () -> false);
        assertTrue(closed[0]);
        assertEquals("cancelled", service.jobs.status(job.request().id()).state());
        assertFalse(service.archives.containsKey(job.request().id()));
    }

    @Test
    public void cancellationAfterNativeStorePublicationCannotResurrectReady() {
        document("one", "file.txt", "body");
        var job = service.create(null, "alice", "default", List.of("one"), "selection.zip");
        service.afterPut = () -> service.cancel(job.cookie(), job.request().id(), "alice");
        service.perform(job.request().id(), () -> false);
        assertEquals("cancelled", service.jobs.status(job.request().id()).state());
        assertFalse(service.archives.containsKey(job.request().id()));
    }

    @Test
    public void freshAclPolicyDigestAndPrincipalAreRequiredAfterPreparation() {
        Doc doc = document("one", "file.txt", "body");
        var job = prepare("one");
        String id = job.request().id();
        doc.readable = false;
        assertThrows(DeliveryGrantStore.Denied.class, () -> validateDownload(job));
        doc.readable = true;
        doc.allowed = false;
        assertThrows(DeliveryGrantStore.Denied.class, () -> validateDownload(job));
        doc.allowed = true;
        doc.main.setDigest("changed");
        assertThrows(DeliveryBulkStore.Limit.class, () -> validateDownload(job));
        doc.main.setDigest("one-digest");
        service.freshPrincipal = null;
        assertThrows(DeliveryGrantStore.Denied.class, () -> validateDownload(job));
        service.freshPrincipal = principal("renamed-alice");
        assertThrows(DeliveryGrantStore.Denied.class, () -> validateDownload(job));
        assertEquals("ready", service.jobs.status(id).state());
        assertEquals(0, service.transfers);
    }

    @Test
    public void virtualRenditionUsesDocumentSnapshotAndStillRunsFreshDownloadPolicy() {
        Doc doc = document("note", "note.pdf", "generated PDF");
        doc.fileSchema = false;
        var job = prepare("note");
        String id = job.request().id();
        validateDownload(job);
        doc.token = "modified";
        assertThrows(DeliveryBulkStore.Limit.class, () -> validateDownload(job));
        doc.token = "initial";
        doc.allowed = false;
        assertThrows(DeliveryGrantStore.Denied.class, () -> validateDownload(job));
    }

    @Test
    public void virtualPolicyReceivesTheExactPreparedRenditionBytes() throws Exception {
        Doc doc = document("note", "note.pdf", "prepared snapshot");
        doc.fileSchema = false;
        var job = prepare("note");
        doc.download = blob("new-converter-output.pdf", "different regenerated bytes", "new-digest");
        List<String> policyBytes = new ArrayList<>();
        service.policyHook = (source, blob) -> {
            if (source.id.equals("note")) {
                try (InputStream input = blob.getStream()) { policyBytes.add(new String(input.readAllBytes(), UTF_8)); }
                catch (IOException e) { throw new UncheckedIOException(e); }
            }
        };
        validateDownload(job);
        assertEquals(List.of("prepared snapshot"), policyBytes);
    }

    @Test
    public void logoutDuringManifestValidationPreventsBothHeadAndClaim() {
        document("one", "file.txt", "body");
        for (String method : List.of("HEAD", "GET")) {
            var job = prepare("one");
            var issued = service.grant(job.cookie(), job.request().id(), "alice");
            service.policyHook = (doc, blob) -> grants.revokeSession(job.cookie(), "alice");
            var request = new DeliveryServletTest.Request(method, "/content/" + issued.grant().id());
            assertThrows(DeliveryGrantStore.Denied.class,
                    () -> service.deliver(issued.grant(), request.proxy(), new DeliveryServletTest.Response().proxy()));
            assertEquals(0, service.transfers);
            assertEquals("ready", service.jobs.status(job.request().id()).state());
            service.policyHook = null;
        }
    }

    @Test
    public void folderAndCollectionExpansionDeduplicateLeavesAndRevalidateTheirContainers() throws Exception {
        for (String facet : List.of("Folderish", "Collection")) {
            Doc container = document("container", "unused", "unused");
            container.facets = Set.of(facet);
            container.path = "/folder";
            document("one", "file.txt", "body");
            service.queryDocs = List.of("one");
            var job = prepare("container", "one");
            String id = job.request().id();
            assertEquals("ready", service.jobs.status(id).state());
            assertEquals(1, unzip(service.archives.get(id)).size());
            container.readable = false;
            assertThrows(DeliveryGrantStore.Denied.class, () -> validateDownload(job));
            container.readable = true;
            container.allowed = false;
            assertThrows(DeliveryGrantStore.Denied.class, () -> validateDownload(job));
            container.allowed = true;
            container.token = "membership changed";
            assertThrows(DeliveryBulkStore.Limit.class, () -> validateDownload(job));
        }
    }

    @Test
    public void archiveNamesCannotCollideWithExistingDirectoryPrefixes() {
        Set<String> names = new java.util.HashSet<>();
        String file = DeliveryBulkService.uniquePath("", "folder", names);
        String child = DeliveryBulkService.uniquePath("folder/", "child.txt", names);
        assertFalse("A file entry cannot also be a parent directory", child.startsWith(file + "/"));
        names.clear();
        child = DeliveryBulkService.uniquePath("folder/", "child.txt", names);
        file = DeliveryBulkService.uniquePath("", "folder", names);
        assertFalse("A parent directory cannot later become a file entry", child.startsWith(file + "/"));
    }

    @Test
    public void headDoesNotConsumeAndGetStreamsOnceEvenWhenRangeIsRequested() throws Exception {
        document("one", "file.txt", "body");
        var job = prepare("one");
        var issued = service.grant(job.cookie(), job.request().id(), "alice");
        var head = new DeliveryServletTest.Request("HEAD", "/content/" + issued.grant().id());
        var headResponse = new DeliveryServletTest.Response();
        service.deliver(issued.grant(), head.proxy(), headResponse.proxy());
        assertEquals("ready", service.jobs.status(job.request().id()).state());
        assertEquals(0, headResponse.bytes.size());
        assertEquals(0, service.transfers);
        var get = new DeliveryServletTest.Request("GET", head.path);
        get.headers.put("Range", "bytes=1-2");
        var response = new DeliveryServletTest.Response();
        service.deliver(issued.grant(), get.proxy(), response.proxy());
        assertEquals(200, response.status);
        assertEquals("none", response.headers.get("Accept-Ranges"));
        assertTrue(response.headers.get("Content-Disposition").startsWith("attachment"));
        assertEquals(Integer.toString(response.bytes.size()), response.headers.get("Content-Length"));
        assertEquals("consumed", service.jobs.status(job.request().id()).state());
        assertFalse(service.archives.containsKey(job.request().id()));
        assertThrows(DeliveryBulkStore.Stopped.class,
                () -> service.deliver(issued.grant(), get.proxy(), new DeliveryServletTest.Response().proxy()));
        assertEquals(1, service.transfers);
    }

    @Test
    public void failedNativeTransferStillConsumesAndRegenerationUsesCapturedSelection() {
        document("one", "file.txt", "body");
        var job = prepare("one");
        var issued = service.grant(job.cookie(), job.request().id(), "alice");
        service.failTransfer = true;
        var get = new DeliveryServletTest.Request("GET", "/content/" + issued.grant().id());
        assertThrows(UncheckedIOException.class,
                () -> service.deliver(issued.grant(), get.proxy(), new DeliveryServletTest.Response().proxy()));
        assertEquals("consumed", service.jobs.status(job.request().id()).state());
        assertFalse(service.archives.containsKey(job.request().id()));
        var regenerated = service.regenerate(job.cookie(), job.request().id(), "alice");
        assertNotEquals(job.request().id(), regenerated.request().id());
        assertEquals(job.request().documentIds(), regenerated.request().documentIds());
        assertEquals(job.request().repository(), regenerated.request().repository());
        assertEquals(job.request().filename(), regenerated.request().filename());
    }

    @Test
    public void missingArchiveFailsClosedAndExpiredStatusRemovesStoredBytes() {
        document("one", "file.txt", "body");
        var missing = prepare("one");
        service.archives.remove(missing.request().id());
        assertThrows(DeliveryBulkStore.Stopped.class,
                () -> service.grant(missing.cookie(), missing.request().id(), "alice"));
        assertEquals("failed", service.jobs.status(missing.request().id()).state());
        var expired = prepare("one");
        for (int i = 0; i < 9; i++) {
            clock.advanceSeconds(200);
            service.status(expired.cookie(), expired.request().id(), "alice");
        }
        assertEquals("expired", service.jobs.status(expired.request().id()).state());
        assertFalse(service.archives.containsKey(expired.request().id()));
    }

    @Test
    public void sourceSizeMismatchAndSuspensionCannotPublishAPartialZip() {
        Doc doc = document("one", "file.txt", "body");
        doc.main = doc.download = new ByteArrayBlob("longer-than-declared".getBytes(UTF_8), "text/plain") {
            @Override public long getLength() { return 1; }
        };
        doc.main.setDigest("one-digest");
        doc.main.setFilename("file.txt");
        var changed = prepare("one");
        assertEquals("failed", service.jobs.status(changed.request().id()).state());
        assertFalse(service.archives.containsKey(changed.request().id()));
        var suspended = service.create(null, "alice", "default", List.of("one"), "selection.zip");
        service.perform(suspended.request().id(), () -> true);
        assertEquals("failed", service.jobs.status(suspended.request().id()).state());
        assertFalse(service.archives.containsKey(suspended.request().id()));
    }

    protected static Map<String, String> unzip(Blob blob) throws IOException {
        Map<String, String> result = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(blob.getStream())) {
            java.util.zip.ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) result.put(entry.getName(), new String(zip.readAllBytes(), UTF_8));
        }
        return result;
    }

    protected static Blob blob(String name, String data, String digest) {
        Blob blob = new ByteArrayBlob(data.getBytes(UTF_8), "text/plain");
        blob.setFilename(name);
        blob.setDigest(digest);
        return blob;
    }

    protected static class Doc {
        protected final String id;
        protected String token = "initial", path;
        protected boolean readable = true, allowed = true, fileSchema = true, deleted;
        protected Set<String> facets = Set.of();
        protected Blob main, download;
        protected Doc(String id, String name, String content) {
            this.id = id;
            path = "/folder/" + id;
            main = download = blob(name, content, id + "-digest");
        }
        protected DocumentModel model() {
            return proxy(DocumentModel.class, (p, method, args) -> switch (method.getName()) {
                case "getId", "getName", "getTitle" -> id;
                case "getPathAsString" -> path;
                case "hasFacet" -> facets.contains(args[0]);
                case "hasSchema" -> fileSchema && "file".equals(args[0]);
                case "getChangeToken" -> token;
                case "isTrashed" -> false;
                case "getRef" -> new org.nuxeo.ecm.core.api.IdRef(id);
                default -> throw new AssertionError("Unexpected document call: " + method.getName());
            });
        }
    }

    protected class Harness extends DeliveryBulkService {
        protected final Map<String, Doc> documents = new LinkedHashMap<>();
        protected final Map<String, Blob> archives = new HashMap<>();
        protected final List<Path> storedFiles = new ArrayList<>();
        protected final List<String> scheduled = new ArrayList<>();
        protected NuxeoPrincipal freshPrincipal = principal("alice");
        protected int archiveReads, archiveRemoves, permissionChecks, transfers, sessions;
        protected boolean failTransfer;
        protected Runnable afterPut;
        protected BiConsumer<Doc, Blob> policyHook;
        protected List<String> queryDocs = List.of();
        protected Harness() { super(DeliveryBulkServiceTest.this.grants); }
        @Override protected void schedule(String id) { scheduled.add(id); }
        @Override protected NuxeoPrincipal getPrincipal(String owner) { return freshPrincipal; }
        @Override protected <T> T inTransaction(Supplier<T> operation) { return operation.get(); }
        @Override protected CloseableCoreSession openSession(String repository, NuxeoPrincipal principal) {
            assertEquals("default", repository);
            sessions++;
            return proxy(CloseableCoreSession.class, (p, method, args) -> {
                assertSame(freshPrincipal, NuxeoPrincipal.getCurrent());
                String id = args != null && args.length > 0 ? args[0].toString() : null;
                Doc doc = documents.get(id);
                return switch (method.getName()) {
                    case "hasPermission" -> doc != null && doc.readable;
                    case "getDocument" -> {
                        if (doc == null || doc.deleted) throw new DocumentNotFoundException("deleted");
                        yield doc.model();
                    }
                    case "getChangeToken" -> doc.token;
                    case "query" -> {
                        assertTrue("DBS-safe listing query: " + args[0], ((String) args[0]).startsWith("SELECT * FROM Document WHERE ") && !((String) args[0]).contains("ecm:path"));
                        var list = new org.nuxeo.ecm.core.api.impl.DocumentModelListImpl();
                        for (String docId : queryDocs) list.add(documents.get(docId).model());
                        yield list;
                    }
                    case "close" -> { sessions--; yield null; }
                    default -> throw new AssertionError("Unexpected session call: " + method.getName());
                };
            });
        }
        @Override protected DownloadService getDownloadService() {
            return proxy(DownloadService.class, (p, method, args) -> {
                if ("transferBlobWithByteRange".equals(method.getName())) {
                    assertEquals("Close repository sessions before native transfer", 0, sessions);
                    assertNull("Bulk GET must not issue a partial one-shot transfer", args[1]);
                    transfers++;
                    if (failTransfer) throw new UncheckedIOException(new IOException("simulated client disconnect"));
                    @SuppressWarnings("unchecked") Supplier<OutputStream> output = (Supplier<OutputStream>) args[2];
                    new DownloadServiceImpl().transferBlobWithByteRange((Blob) args[0], null, output);
                    return null;
                }
                assertSame(freshPrincipal, NuxeoPrincipal.getCurrent());
                DocumentModel document = (DocumentModel) args["logDownload".equals(method.getName()) ? 1 : 0];
                Doc doc = documents.get(document.getId());
                return switch (method.getName()) {
                    case "resolveBlob" -> args.length == 1 ? doc.download : doc.main;
                    case "checkPermission" -> {
                        permissionChecks++;
                        if (policyHook != null) policyHook.accept(doc, (Blob) args[2]);
                        yield doc.allowed;
                    }
                    case "logDownload" -> null;
                    default -> throw new AssertionError("No redirects or unreviewed native APIs: " + method.getName());
                };
            });
        }
        @Override protected TransientStore getTransientStore() {
            return proxy(TransientStore.class, (p, method, args) -> {
                String id = args[0].toString();
                return switch (method.getName()) {
                    case "putBlobs" -> {
                        @SuppressWarnings("unchecked") List<Blob> blobs = (List<Blob>) args[1];
                        assertEquals(1, blobs.size());
                        Blob blob = blobs.get(0);
                        Path destination = Files.createTempFile("maretha-bulk-stored-", ".zip");
                        storedFiles.add(destination);
                        if (blob instanceof FileBlob file && file.isTemporary()) file.moveTo(destination.toFile());
                        else blob.transferTo(destination.toFile());
                        archives.put(id, blob);
                        if (afterPut != null) { Runnable action = afterPut; afterPut = null; action.run(); }
                        yield null;
                    }
                    case "setCompleted" -> null;
                    case "getBlobs" -> { archiveReads++; yield archives.containsKey(id) ? List.of(archives.get(id)) : null; }
                    case "remove" -> {
                        archiveRemoves++;
                        Blob removed = archives.remove(id);
                        if (removed != null) Files.deleteIfExists(removed.getFile().toPath());
                        yield null;
                    }
                    default -> throw new AssertionError("Status must not consume or release native archives: " + method.getName());
                };
            });
        }
    }
}
