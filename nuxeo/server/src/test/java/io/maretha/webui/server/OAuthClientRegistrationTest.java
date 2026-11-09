package io.maretha.webui.server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.Test;
import org.nuxeo.ecm.core.api.DocumentModel;
import org.nuxeo.ecm.core.api.impl.DocumentModelListImpl;
import org.nuxeo.ecm.directory.Session;

public class OAuthClientRegistrationTest {

    @Test
    public void redirectUriFollowsTheConfiguredUiUrlOrNuxeoUrl() {
        assertEquals("https://demo.example/nuxeo/ng/#",
                OAuthClientRegistration.redirectUri(" https://demo.example/nuxeo/ng ", "https://ignored/nuxeo"));
        assertEquals("https://demo.example/nuxeo/ng/#",
                OAuthClientRegistration.redirectUri(null, "https://demo.example/nuxeo//"));
        assertEquals("https://demo.example/nuxeo/ng/#",
                OAuthClientRegistration.redirectUri(" ", "https://demo.example/nuxeo"));
        assertNull(OAuthClientRegistration.redirectUri(null, ""));
    }

    @Test
    public void createsAPublicAutoGrantedClientWhenMissing() {
        FakeDirectory directory = new FakeDirectory(null);
        OAuthClientRegistration.register(directory.session(), "https://demo.example/nuxeo/ng/#");
        assertEquals(1, directory.created.size());
        Map<String, Object> entry = directory.created.get(0);
        assertEquals("maretha-angular-webui", entry.get("clientId"));
        assertEquals("https://demo.example/nuxeo/ng/#", entry.get("redirectURIs"));
        assertEquals(Boolean.TRUE, entry.get("autoGrant"));
        assertEquals(Boolean.TRUE, entry.get("enabled"));
        assertNull(entry.get("clientSecret"));
        assertEquals(0, directory.updates);
    }

    @Test
    public void keepsAnExistingClientAndOnlyAddsAMissingRedirectUri() {
        FakeDirectory directory = new FakeDirectory("https://old.example/nuxeo/ng/#");
        OAuthClientRegistration.register(directory.session(), "https://demo.example/nuxeo/ng/#");
        assertEquals("https://old.example/nuxeo/ng/#,https://demo.example/nuxeo/ng/#",
                directory.redirects);
        assertEquals(1, directory.updates);

        OAuthClientRegistration.register(directory.session(), "https://demo.example/nuxeo/ng/#");
        assertEquals(1, directory.updates);
        assertTrue(directory.created.isEmpty());
    }

    /** One-entry oauth2Clients directory; null redirects means the client does not exist. */
    static class FakeDirectory {

        final List<Map<String, Object>> created = new ArrayList<>();

        String redirects;

        int updates;

        final boolean exists;

        FakeDirectory(String redirects) {
            this.redirects = redirects;
            this.exists = redirects != null;
        }

        Session session() {
            DocumentModel entry = (DocumentModel) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[] { DocumentModel.class }, (proxy, method, args) -> switch (method.getName()) {
                        case "getProperty" -> redirects;
                        case "setProperty" -> {
                            assertEquals("oauth2Client", args[0]);
                            assertEquals("redirectURIs", args[1]);
                            redirects = (String) args[2];
                            yield null;
                        }
                        default -> throw new AssertionError(method.getName());
                    });
            return (Session) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] { Session.class },
                    (proxy, method, args) -> switch (method.getName()) {
                        case "query" -> {
                            assertEquals(Map.of("clientId", "maretha-angular-webui"), args[0]);
                            DocumentModelListImpl list = new DocumentModelListImpl();
                            if (exists) {
                                list.add(entry);
                            }
                            yield list;
                        }
                        case "createEntry" -> {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> map = new HashMap<>((Map<String, Object>) args[0]);
                            created.add(map);
                            yield null;
                        }
                        case "updateEntry" -> {
                            updates++;
                            yield null;
                        }
                        default -> throw new AssertionError(method.getName());
                    });
        }
    }
}
