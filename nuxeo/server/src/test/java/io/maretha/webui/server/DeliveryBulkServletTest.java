package io.maretha.webui.server;

import static org.junit.Assert.*;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.http.Cookie;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.nuxeo.runtime.test.runner.Features;
import org.nuxeo.runtime.test.runner.FeaturesRunner;
import org.nuxeo.runtime.test.runner.RuntimeFeature;

/** Real servlet dispatch and service lifecycle; HTTP and repository boundaries are explicit doubles. */
@RunWith(FeaturesRunner.class)
@Features(RuntimeFeature.class)
public class DeliveryBulkServletTest {
    protected final DeliveryBulkServiceTest support = new DeliveryBulkServiceTest();
    protected final DeliveryServlet servlet = new DeliveryServlet() {
        private static final long serialVersionUID = 1L;
        @Override protected DeliveryGrantStore getStore() { return support.grants; }
        @Override protected DeliveryBulkService getBulkService() { return support.service; }
    };

    @After
    public void close() throws IOException { support.close(); }

    protected DeliveryServletTest.Request create() {
        var request = new DeliveryServletTest.Request("POST", "/bulk-jobs");
        request.body = "{\"version\":1,\"repository\":\"default\",\"documentIds\":[\"one\"],\"filename\":\"selection.zip\"}";
        return request;
    }

    protected DeliveryServletTest.Request owned(String method, String suffix, DeliveryBulkStore.Created job) {
        var request = new DeliveryServletTest.Request(method, "/bulk-jobs/" + job.request().id() + suffix);
        request.body = "{\"version\":1}";
        request.cookies = new Cookie[] { new Cookie(DeliveryServlet.COOKIE_NAME, job.cookie()) };
        return request;
    }

    protected DeliveryServletTest.Response call(DeliveryServletTest.Request request) throws IOException {
        var response = new DeliveryServletTest.Response();
        servlet.service(request.proxy(), response.proxy());
        return response;
    }

    @Test
    public void preparationRequiresNormalAuthenticationHttpsAndMutationOrigin() throws Exception {
        var request = create();
        request.principal = null;
        assertEquals(401, call(request).status);
        request = create();
        request.secure = false;
        assertEquals(400, call(request).status);
        for (String origin : List.of("https://evil.example", "https://localhost.evil.example", "null")) {
            request = create();
            request.headers.put("Origin", origin);
            assertEquals(403, call(request).status);
        }
        request = create();
        request.headers.remove("Origin");
        assertEquals(403, call(request).status);
        assertTrue(support.service.scheduled.isEmpty());
    }

    @Test
    public void rejectsMalformedAmbiguousOversizedAndInjectedSelectionsBeforeScheduling() throws Exception {
        String valid = create().body;
        List<String> invalid = List.of(
                valid.replace("\"version\":1", "\"version\":1,\"version\":1"),
                valid + "{}",
                valid.replace("\"version\":1", "\"version\":4294967297"),
                valid.replace("[\"one\"]", "[]"),
                valid.replace("[\"one\"]", "[7]"),
                valid.replace("[\"one\"]", "[\"one' OR 1=1\"]"),
                valid.replace("\"default\"", "\"../repository\""),
                valid.replace("selection.zip", "../selection.zip"),
                valid.replace("[\"one\"]", "[" + String.join(",", java.util.Collections.nCopies(1001, "\"one\"")) + "]"));
        for (String body : invalid) {
            var request = create();
            request.body = body;
            assertEquals(400, call(request).status);
        }
        var large = create();
        large.body = " ".repeat(65537);
        assertEquals(413, call(large).status);
        var wrongType = create();
        wrongType.contentType = "text/plain";
        assertEquals(415, call(wrongType).status);
        assertTrue(support.service.scheduled.isEmpty());
    }

