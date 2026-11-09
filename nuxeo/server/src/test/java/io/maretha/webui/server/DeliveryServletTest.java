package io.maretha.webui.server;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.After;
import org.junit.Test;
import org.nuxeo.ecm.core.api.Blob;
import org.nuxeo.ecm.core.api.CloseableCoreSession;
import org.nuxeo.ecm.core.api.DocumentModel;
import org.nuxeo.ecm.core.api.DocumentNotFoundException;
import org.nuxeo.ecm.core.api.NuxeoPrincipal;
import org.nuxeo.ecm.core.api.impl.blob.ByteArrayBlob;
import org.nuxeo.ecm.core.blob.ByteRange;
import org.nuxeo.ecm.core.io.download.DownloadService;
import org.nuxeo.ecm.core.io.download.DownloadServiceImpl;
import org.nuxeo.runtime.kv.MemKeyValueStore;

/** Servlet boundary tests retain the real scoped principal and Nuxeo range-transfer implementation. */
public class DeliveryServletTest {

    protected static final String DIGEST = "0123456789abcdef";
    protected static final byte[] BYTES = "0123456789".getBytes(UTF_8);
    protected static final DeliveryGrantStore.Target TARGET =
            new DeliveryGrantStore.Target("default", "document-id", "file:content", DIGEST);
    protected final MemKeyValueStore backing = new MemKeyValueStore();
    protected final DeliveryGrantStore store = new DeliveryGrantStore(backing, Clock.systemUTC(), new SecureRandom());
    protected final Harness servlet = new Harness();

    @After
    public void close() {
        backing.close();
        assertNull("The grant principal must not leak to the next request", NuxeoPrincipal.getCurrent());
    }

    @Test
    public void mintReturnsOnlyAnOpaqueUrlAndSetsAScopedSecureCookie() throws Exception {
        Response response = call(mint("file:content", "inline"));
        assertEquals(200, response.status);
        JsonNode result = response.json();
        assertEquals(3, result.size());
        assertTrue(result.path("id").asText().matches(DeliveryGrantStore.TOKEN_PATTERN));
        assertEquals("/nuxeo" + DeliveryServlet.BASE_PATH + "/content/" + result.path("id").asText(),
                result.path("url").asText());
        assertTrue(result.path("expiresAt").asLong() > System.currentTimeMillis());
        String cookie = response.headers.get("Set-Cookie");
        assertNotNull(cookie);
        assertTrue(cookie.contains("; Path=/nuxeo" + DeliveryServlet.BASE_PATH + "/;"));
        assertTrue(cookie.endsWith("; Max-Age=300; HttpOnly; Secure; SameSite=Strict"));
        assertFalse(response.text().contains("alice"));
        assertFalse(response.text().contains(DIGEST));
        assertEquals(1, servlet.permissionChecks);
        assertEquals(0, servlet.transfers);
    }

    @Test
    public void mutationsRequireOrdinaryAuthenticationAndExactHttpsOrigin() throws Exception {
        Request request = mint("file:content", "inline");
        request.principal = null;
        assertEquals(401, call(request).status);
        for (String origin : new String[] { "https://evil.test", "https://localhost:444", "http://localhost",
                "https://user@localhost", "https://localhost/", "https://localhost?x=1" }) {
            request = mint("file:content", "inline");
            request.headers.put("Origin", origin);
            assertEquals(origin, 403, call(request).status);
        }
        request = mint("file:content", "inline");
        request.headers.remove("Origin");
        assertEquals(403, call(request).status);
        request = mint("file:content", "inline");
        request.secure = false;
        assertEquals(400, call(request).status);
        assertEquals(0, servlet.permissionChecks);
    }

    @Test
    public void onlySupportedPersistedBlobPropertiesCanBeGranted() throws Exception {
        for (String xpath : new String[] { "file:content", "files:files/0/file", "files:files/12/file",
                "vid:transcodedVideos/0/content", "picture:views/1/content" }) {
            assertEquals(xpath, 200, call(mint(xpath, "inline")).status);
        }
        for (String xpath : new String[] { "blobholder:0", "custom:content", "file:other", "files:files/-1/file",
                "files:files/0/file/extra", "../file:content", "files:files/0", "files:files/01/file",
                "files:files/2147483648/file", "picture:views/999999999999999999999/content" }) {
            assertEquals(xpath, 400, call(mint(xpath, "inline")).status);
        }
    }

