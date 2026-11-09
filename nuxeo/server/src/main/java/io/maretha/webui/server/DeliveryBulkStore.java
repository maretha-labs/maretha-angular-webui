package io.maretha.webui.server;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

/** Immutable request/manifest records are separate from the small, atomically updated job state. */
public class DeliveryBulkStore {
    public static final long JOB_MILLIS = 30 * 60 * 1000;
    public static final long RECORD_TTL_SECONDS = 60 * 60;
    public static final int MAX_SELECTED = 1000;
    public static final int MAX_ENTRIES = 5000;
    public static final long MAX_BYTES = 20L * 1024 * 1024 * 1024;
    public static final int MAX_ACTIVE_PER_OWNER = 3;
    public static final Set<String> TERMINAL = Set.of("consumed", "failed", "cancelled", "expired");

    public record Request(String application, String id, String sessionKey, String owner, String repository,
            List<String> documentIds, String filename, long expiresAt) { }
    public record Entry(String documentId, String xpath, String digest, long length, String filename,
            String kind, String changeToken, String mimeType, String archivePath) {
        public Entry(String documentId, String xpath, String digest, long length, String filename) {
            this(documentId, xpath, digest, length, filename, "persisted", null, "application/octet-stream", filename);
        }
    }
    public record Manifest(List<Entry> entries) { }
    public record Container(String documentId, String changeToken) { }
    public record Containers(List<Container> containers) { }
    public record Status(String id, String state, int completed, int total, long bytesProcessed, long totalBytes,
            long expiresAt, String error, long zipLength, String zipDigest) { }
    public record Slot(String id, long expiresAt) { }
    public record Quota(List<Slot> slots) { }
    public record Created(String cookie, Request request, Status status) { }
    protected final DeliveryGrantStore grants;

    public DeliveryBulkStore(DeliveryGrantStore grants) { this.grants = grants; }

    public Created create(String cookie, String owner, String repository, List<String> ids, String filename) {
        DeliveryGrantStore.IssuedSession browser = grants.ensureSession(cookie, owner);
        String id = grants.token();
        long deadline = grants.clock.millis() + JOB_MILLIS;
        reserve(owner, new Slot(id, deadline));
        Request request = new Request(DeliveryGrantStore.APPLICATION, id, browser.key(), owner, repository,
                List.copyOf(ids), filename, deadline);
        Status status = new Status(id, "queued", 0, 0, 0, 0, deadline, null, 0, null);
        try {
            put("request:" + id, request);
            put("status:" + id, status);
        } catch (RuntimeException e) {
            release(owner, id);
            throw e;
        }
        return new Created(browser.cookie(), request, status);
    }

    public Request request(String id) {
        if (id == null || !id.matches(DeliveryGrantStore.TOKEN_PATTERN)) throw new DeliveryGrantStore.Denied();
        Request request = grants.read("bulk:request:" + id, Request.class);
        if (request == null || !DeliveryGrantStore.APPLICATION.equals(request.application()))
            throw new DeliveryGrantStore.Denied();
        return request;
    }

    public Request owned(String cookie, String id, String owner, boolean refresh) {
        Request request = request(id);
        DeliveryGrantStore.IssuedSession browser = grants.requireSession(cookie, owner, refresh);
        if (!owner.equals(request.owner()) || !browser.key().equals(request.sessionKey()))
            throw new DeliveryGrantStore.Denied();
        return request;
    }

    public Status status(String id) {
        Status status = rawStatus(id);
        if (status == null) throw new DeliveryGrantStore.Denied();
        if (!TERMINAL.contains(status.state()) && status.expiresAt() <= grants.clock.millis())
            return finish(id, "expired", "The ZIP preparation expired. Generate it again.");
        return status;
    }

    protected Status rawStatus(String id) { return grants.read("bulk:status:" + id, Status.class); }

    public boolean begin(String id) {
        Status status = status(id);
        return "queued".equals(status.state()) && compare(status, new Status(id, "preparing", 0, 0, 0, 0,
                status.expiresAt(), null, 0, null));
    }

    public void checkpoint(String id) {
        Request request = request(id);
        Status status = status(id);
        if (!"preparing".equals(status.state())) throw new Stopped();
        grants.requireSessionKey(request.sessionKey(), request.owner());
    }

