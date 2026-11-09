package io.maretha.webui.server;

import java.io.Serializable;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.nuxeo.ecm.core.api.DocumentModel;
import org.nuxeo.ecm.core.api.DocumentModelList;
import org.nuxeo.ecm.directory.Session;
import org.nuxeo.ecm.directory.api.DirectoryService;
import org.nuxeo.ecm.platform.oauth2.clients.OAuth2Client;
import org.nuxeo.runtime.api.Framework;
import org.nuxeo.runtime.cluster.ClusterService;
import org.nuxeo.runtime.model.ComponentContext;
import org.nuxeo.runtime.model.DefaultComponent;
import org.nuxeo.runtime.transaction.TransactionHelper;

/**
 * Registers the UI's public OAuth2 client (authorization code, no secret) at startup. The redirect URI is the UI
 * URL from {@value #URL_PROPERTY}, or {@code nuxeo.url} + {@code /ng/}, followed by the route the UI's env.js sends.
 * An existing client keeps its administrator's settings; only a missing redirect URI is added.
 */
public class OAuthClientRegistration extends DefaultComponent {

    private static final Logger log = LogManager.getLogger(OAuthClientRegistration.class);

    public static final String CLIENT_ID = "maretha-angular-webui";

    public static final String CLIENT_NAME = "Maretha Angular Web UI";

    public static final String URL_PROPERTY = "maretha.webui.url";

    /** env.js sends {@code <UI URL>#} as redirect_uri, so the code arrives as {@code #?code=}. */
    public static final String CALLBACK_ROUTE = "#";

    protected static final String DIRECTORY = "oauth2Clients";

    protected static final String SCHEMA = "oauth2Client";

    @Override
    public void start(ComponentContext context) {
        String redirect = redirectUri(Framework.getProperty(URL_PROPERTY), Framework.getProperty("nuxeo.url"));
        if (redirect == null) {
            log.warn("Set {} (or nuxeo.url) to register the {} OAuth2 client", URL_PROPERTY, CLIENT_ID);
            return;
        }
        if (!OAuth2Client.isRedirectURIValid(redirect)) {
            log.warn("Nuxeo rejects the {} redirect URI {}: use https", CLIENT_ID, redirect);
            return;
        }
        Framework.getService(ClusterService.class)
                 .runAtomically("maretha-angular-webui-oauth-client", Duration.ofMinutes(1), Duration.ofSeconds(1),
                         () -> TransactionHelper.runInTransaction(() -> Framework.doPrivileged(() -> {
                             try (Session session = Framework.getService(DirectoryService.class).open(DIRECTORY)) {
                                 register(session, redirect);
                             }
                         })));
    }

    /** Creates the client, or adds the redirect URI to an existing one. */
    protected static void register(Session session, String redirect) {
        Map<String, Serializable> filter = Map.of(OAuth2Client.ID_FIELD, CLIENT_ID);
        DocumentModelList entries = session.query(filter);
        if (entries.isEmpty()) {
            Map<String, Object> entry = new HashMap<>();
            entry.put(OAuth2Client.NAME_FIELD, CLIENT_NAME);
            entry.put(OAuth2Client.ID_FIELD, CLIENT_ID);
            entry.put(OAuth2Client.REDIRECT_URI_FIELD, redirect);
            entry.put(OAuth2Client.AUTO_GRANT_FIELD, Boolean.TRUE);
            entry.put(OAuth2Client.ENABLED_FIELD, Boolean.TRUE);
            session.createEntry(entry);
            log.info("Registered the {} OAuth2 client for {}", CLIENT_ID, redirect);
            return;
        }
        DocumentModel entry = entries.get(0);
        String current = (String) entry.getProperty(SCHEMA, OAuth2Client.REDIRECT_URI_FIELD);
        List<String> uris = new ArrayList<>();
        if (current != null) {
            Arrays.stream(current.split(OAuth2Client.REDIRECT_URI_SEPARATOR))
                  .map(String::trim)
                  .filter(uri -> !uri.isEmpty())
                  .forEach(uris::add);
        }
        if (uris.contains(redirect)) {
            return;
        }
        uris.add(redirect);
        entry.setProperty(SCHEMA, OAuth2Client.REDIRECT_URI_FIELD,
                String.join(OAuth2Client.REDIRECT_URI_SEPARATOR, uris));
        session.updateEntry(entry);
        log.info("Added {} to the {} OAuth2 client", redirect, CLIENT_ID);
    }

    /** The redirect URI for a UI URL, or for {@code <nuxeo.url>/ng/}; null when neither is set. */
    protected static String redirectUri(String webuiUrl, String nuxeoUrl) {
        String base;
        if (webuiUrl != null && !webuiUrl.isBlank()) {
            base = webuiUrl.trim();
        } else if (nuxeoUrl != null && !nuxeoUrl.isBlank()) {
            base = nuxeoUrl.trim().replaceAll("/+$", "") + "/ng/";
        } else {
            return null;
        }
        return (base.endsWith("/") ? base : base + "/") + CALLBACK_ROUTE;
    }
}