    @Test
    public void rejectsAmbiguousAndOversizedMutationPayloads() throws Exception {
        String valid = mint("file:content", "inline").body;
        for (String invalid : new String[] { valid + " {}", valid.replace("\"version\":1", "\"version\":4294967297"),
                valid.replace("\"version\":1", "\"version\":1,\"version\":1"),
                valid.replace("\"version\":1", "\"version\":\"1\""), "{}", "null" }) {
            Request request = mint("file:content", "inline");
            request.body = invalid;
            assertEquals(invalid, 400, call(request).status);
        }
        Request request = mint("file:content", "inline");
        request.body = " ".repeat(4097);
        assertEquals(413, call(request).status);
        request = mint("file:content", "inline");
        request.contentType = "text/plain";
        assertEquals(415, call(request).status);
    }

    @Test
    public void nativeContentNeedsTheMatchingBrowserSecretEvenForHead() throws Exception {
        var issued = issue();
        for (String method : new String[] { "GET", "HEAD" }) {
            Request request = content(issued, method);
            request.cookies = null;
            assertEquals(403, call(request).status);
            request = content(issued, method);
            request.cookies = new Cookie[] { new Cookie(DeliveryServlet.COOKIE_NAME, "A".repeat(43)) };
            assertEquals(403, call(request).status);
            request = content(issued, method);
            request.cookies = new Cookie[] { request.cookies[0], request.cookies[0] };
            assertEquals(403, call(request).status);
        }
        assertEquals(0, servlet.principalLookups);
        assertEquals(0, servlet.transfers);
    }

    @Test
    public void contentRejectsQueryOverridesAndEncodedOrDifferentApplicationRoutes() throws Exception {
        var issued = issue();
        Request request = content(issued, "GET");
        request.query = "inline=true";
        assertEquals(400, call(request).status);
        request = content(issued, "GET");
        request.rawUri = "/nuxeo" + DeliveryServlet.BASE_PATH + "/content/%41" + issued.grant().id().substring(1);
        assertEquals(400, call(request).status);
        request = content(issued, "GET");
        request.servletPath = "/other-app-delivery/v1";
        assertEquals(400, call(request).status);
        request = new Request("POST", "/grants");
        request.cookies = content(issued, "GET").cookies;
        request.principal = null;
        assertEquals("A delivery cookie must not authenticate a management route", 401, call(request).status);
    }

    @Test
    public void eachGetAndHeadRechecksTheFreshPrincipalAclDigestAndDownloadPolicy() throws Exception {
        var issued = issue();
        assertEquals(200, call(content(issued, "GET")).status);
        assertEquals(200, call(content(issued, "HEAD")).status);
        assertEquals(2, servlet.principalLookups);
        assertEquals(2, servlet.permissionChecks);
        servlet.readable = false;
        assertEquals(403, call(content(issued, "GET")).status);
        servlet.readable = true;
        servlet.downloadAllowed = false;
        assertEquals(403, call(content(issued, "HEAD")).status);
        servlet.downloadAllowed = true;
        servlet.blob.setDigest("changed");
        assertEquals(409, call(content(issued, "GET")).status);
        servlet.blob.setDigest(DIGEST);
        servlet.missingBlob = true;
        assertEquals(404, call(content(issued, "GET")).status);
        servlet.missingBlob = false;
        servlet.deleted = true;
        assertEquals(404, call(content(issued, "HEAD")).status);
        assertEquals(1, servlet.transfers);
    }

    @Test
    public void deletedOrRenamedPrincipalCannotUseAnOtherwiseLiveGrant() throws Exception {
        var issued = issue();
        servlet.freshPrincipal = null;
        assertEquals(403, call(content(issued, "GET")).status);
        servlet.freshPrincipal = principal("bob");
        assertEquals(403, call(content(issued, "HEAD")).status);
        assertEquals(0, servlet.transfers);
    }

