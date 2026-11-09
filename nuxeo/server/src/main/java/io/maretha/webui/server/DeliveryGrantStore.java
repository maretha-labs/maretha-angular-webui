package io.maretha.webui.server;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.HexFormat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.nuxeo.runtime.kv.KeyValueStore;

/** Short-lived capabilities require both an unguessable route id and a separate browser cookie. */
public class DeliveryGrantStore {

    public static final long TTL_SECONDS = 300;
    public static final String TOKEN_PATTERN = "[A-Za-z0-9_-]{43}";
    public static final String APPLICATION = "io.maretha.maretha-angular-webui.server";
    protected static final ObjectMapper JSON = new ObjectMapper();
    protected final KeyValueStore store;
    protected final Clock clock;
    protected final SecureRandom random;

    public record Target(String repository, String documentId, String xpath, String expectedDigest) { }
    public record BrowserSession(String application, String owner, long expiresAt) { }
    public record Grant(String application, String id, String sessionKey, String owner, Target target, String disposition,
            long expiresAt, String bulkJobId) {
        public Grant(String application, String id, String sessionKey, String owner, Target target, String disposition,
                long expiresAt) {
            this(application, id, sessionKey, owner, target, disposition, expiresAt, null);
        }
    }
    public record Issued(String cookie, Grant grant) { }
    public record IssuedSession(String cookie, String key) { }

    public DeliveryGrantStore(KeyValueStore store, Clock clock, SecureRandom random) {
        this.store = store;
        this.clock = clock;
        this.random = random;
    }

    public Issued mint(String cookie, String owner, Target target, String disposition) {
        IssuedSession browser = ensureSession(cookie, owner);
        Grant grant = new Grant(APPLICATION, token(), browser.key(), owner, target, disposition, expiry());
        store.put("grant:" + grant.id(), encode(grant), TTL_SECONDS);
        return new Issued(browser.cookie(), grant);
    }

    public Issued mintBulk(String cookie, String owner, String jobId, long deadline) {
        IssuedSession browser = requireSession(cookie, owner, true);
        Grant grant = new Grant(APPLICATION, token(), browser.key(), owner, null, "attachment",
                Math.min(expiry(), deadline), jobId);
        store.put("grant:" + grant.id(), encode(grant), TTL_SECONDS);
        return new Issued(cookie, grant);
    }

    public IssuedSession ensureSession(String cookie, String owner) {
        String key = sessionKey(cookie);
        BrowserSession session = read(key, BrowserSession.class);
        if (session == null || !APPLICATION.equals(session.application()) || session.expiresAt() <= clock.millis()
                || !session.owner().equals(owner)) {
            // Principal changes invalidate this browser's old grants as a group.
            if (key != null) {
                store.put(key, (String) null);
            }
            cookie = token();
            key = sessionKey(cookie);
            store.put(key, encode(new BrowserSession(APPLICATION, owner, expiry())), TTL_SECONDS);
        } else {
            refreshSession(key, session);
        }
        return new IssuedSession(cookie, key);
    }

    public IssuedSession requireSession(String cookie, String owner, boolean refresh) {
        String key = sessionKey(cookie);
        BrowserSession session = requireSessionKey(key, owner);
        if (refresh) {
            refreshSession(key, session);
        }
        return new IssuedSession(cookie, key);
    }

    public BrowserSession requireSessionKey(String key, String owner) {
        BrowserSession session = read(key, BrowserSession.class);
        if (session == null || !APPLICATION.equals(session.application()) || !owner.equals(session.owner())
                || session.expiresAt() <= clock.millis()) {
            throw new Denied();
        }
        return session;
    }

    public Grant require(String cookie, String id) {
        if (id == null || !id.matches(TOKEN_PATTERN)) {
            throw new Denied();
        }
        String key = sessionKey(cookie);
        BrowserSession session = read(key, BrowserSession.class);
        Grant grant = read("grant:" + id, Grant.class);
        long now = clock.millis();
        if (session == null || !APPLICATION.equals(session.application()) || session.expiresAt() <= now || grant == null
                || !APPLICATION.equals(grant.application()) || grant.expiresAt() <= now
                || !grant.sessionKey().equals(key) || !grant.owner().equals(session.owner())) {
            throw new Denied();
        }
        return grant;
    }

    public Grant renew(String cookie, String id, String owner) {
        Grant old = requireOwned(cookie, id, owner);
        if (old.bulkJobId() != null) {
            throw new Denied();
        }
        BrowserSession session = read(old.sessionKey(), BrowserSession.class);
        refreshSession(old.sessionKey(), session);
        Grant grant = new Grant(APPLICATION, old.id(), old.sessionKey(), old.owner(), old.target(), old.disposition(), expiry());
        // Never resurrect a grant concurrently revoked by DELETE.
        if (!store.compareAndSet("grant:" + id, encode(old), encode(grant), TTL_SECONDS)) {
            throw new Denied();
        }
        return grant;
    }

    public Grant requireOwned(String cookie, String id, String owner) {
        Grant grant = require(cookie, id);
        if (!grant.owner().equals(owner)) {
            throw new Denied();
        }
        return grant;
    }

    public void revoke(String cookie, String id, String owner) {
        requireOwned(cookie, id, owner);
        store.put("grant:" + id, (String) null);
    }

    public void revokeSession(String cookie, String owner) {
        String key = sessionKey(cookie);
        BrowserSession session = read(key, BrowserSession.class);
        if (session != null && session.owner().equals(owner)) {
            store.put(key, (String) null);
        }
    }

    protected void refreshSession(String key, BrowserSession session) {
        if (session == null) {
            throw new Denied();
        }
        String owner = session.owner();
        long expiresAt = expiry();
        for (int attempt = 0; attempt < 4; attempt++) {
            if (session == null || !APPLICATION.equals(session.application()) || !owner.equals(session.owner())
                    || session.expiresAt() <= clock.millis()) {
                throw new Denied();
            }
            // Another active player/tab may already have extended this shared browser session.
            if (session.expiresAt() >= expiresAt || store.compareAndSet(key, encode(session),
                    encode(new BrowserSession(APPLICATION, owner, expiresAt)), TTL_SECONDS)) {
                return;
            }
            session = read(key, BrowserSession.class);
        }
        throw new Denied();
    }

    protected long expiry() {
        return clock.millis() + TTL_SECONDS * 1000;
    }

    protected String token() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    protected String sessionKey(String cookie) {
        if (cookie == null || !cookie.matches(TOKEN_PATTERN)) {
            return null;
        }
        try {
            return "session:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(cookie.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    protected <T> T read(String key, Class<T> type) {
        String value = key == null ? null : store.getString(key);
        if (value == null) {
            return null;
        }
        try {
            return JSON.readValue(value, type);
        } catch (IOException e) {
            throw new Denied();
        }
    }

    protected String encode(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static class Denied extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