    @Test
    public void creationReturnsOnlyJsonMetadataAndBrowserBoundStatusNeverReadsTheArchive() throws Exception {
        var request = create();
        request.body = request.body.replace("[\"one\"]", "[\"one\",\"one\"]");
        var response = call(request);
        assertEquals(200, response.status);
        assertEquals("application/json", response.headers.get("Content-Type"));
        assertEquals("queued", response.json().path("state").asText());
        assertFalse(response.json().has("url"));
        assertFalse(response.json().has("zipDigest"));
        String id = response.json().path("id").asText();
        assertTrue(id.matches(DeliveryGrantStore.TOKEN_PATTERN));
        assertEquals(List.of("one"), support.service.jobs.request(id).documentIds());
        String setCookie = response.headers.get("Set-Cookie");
        assertTrue(setCookie.contains("Secure"));
        assertTrue(setCookie.contains("HttpOnly"));
        assertTrue(setCookie.contains("SameSite=Strict"));
        String cookie = setCookie.substring(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
        var status = new DeliveryServletTest.Request("GET", "/bulk-jobs/" + id);
        status.cookies = new Cookie[] { new Cookie(DeliveryServlet.COOKIE_NAME, cookie) };
        status.headers.remove("Origin");
        assertEquals(200, call(status).status);
        assertEquals(0, support.service.archiveReads);
        status.headers.put("Origin", "https://evil.example");
        assertEquals(403, call(status).status);
        status.headers.remove("Origin");
        status.principal = null;
        assertEquals(401, call(status).status);
        status.principal = DeliveryServletTest.principal("bob");
        assertEquals(403, call(status).status);
        status.principal = DeliveryServletTest.principal("alice");
        status.cookies = null;
        assertEquals(403, call(status).status);
    }

    @Test
    public void cancellationAndRegenerationRetainOwnershipAndCapturedInputs() throws Exception {
        var job = support.service.create(null, "alice", "default", List.of("one"), "selection.zip");
        assertEquals(400, call(owned("POST", "/regenerate", job)).status);
        var cancel = owned("DELETE", "", job);
        cancel.headers.remove("Origin");
        assertEquals(403, call(cancel).status);
        cancel.headers.put("Origin", "https://localhost");
        assertEquals(204, call(cancel).status);
        assertEquals("cancelled", call(owned("GET", "", job)).json().path("state").asText());
        var regenerated = call(owned("POST", "/regenerate", job));
        assertEquals(200, regenerated.status);
        String id = regenerated.json().path("id").asText();
        assertNotEquals(job.request().id(), id);
        assertEquals(job.request().documentIds(), support.service.jobs.request(id).documentIds());
        var otherBrowser = support.service.create(null, "alice", "default", List.of("one"), "selection.zip");
        var wrongBrowser = owned("DELETE", "", job);
        wrongBrowser.cookies = new Cookie[] { new Cookie(DeliveryServlet.COOKIE_NAME, otherBrowser.cookie()) };
        assertEquals(403, call(wrongBrowser).status);
    }

    @Test
    public void grantAllowsCookieOnlyNativeDeliveryButHeadDoesNotConsumeAndGetDoes() throws Exception {
        support.document("one", "file.txt", "native streamed body");
        var job = support.prepare("one");
        var granted = call(owned("POST", "/grant", job));
        assertEquals(200, granted.status);
        String id = granted.json().path("id").asText();
        assertEquals("/nuxeo" + DeliveryServlet.BASE_PATH + "/content/" + id,
                granted.json().path("url").asText());
        var content = new DeliveryServletTest.Request("HEAD", "/content/" + id);
        content.principal = null;
        content.cookies = new Cookie[] { new Cookie(DeliveryServlet.COOKIE_NAME, job.cookie()) };
        var head = call(content);
        assertEquals(200, head.status);
        assertEquals(0, head.bytes.size());
        assertEquals("ready", support.service.jobs.status(job.request().id()).state());
        var get = new DeliveryServletTest.Request("GET", content.path);
        get.principal = null;
        get.cookies = content.cookies;
        get.headers.put("Range", "bytes=1-2");
        var downloaded = call(get);
        assertEquals(200, downloaded.status);
        assertTrue(downloaded.bytes.size() > 2);
        assertEquals("none", downloaded.headers.get("Accept-Ranges"));
        assertEquals("no-store", downloaded.headers.get("Cache-Control"));
        assertEquals("nosniff", downloaded.headers.get("X-Content-Type-Options"));
        assertEquals("same-origin", downloaded.headers.get("Cross-Origin-Resource-Policy"));
        assertTrue(downloaded.headers.get("Content-Security-Policy").startsWith("sandbox"));
        assertEquals(409, call(get).status);
        assertEquals("consumed", call(owned("GET", "", job)).json().path("state").asText());
    }

    @Test
    public void grantCannotUseMediaRenewalAndRevokedCookieCannotStream() throws Exception {
        support.document("one", "file.txt", "body");
        var job = support.prepare("one");
        String id = call(owned("POST", "/grant", job)).json().path("id").asText();
        var renew = new DeliveryServletTest.Request("POST", "/grants/" + id + "/renew");
        renew.body = "{\"version\":1}";
        renew.cookies = new Cookie[] { new Cookie(DeliveryServlet.COOKIE_NAME, job.cookie()) };
        assertEquals(409, call(renew).status);
        support.grants.revokeSession(job.cookie(), "alice");
        var get = new DeliveryServletTest.Request("GET", "/content/" + id);
        get.principal = null;
        get.cookies = renew.cookies;
        assertEquals(403, call(get).status);
        assertEquals(0, support.service.transfers);
    }

    @Test
    public void queryOverridesAndAlternateRouteSpellingsCannotMutateJobs() throws Exception {
        var job = support.service.create(null, "alice", "default", List.of("one"), "selection.zip");
        var query = owned("DELETE", "", job);
        query.query = "other=job";
        assertEquals(400, call(query).status);
        var raw = owned("DELETE", "", job);
        raw.rawUri = "/nuxeo" + DeliveryServlet.BASE_PATH + "/bulk-jobs/%41";
        assertEquals(400, call(raw).status);
        var slash = owned("DELETE", "/", job);
        assertEquals(404, call(slash).status);
        assertEquals("queued", support.service.jobs.status(job.request().id()).state());
    }
}