    public void progress(String id, int completed, int total, long copied, long bytes) {
        Status old = status(id);
        if (!"preparing".equals(old.state()) || !compare(old, new Status(id, "preparing", completed, total,
                copied, bytes, old.expiresAt(), null, 0, null))) throw new Stopped();
    }

    public void manifest(String id, List<Entry> entries) { put("manifest:" + id, new Manifest(List.copyOf(entries))); }

    public List<Entry> manifest(String id) {
        Manifest manifest = grants.read("bulk:manifest:" + id, Manifest.class);
        if (manifest == null) throw new Stopped();
        return manifest.entries();
    }

    public void containers(String id, List<Container> containers) { put("containers:" + id, new Containers(List.copyOf(containers))); }
    public List<Container> containers(String id) {
        Containers containers = grants.read("bulk:containers:" + id, Containers.class);
        return containers == null ? List.of() : containers.containers();
    }

    public boolean ready(String id, long length, String digest) {
        Status old = status(id);
        return "preparing".equals(old.state()) && compare(old, new Status(id, "ready", old.total(), old.total(),
                old.totalBytes(), old.totalBytes(), old.expiresAt(), null, length, digest));
    }

    public Status claim(String id) {
        Status old = status(id);
        if (!"ready".equals(old.state())) throw new Stopped();
        Status consumed = new Status(id, "consumed", old.completed(), old.total(), old.bytesProcessed(), old.totalBytes(),
                old.expiresAt(), null, old.zipLength(), old.zipDigest());
        if (!compare(old, consumed)) throw new Stopped();
        release(request(id).owner(), id);
        return consumed;
    }

    public Status finish(String id, String state, String error) {
        for (int attempt = 0; attempt < 8; attempt++) {
            Status old = rawStatus(id);
            if (old == null) throw new Stopped();
            if (TERMINAL.contains(old.state())) return old;
            Status next = new Status(id, state, old.completed(), old.total(), old.bytesProcessed(), old.totalBytes(),
                    old.expiresAt(), error, old.zipLength(), old.zipDigest());
            if (compare(old, next)) {
                release(request(id).owner(), id);
                return next;
            }
        }
        throw new Stopped();
    }

    protected boolean compare(Status old, Status next) {
        return grants.store.compareAndSet("bulk:status:" + old.id(), grants.encode(old), grants.encode(next),
                RECORD_TTL_SECONDS);
    }

    protected void put(String key, Object value) { grants.store.put("bulk:" + key, grants.encode(value), RECORD_TTL_SECONDS); }

    protected void reserve(String owner, Slot slot) {
        String key = quotaKey(owner);
        for (int attempt = 0; attempt < 8; attempt++) {
            String before = grants.store.getString(key);
            Quota quota = grants.read(key, Quota.class);
            List<Slot> slots = new ArrayList<>();
            if (quota != null) for (Slot existing : quota.slots()) {
                Status state = rawStatus(existing.id());
                if (existing.expiresAt() > grants.clock.millis() && (state == null || !TERMINAL.contains(state.state())))
                    slots.add(existing);
            }
            if (slots.size() >= MAX_ACTIVE_PER_OWNER)
                throw new Limit("At most three ZIP jobs may be active. Download or cancel an existing job first.");
            slots.add(slot);
            if (grants.store.compareAndSet(key, before, grants.encode(new Quota(slots)), RECORD_TTL_SECONDS)) return;
        }
        throw new Limit("ZIP requests are busy. Retry shortly.");
    }

    protected void release(String owner, String id) {
        String key = quotaKey(owner);
        for (int attempt = 0; attempt < 8; attempt++) {
            String before = grants.store.getString(key);
            Quota quota = grants.read(key, Quota.class);
            if (quota == null) return;
            Quota next = new Quota(quota.slots().stream().filter(slot -> !id.equals(slot.id())).toList());
            if (grants.store.compareAndSet(key, before, grants.encode(next), RECORD_TTL_SECONDS)) return;
        }
        // Terminal entries are also pruned on the next reservation.
    }

    protected String quotaKey(String owner) {
        try {
            return "bulk:quota:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(owner.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    public static class Stopped extends RuntimeException { private static final long serialVersionUID = 1L; }
    public static class Limit extends RuntimeException {
        private static final long serialVersionUID = 1L;
        public Limit(String message) { super(message); }
    }
}