    @Test
    public void inlineIsRestrictedToMediaAndAttachmentsCannotExecuteAsPages() throws Exception {
        servlet.blob.setMimeType("text/html");
        assertEquals(415, call(mint("file:content", "inline")).status);
        var issued = store.mint(null, "alice", TARGET, "attachment");
        Response response = call(content(issued, "GET"));
        assertEquals(200, response.status);
        assertTrue(response.headers.get("Content-Disposition").startsWith("attachment;"));
        assertEquals("nosniff", response.headers.get("X-Content-Type-Options"));
        assertEquals("sandbox; default-src 'none'", response.headers.get("Content-Security-Policy"));
        assertEquals("no-store", response.headers.get("Cache-Control"));
        assertEquals("no-referrer", response.headers.get("Referrer-Policy"));
        assertEquals("same-origin", response.headers.get("Cross-Origin-Resource-Policy"));
    }

    @Test
    public void nativeSingleRangesReturnExactBytesIncludingSuffixAndClampedEnds() throws Exception {
        var issued = issue();
        String[][] cases = { { "bytes=2-5", "2345", "bytes 2-5/10" },
                { "bytes=7-", "789", "bytes 7-9/10" }, { "bytes=-3", "789", "bytes 7-9/10" },
                { "bytes=7-999", "789", "bytes 7-9/10" }, { "bytes=-999", "0123456789", "bytes 0-9/10" } };
        for (String[] row : cases) {
            Request request = content(issued, "GET");
            request.headers.put("Range", row[0]);
            Response response = call(request);
            assertEquals(row[0], 206, response.status);
            assertEquals(row[1], response.text());
            assertEquals(row[2], response.headers.get("Content-Range"));
            assertEquals(Integer.toString(row[1].length()), response.headers.get("Content-Length"));
            assertNull(response.headers.get("Location"));
        }
    }

    @Test
    public void invalidAndUnsatisfiableSingleRangesNeverStream() throws Exception {
        var issued = issue();
        for (String range : new String[] { "bytes=10-", "bytes=8-2", "bytes=-0", "bytes=+1-2", "bytes=x-y",
                "bytes=9223372036854775808-", "bytes=" }) {
            Request request = content(issued, "GET");
            request.headers.put("Range", range);
            Response response = call(request);
            assertEquals(range, 416, response.status);
            assertEquals("bytes */10", response.headers.get("Content-Range"));
            assertEquals("", response.text());
        }
        assertEquals(0, servlet.transfers);
    }

    @Test
    public void headAndUnsupportedRangesHaveFullMetadataAndIfRangeRequiresExactStrongTag() throws Exception {
        var issued = issue();
        Request head = content(issued, "HEAD");
        head.headers.put("Range", "bytes=2-5");
        Response response = call(head);
        assertEquals(200, response.status);
        assertEquals("10", response.headers.get("Content-Length"));
        assertEquals("", response.text());
        assertEquals(0, servlet.transfers);
        for (String range : new String[] { "items=2-5", "bytes=0-1,5-6" }) {
            Request request = content(issued, "GET");
            request.headers.put("Range", range);
            assertEquals("0123456789", call(request).text());
        }
        for (String tag : new String[] { "\"old\"", "W/\"" + DIGEST + "\"", "Thu, 01 Jan 2026 00:00:00 GMT" }) {
            Request request = content(issued, "GET");
            request.headers.put("Range", "bytes=2-5");
            request.headers.put("If-Range", tag);
            response = call(request);
            assertEquals(200, response.status);
            assertEquals("0123456789", response.text());
        }
        Request request = content(issued, "GET");
        request.headers.put("Range", "bytes=2-5");
        request.headers.put("If-Range", "\"" + DIGEST + "\"");
        assertEquals(206, call(request).status);
    }

    @Test
    public void renewalRevalidatesAccessAndDoesNotChangeTheNativeUrl() throws Exception {
        var issued = issue();
        Request request = new Request("POST", "/grants/" + issued.grant().id() + "/renew");
        request.cookies = content(issued, "GET").cookies;
        request.body = "{\"version\":1}";
        Response response = call(request);
        assertEquals(200, response.status);
        assertEquals(issued.grant().id(), response.json().path("id").asText());
        servlet.downloadAllowed = false;
        assertEquals(403, call(request).status);
        servlet.downloadAllowed = true;
        servlet.blob.setDigest("changed");
        assertEquals(409, call(request).status);
        assertEquals(0, servlet.transfers);
    }

