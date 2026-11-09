package io.maretha.webui.server;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Map;
import java.util.Set;
import java.util.List;
import java.util.ArrayList;
import java.util.function.BiConsumer;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.core.JsonParser;
import org.nuxeo.ecm.core.api.Blob;
import org.nuxeo.ecm.core.api.CoreInstance;
import org.nuxeo.ecm.core.api.CloseableCoreSession;
import org.nuxeo.ecm.core.api.DocumentModel;
import org.nuxeo.ecm.core.api.DocumentNotFoundException;
import org.nuxeo.ecm.core.api.DocumentSecurityException;
import org.nuxeo.ecm.core.api.IdRef;
import org.nuxeo.ecm.core.api.NuxeoPrincipal;
import org.nuxeo.ecm.core.api.security.SecurityConstants;
import org.nuxeo.ecm.core.blob.ByteRange;
import org.nuxeo.ecm.core.io.download.DownloadHelper;
import org.nuxeo.ecm.core.io.download.DownloadService;
import org.nuxeo.ecm.platform.usermanager.UserManager;
import org.nuxeo.runtime.api.Framework;
import org.nuxeo.runtime.api.login.NuxeoLoginContext;
import org.nuxeo.runtime.kv.KeyValueService;
import org.nuxeo.runtime.transaction.TransactionHelper;