    @Test
    public void ownerBoundRevocationEndsNativeAccessAndLogoutExpiresTheCookie() throws Exception {
        var issued = issue();
        Request revoke = new Request("DELETE", "/grants/" + issued.grant().id());
        revoke.cookies = content(issued, "GET").cookies;
        revoke.principal = principal("bob");
        assertEquals(403, call(revoke).status);
        revoke.principal = principal("alice");
        assertEquals(204, call(revoke).status);
        assertEquals(403, call(content(issued, "GET")).status);
        issued = issue();
        Request logout = new Request("DELETE", "/session");
        logout.cookies = content(issued, "GET").cookies;
        Response response = call(logout);
        assertEquals(204, response.status);
        assertTrue(response.headers.get("Set-Cookie").contains("; Max-Age=0;"));
        assertEquals(403, call(content(issued, "HEAD")).status);
    }

    protected DeliveryGrantStore.Issued issue() {
        return store.mint(null, "alice", TARGET, "inline");
    }

    protected Request mint(String xpath, String disposition) {
        Request request = new Request("POST", "/grants");
        request.body = "{\"version\":1,\"target\":{\"repository\":\"default\",\"documentId\":\"document-id\","
                + "\"xpath\":\"" + xpath + "\",\"expectedDigest\":\"" + DIGEST + "\"},\"disposition\":\""
                + disposition + "\"}";
        return request;
    }

    protected Request content(DeliveryGrantStore.Issued issued, String method) {
        Request request = new Request(method, "/content/" + issued.grant().id());
        request.principal = null; // Native media requests have no ordinary REST authentication.
        request.cookies = new Cookie[] { new Cookie(DeliveryServlet.COOKIE_NAME, issued.cookie()) };
        return request;
    }

    protected Response call(Request request) throws IOException {
        Response response = new Response();
        servlet.service(request.proxy(), response.proxy());
        return response;
    }

    protected class Harness extends DeliveryServlet {
        private static final long serialVersionUID = 1L;
        protected NuxeoPrincipal freshPrincipal = principal("alice");
        protected final ByteArrayBlob blob = new ByteArrayBlob(BYTES, "video/mp4");
        protected boolean readable = true, downloadAllowed = true, missingBlob, deleted, sessionClosed, inOperation;
        protected int principalLookups, permissionChecks, transfers;
        protected final DocumentModel document = proxy(DocumentModel.class, (p, method, args) -> {
            throw new AssertionError("Unexpected document call: " + method.getName());
        });

        protected Harness() {
            blob.setDigest(DIGEST);
            blob.setFilename("movie.mp4");
        }

        @Override protected DeliveryGrantStore getStore() { return store; }
        @Override protected NuxeoPrincipal getPrincipal(String owner) { principalLookups++; return freshPrincipal; }
        @Override protected void inTransaction(Runnable operation) {
            inOperation = true;
            try { operation.run(); } finally { inOperation = false; }
        }

        @Override protected CloseableCoreSession openSession(String repository, NuxeoPrincipal principal) {
            assertEquals("default", repository);
            assertSame(freshPrincipal, principal);
            sessionClosed = false;
            return proxy(CloseableCoreSession.class, (p, method, args) -> {
                assertSame(freshPrincipal, NuxeoPrincipal.getCurrent());
                return switch (method.getName()) {
                    case "hasPermission" -> {
                        assertEquals("Read", args[1]);
                        if (deleted) throw new DocumentNotFoundException("deleted");
                        yield readable;
                    }
                    case "getDocument" -> document;
                    case "close" -> { sessionClosed = true; yield null; }
                    default -> throw new AssertionError("Unexpected session call: " + method.getName());
                };
            });
        }