/** Same-origin delivery only: its cookie is never a Nuxeo authentication credential. */
public class DeliveryServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    public static final String BASE_PATH = "/maretha-ui-maretha-angular-webui-delivery/v1";
    public static final String COOKIE_NAME = "MarethaDelivery_maretha-angular-webui";
    protected static final String REASON = "maretha-angular-webui.delivery";
    protected static final ObjectMapper JSON = new ObjectMapper()
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    protected volatile DeliveryGrantStore grants;
    protected volatile DeliveryBulkService bulk;

    @Override
    protected void service(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        try {
            String path = request.getPathInfo();
            if (!BASE_PATH.equals(request.getServletPath()) || path == null
                    || !request.getRequestURI().equals(request.getContextPath() + BASE_PATH + path)
                    || request.getQueryString() != null || !request.isSecure()) {
                throw new Failure(400);
            }
            String method = request.getMethod();
            if (path.equals("/bulk-jobs") || path.startsWith("/bulk-jobs/")) {
                bulk(request, response, path);
                return;
            }
            if (path.matches("/content/" + DeliveryGrantStore.TOKEN_PATTERN)
                    && ("GET".equals(method) || "HEAD".equals(method))) {
                content(request, response, path.substring("/content/".length()));
                return;
            }
            requireSameOrigin(request);
            String owner = authenticatedOwner(request);
            if ("POST".equals(method) && "/grants".equals(path)) {
                JsonNode body = body(request, Set.of("version", "target", "disposition"));
                JsonNode target = body.get("target");
                if (target == null || !target.isObject() || target.size() != 4
                        || !Set.of("repository", "documentId", "xpath", "expectedDigest").containsAll(fieldNames(target))) {
                    throw new Failure(400);
                }
                DeliveryGrantStore.Target resource = new DeliveryGrantStore.Target(text(target, "repository"),
                        text(target, "documentId"), text(target, "xpath"), text(target, "expectedDigest"));
                String disposition = text(body, "disposition");
                validate(resource, disposition);
                withTarget(owner, resource, disposition, (doc, blob) -> { });
                DeliveryGrantStore.Issued issued = getStore().mint(cookie(request), owner, resource, disposition);
                setCookie(request, response, issued.cookie(), DeliveryGrantStore.TTL_SECONDS);
                grantResponse(request, response, issued.grant());
            } else if ("POST".equals(method) && path.matches("/grants/" + DeliveryGrantStore.TOKEN_PATTERN + "/renew")) {
                body(request, Set.of("version"));
                String id = path.substring("/grants/".length(), path.length() - "/renew".length());
                String cookie = cookie(request);
                DeliveryGrantStore.Grant grant = getStore().requireOwned(cookie, id, owner);
                if (grant.bulkJobId() != null) throw new Failure(409);
                withTarget(owner, grant.target(), grant.disposition(), (doc, blob) -> { });
                grant = getStore().renew(cookie, id, owner);
                setCookie(request, response, cookie, DeliveryGrantStore.TTL_SECONDS);
                grantResponse(request, response, grant);
            } else if ("DELETE".equals(method) && path.matches("/grants/" + DeliveryGrantStore.TOKEN_PATTERN)) {
                getStore().revoke(cookie(request), path.substring("/grants/".length()), owner);
                response.setStatus(204);
            } else if ("DELETE".equals(method) && "/session".equals(path)) {
                getStore().revokeSession(cookie(request), owner);
                setCookie(request, response, "", 0);
                response.setStatus(204);
            } else {
                throw new Failure(404);
            }
        } catch (DeliveryGrantStore.Denied | SecurityException e) {
            response.sendError(403);
        } catch (DeliveryBulkStore.Limit e) {
            error(response, 400, e.getMessage());
        } catch (DeliveryBulkStore.Stopped e) {
            error(response, 409, "This ZIP is not ready or was already consumed. Generate it again.");
        } catch (DocumentSecurityException e) {
            response.sendError(403);
        } catch (DocumentNotFoundException e) {
            response.sendError(404);
        } catch (Failure e) {
            response.sendError(e.status);
        } catch (UncheckedIOException e) {
            throw e.getCause();
        }
    }

    protected void content(HttpServletRequest request, HttpServletResponse response, String id) {
        DeliveryGrantStore.Grant grant = getStore().require(cookie(request), id);
        if (grant.bulkJobId() != null) {
            getBulkService().deliver(grant, request, response);
            return;
        }
        Blob[] body = new Blob[1];
        ByteRange[] byteRange = new ByteRange[1];
        withTarget(grant.owner(), grant.target(), grant.disposition(), (doc, blob) -> {
            long length = blob.getLength();
            if (length < 0) {
                throw new Failure(409);
            }
            String etag = '"' + grant.target().expectedDigest() + '"';
            String requested = request.getHeader("Range");
            // RFC 9110: Range applies only to GET. Unsupported units/multiple ranges are ignored.
            if (!"GET".equals(request.getMethod()) || (requested != null
                    && (!requested.startsWith("bytes=") || requested.contains(",")))) {
                requested = null;
            }
            String ifRange = request.getHeader("If-Range");
            ByteRange range = requested == null || (ifRange != null && !etag.equals(ifRange))
                    ? null : parseRange(requested, length);
            response.setHeader("ETag", etag);
            response.setHeader("Accept-Ranges", "bytes");
            if (requested != null && (ifRange == null || etag.equals(ifRange)) && range == null) {
                response.setHeader("Content-Range", "bytes */" + length);
                throw new Failure(416);
            }
            response.setStatus(range == null ? 200 : 206);
            if (range != null) {
                response.setHeader("Content-Range", "bytes " + range.getStart() + "-" + range.getEnd() + "/" + length);
            }
            response.setContentLengthLong(range == null ? length : range.getLength());
            String type = DownloadHelper.getContentTypeHeader(blob);
            response.setContentType(type == null ? "application/octet-stream" : type);
            String filename = blob.getFilename() == null ? "download" : blob.getFilename();
            response.setHeader("Content-Disposition", DownloadHelper.getRFC2231ContentDisposition(request, filename,
                    "inline".equals(grant.disposition())));
            if ("HEAD".equals(request.getMethod())) {
                return;
            }
            DownloadService download = getDownloadService();
            if (range == null || range.getStart() == 0) {
                download.logDownload(request, doc, grant.target().xpath(), filename, REASON, Map.of());
            }
            body[0] = blob;
            byteRange[0] = range;
        });
        if (body[0] != null) {
            // Release the repository transaction/session before potentially long IO. Never invoke redirect resolvers.
            getDownloadService().transferBlobWithByteRange(body[0], byteRange[0], () -> {
                try {
                    return response.getOutputStream();
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        }
    }

    protected void withTarget(String owner, DeliveryGrantStore.Target target, String disposition,
            BiConsumer<DocumentModel, Blob> action) {
        NuxeoPrincipal principal = getPrincipal(owner);
        if (principal == null || principal.isAnonymous() || principal.isTransient() || !owner.equals(principal.getName())) {
            throw new DeliveryGrantStore.Denied();
        }
        try (NuxeoLoginContext login = NuxeoLoginContext.create(principal)) {
            login.login();
            inTransaction(() -> {
                try (CloseableCoreSession session = openSession(target.repository(), principal)) {
                    IdRef ref = new IdRef(target.documentId());
                    if (!session.hasPermission(ref, SecurityConstants.READ)) {
                        throw new DeliveryGrantStore.Denied();
                    }
                    DocumentModel doc = session.getDocument(ref);
                    Blob blob = getDownloadService().resolveBlob(doc, target.xpath());
                    if (blob == null) {
                        throw new Failure(404);
                    }
                    if (!target.expectedDigest().equals(blob.getDigest())) {
                        throw new Failure(409);
                    }
                    String mime = blob.getMimeType();
                    if ("inline".equals(disposition) && (mime == null
                            || !(mime.startsWith("audio/") || mime.startsWith("video/")))) {
                        throw new Failure(415);
                    }
                    if (!getDownloadService().checkPermission(doc, target.xpath(), blob, REASON, Map.of())) {
                        throw new DeliveryGrantStore.Denied();
                    }
                    action.accept(doc, blob);
                }
            });
        }
    }

    protected void inTransaction(Runnable operation) {
        TransactionHelper.runInTransaction(operation);
    }

    protected CloseableCoreSession openSession(String repository, NuxeoPrincipal principal) {
        return CoreInstance.openCoreSession(repository, principal);
    }

    protected NuxeoPrincipal getPrincipal(String owner) {
        return Framework.doPrivileged(() -> Framework.getService(UserManager.class).getPrincipal(owner));
    }

    protected DownloadService getDownloadService() {
        return Framework.getService(DownloadService.class);
    }

    protected DeliveryGrantStore getStore() {
        if (grants == null) {
            synchronized (this) {
                if (grants == null) {
                    grants = new DeliveryGrantStore(Framework.getService(KeyValueService.class)
                            .getKeyValueStore("io.maretha.maretha-angular-webui.server.delivery"), Clock.systemUTC(), new SecureRandom());
                }
            }
        }
        return grants;
    }

    protected String authenticatedOwner(HttpServletRequest request) {
        if (!(request.getUserPrincipal() instanceof NuxeoPrincipal principal) || principal.isAnonymous()
                || principal.isTransient()) {
            throw new Failure(401);
        }
        return principal.getName();
    }

    protected void requireSameOrigin(HttpServletRequest request) {
        try {
            URI origin = URI.create(request.getHeader("Origin"));
            int port = origin.getPort() == -1 ? 443 : origin.getPort();
            if (!"https".equals(origin.getScheme()) || origin.getRawUserInfo() != null
                    || origin.getRawQuery() != null || origin.getRawFragment() != null
                    || (origin.getRawPath() != null && !origin.getRawPath().isEmpty())
                    || !request.getServerName().equalsIgnoreCase(origin.getHost()) || port != request.getServerPort()) {
                throw new Failure(403);
            }
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new Failure(403);
        }
    }

    protected JsonNode body(HttpServletRequest request, Set<String> fields) throws IOException {
        return body(request, fields, 4096);
    }

    protected JsonNode body(HttpServletRequest request, Set<String> fields, int limit) throws IOException {
        if (request.getContentType() == null || !request.getContentType().split(";", 2)[0].trim().equals("application/json")) {
            throw new Failure(415);
        }
        byte[] bytes = request.getInputStream().readNBytes(limit + 1);
        if (bytes.length > limit) {
            throw new Failure(413);
        }
        JsonNode node;
        try {
            node = JSON.readTree(bytes);
        } catch (IOException e) {
            throw new Failure(400);
        }
        if (node == null || !node.isObject() || node.size() != fields.size() || !fields.equals(fieldNames(node))
                || !node.path("version").isIntegralNumber() || !node.path("version").canConvertToInt()
                || node.path("version").intValue() != 1) {
            throw new Failure(400);
        }
        return node;
    }

    protected void bulk(HttpServletRequest request, HttpServletResponse response, String path) throws IOException {
        String method = request.getMethod();
        boolean status = "GET".equals(method) && path.matches("/bulk-jobs/" + DeliveryGrantStore.TOKEN_PATTERN);
        if (!status || request.getHeader("Origin") != null) requireSameOrigin(request);
        String owner = authenticatedOwner(request);
        String cookie = cookie(request);
        if ("POST".equals(method) && "/bulk-jobs".equals(path)) {
            JsonNode payload = body(request, Set.of("version", "repository", "documentIds", "filename"), 65536);
            String repository = text(payload, "repository");
            String filename = text(payload, "filename");
            JsonNode selected = payload.get("documentIds");
            if (!repository.matches("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}") || selected == null || !selected.isArray()
                    || selected.isEmpty() || selected.size() > DeliveryBulkStore.MAX_SELECTED
                    || filename.isBlank() || filename.length() > 180
                    || java.util.regex.Pattern.compile("[\\\\/\\p{Cntrl}]").matcher(filename).find())
                throw new DeliveryBulkStore.Limit("Select between 1 and 1000 documents and a valid ZIP filename.");
            List<String> ids = new ArrayList<>();
            for (JsonNode selectedId : selected) {
                if (!selectedId.isTextual() || !selectedId.textValue().matches("[A-Za-z0-9][A-Za-z0-9_-]{0,127}"))
                    throw new DeliveryBulkStore.Limit("The document selection contains an invalid identifier.");
                if (!ids.contains(selectedId.textValue())) ids.add(selectedId.textValue());
            }
            DeliveryBulkStore.Created created = getBulkService().create(cookie, owner, repository, ids,
                    filename.toLowerCase(java.util.Locale.ROOT).endsWith(".zip") ? filename : filename + ".zip");
            setCookie(request, response, created.cookie(), DeliveryGrantStore.TTL_SECONDS);
            jobResponse(response, created.status());
            return;
        }
        String[] parts = path.split("/", -1);
        if (parts.length < 3 || !parts[2].matches(DeliveryGrantStore.TOKEN_PATTERN)) throw new Failure(404);
        String id = parts[2];
        if (status) {
            DeliveryBulkStore.Status job = getBulkService().status(cookie, id, owner);
            setCookie(request, response, cookie, DeliveryGrantStore.TTL_SECONDS);
            jobResponse(response, job);
        } else if ("DELETE".equals(method) && parts.length == 3) {
            getBulkService().cancel(cookie, id, owner);
            response.setStatus(204);
        } else if ("POST".equals(method) && parts.length == 4 && "grant".equals(parts[3])) {
            body(request, Set.of("version"));
            DeliveryGrantStore.Issued issued = getBulkService().grant(cookie, id, owner);
            setCookie(request, response, issued.cookie(), DeliveryGrantStore.TTL_SECONDS);
            grantResponse(request, response, issued.grant());
        } else if ("POST".equals(method) && parts.length == 4 && "regenerate".equals(parts[3])) {
            body(request, Set.of("version"));
            DeliveryBulkStore.Created created = getBulkService().regenerate(cookie, id, owner);
            setCookie(request, response, created.cookie(), DeliveryGrantStore.TTL_SECONDS);
            jobResponse(response, created.status());
        } else throw new Failure(404);
    }

    protected DeliveryBulkService getBulkService() {
        if (bulk == null) {
            synchronized (this) { if (bulk == null) bulk = new DeliveryBulkService(getStore()); }
        }
        return bulk;
    }

    protected void jobResponse(HttpServletResponse response, DeliveryBulkStore.Status status) throws IOException {
        response.setStatus(200);
        response.setContentType("application/json");
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("id", status.id()); result.put("state", status.state());
        result.put("completed", status.completed()); result.put("total", status.total());
        result.put("bytesProcessed", status.bytesProcessed()); result.put("totalBytes", status.totalBytes());
        result.put("expiresAt", status.expiresAt()); result.put("error", status.error());
        JSON.writeValue(response.getOutputStream(), result);
    }

    protected void error(HttpServletResponse response, int code, String message) throws IOException {
        response.setStatus(code);
        response.setContentType("application/json");
        JSON.writeValue(response.getOutputStream(), Map.of("error", message));
    }

    protected static Set<String> fieldNames(JsonNode node) {
        Set<String> names = new java.util.HashSet<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    protected String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual()) {
            throw new Failure(400);
        }
        return value.textValue();
    }

    protected void validate(DeliveryGrantStore.Target target, String disposition) {
        if (!target.repository().matches("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")
                || !target.documentId().matches("[A-Za-z0-9][A-Za-z0-9_-]{0,127}")
                || !target.xpath().matches("(?:file:content|files:files/(?:0|[1-9][0-9]*)/file"
                        + "|vid:transcodedVideos/(?:0|[1-9][0-9]*)/content|picture:views/(?:0|[1-9][0-9]*)/content)")
                || target.xpath().length() > 256 || !target.expectedDigest().matches("[A-Za-z0-9._:-]{1,256}")
                || !("inline".equals(disposition) || "attachment".equals(disposition))) {
            throw new Failure(400);
        }
        String[] parts = target.xpath().split("/");
        if (parts.length == 3) {
            try {
                Integer.parseInt(parts[1]);
            } catch (NumberFormatException e) {
                throw new Failure(400);
            }
        }
    }

    protected String cookie(HttpServletRequest request) {
        String value = null;
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if (COOKIE_NAME.equals(cookie.getName())) {
                    if (value != null) {
                        throw new DeliveryGrantStore.Denied();
                    }
                    value = cookie.getValue();
                }
            }
        }
        return value;
    }

    protected void setCookie(HttpServletRequest request, HttpServletResponse response, String value, long seconds) {
        response.addHeader("Set-Cookie", COOKIE_NAME + "=" + value + "; Path=" + request.getContextPath() + BASE_PATH
                + "/; Max-Age=" + seconds + "; HttpOnly; Secure; SameSite=Strict");
    }

    protected void grantResponse(HttpServletRequest request, HttpServletResponse response, DeliveryGrantStore.Grant grant)
            throws IOException {
        response.setStatus(200);
        response.setContentType("application/json");
        JSON.writeValue(response.getOutputStream(), Map.of("id", grant.id(), "url",
                request.getContextPath() + BASE_PATH + "/content/" + grant.id(), "expiresAt", grant.expiresAt()));
    }

    /** One range, including suffix/open-ended ranges. Invalid or unsatisfiable requests are 416. */
    protected ByteRange parseRange(String header, long length) {
        if (length <= 0 || !header.matches("bytes=(?:[0-9]+-[0-9]*|-[0-9]+)")) {
            return null;
        }
        ByteRange range = DownloadHelper.parseRange(header, length);
        if (range == null || range.getStart() < 0 || range.getStart() >= length || range.getEnd() < range.getStart()) {
            return null;
        }
        return ByteRange.inclusive(range.getStart(), Math.min(range.getEnd(), length - 1));
    }

    protected static class Failure extends RuntimeException {
        private static final long serialVersionUID = 1L;
        protected final int status;
        protected Failure(int status) { this.status = status; }
    }
}