        @Override protected DownloadService getDownloadService() {
            return proxy(DownloadService.class, (p, method, args) -> {
                switch (method.getName()) {
                    case "resolveBlob":
                        assertSame(freshPrincipal, NuxeoPrincipal.getCurrent());
                        return missingBlob ? null : blob;
                    case "checkPermission":
                        assertSame(freshPrincipal, NuxeoPrincipal.getCurrent());
                        assertSame(document, args[0]);
                        assertSame(blob, args[2]);
                        permissionChecks++;
                        return downloadAllowed;
                    case "logDownload":
                        assertSame(freshPrincipal, NuxeoPrincipal.getCurrent());
                        return null;
                    case "transferBlobWithByteRange":
                        assertTrue("Close the repository session before streaming", sessionClosed);
                        assertFalse("Complete the validation transaction operation before streaming", inOperation);
                        transfers++;
                        @SuppressWarnings("unchecked")
                        Supplier<OutputStream> output = (Supplier<OutputStream>) args[2];
                        new DownloadServiceImpl().transferBlobWithByteRange((Blob) args[0], (ByteRange) args[1], output);
                        return null;
                    default:
                        throw new AssertionError("Must not call redirecting download or other service APIs: " + method.getName());
                }
            });
        }
    }

    protected static NuxeoPrincipal principal(String name) {
        return proxy(NuxeoPrincipal.class, (p, method, args) -> switch (method.getName()) {
            case "getName", "toString" -> name;
            case "isAnonymous", "isTransient", "isAdministrator" -> false;
            case "hashCode" -> name.hashCode();
            case "equals" -> p == args[0];
            default -> throw new AssertionError("Unexpected principal call: " + method.getName());
        });
    }

    protected static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] { type }, handler));
    }

    protected static class Request {
        protected final String method, path;
        protected String servletPath = DeliveryServlet.BASE_PATH, query, rawUri, body = "", contentType = "application/json";
        protected boolean secure = true;
        protected NuxeoPrincipal principal = principal("alice");
        protected Cookie[] cookies;
        protected final Map<String, String> headers = new HashMap<>(Map.of("Origin", "https://localhost"));

        protected Request(String method, String path) { this.method = method; this.path = path; }

        protected HttpServletRequest proxy() {
            return DeliveryServletTest.proxy(HttpServletRequest.class, (p, called, args) -> switch (called.getName()) {
                case "getMethod" -> method;
                case "getPathInfo" -> path;
                case "getServletPath" -> servletPath;
                case "getContextPath" -> "/nuxeo";
                case "getRequestURI" -> rawUri == null ? "/nuxeo" + servletPath + path : rawUri;
                case "getQueryString" -> query;
                case "isSecure" -> secure;
                case "getUserPrincipal" -> principal;
                case "getCookies" -> cookies;
                case "getHeader" -> headers.get(args[0]);
                case "getServerName" -> "localhost";
                case "getServerPort" -> 443;
                case "getContentType" -> contentType;
                case "getInputStream" -> input(body.getBytes(UTF_8));
                case "getParameter" -> null;
                default -> throw new AssertionError("Unexpected request call: " + called.getName());
            });
        }
    }

    protected static class Response {
        protected int status = 200;
        protected final Map<String, String> headers = new HashMap<>();
        protected final ByteArrayOutputStream bytes = new ByteArrayOutputStream();

        protected String text() { return bytes.toString(UTF_8); }
        protected JsonNode json() throws IOException { return DeliveryServlet.JSON.readTree(bytes.toByteArray()); }

        protected HttpServletResponse proxy() {
            return DeliveryServletTest.proxy(HttpServletResponse.class, (p, called, args) -> {
                switch (called.getName()) {
                    case "setHeader", "addHeader": headers.put((String) args[0], (String) args[1]); return null;
                    case "setContentType": headers.put("Content-Type", (String) args[0]); return null;
                    case "setContentLengthLong": headers.put("Content-Length", args[0].toString()); return null;
                    case "setStatus", "sendError": status = (int) args[0]; return null;
                    case "getOutputStream": return new ServletOutputStream() {
                        @Override public boolean isReady() { return true; }
                        @Override public void setWriteListener(WriteListener listener) { }
                        @Override public void write(int value) { bytes.write(value); }
                    };
                    default: throw new AssertionError("Unexpected response call: " + called.getName());
                }
            });
        }
    }

    protected static ServletInputStream input(byte[] bytes) {
        return new ServletInputStream() {
            private final ByteArrayInputStream delegate = new ByteArrayInputStream(bytes);
            @Override public int read() { return delegate.read(); }
            @Override public boolean isFinished() { return delegate.available() == 0; }
            @Override public boolean isReady() { return true; }
            @Override public void setReadListener(ReadListener listener) { }
        };
    }
}
