package io.maretha.webui.server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

import org.junit.After;
import org.junit.Test;

/** Exercise job ownership and races using Nuxeo's real in-memory CAS store. */
public class DeliveryBulkStoreTest {
    protected final DeliveryGrantStoreTest.MutableClock clock = new DeliveryGrantStoreTest.MutableClock();
    protected final DeliveryGrantStoreTest.RaceStore backing = new DeliveryGrantStoreTest.RaceStore();
    protected final DeliveryGrantStore grants = new DeliveryGrantStore(backing, clock, new SecureRandom());
    protected final DeliveryBulkStore jobs = new DeliveryBulkStore(grants);

    @After
    public void close() { backing.close(); }

    protected DeliveryBulkStore.Created create(String cookie, String owner) {
        return jobs.create(cookie, owner, "default", List.of("document-id"), "selection.zip");
    }

    @Test
    public void requestRequiresOriginalBrowserPrincipalAndApplication() throws Exception {
        var created = create(null, "alice");
        var otherBrowser = create(null, "alice");
        var otherOwner = create(null, "bob");
        String id = created.request().id();
        assertNotEquals(created.cookie(), id);
        assertEquals(created.request(), jobs.owned(created.cookie(), id, "alice", false));
        assertThrows(DeliveryGrantStore.Denied.class,
                () -> jobs.owned(otherBrowser.cookie(), id, "alice", false));
        assertThrows(DeliveryGrantStore.Denied.class,
                () -> jobs.owned(otherOwner.cookie(), id, "bob", false));
        assertThrows(DeliveryGrantStore.Denied.class, () -> jobs.owned(created.cookie(), id, "bob", false));
        for (String invalid : new String[] { null, "", "../session", "A".repeat(42) }) {
            assertThrows(DeliveryGrantStore.Denied.class, () -> jobs.request(invalid));
        }
        String key = "bulk:request:" + id;
        var record = (com.fasterxml.jackson.databind.node.ObjectNode)
                DeliveryGrantStore.JSON.readTree(backing.getString(key));
        record.put("application", "another.application");
        backing.put(key, record.toString(), DeliveryBulkStore.RECORD_TTL_SECONDS);
        assertThrows(DeliveryGrantStore.Denied.class, () -> jobs.owned(created.cookie(), id, "alice", false));
    }

    @Test
    public void browserRevocationStopsPreparationButLeavesOtherDevicesAlone() {
        var first = create(null, "alice");
        var other = create(null, "alice");
        assertTrue(jobs.begin(first.request().id()));
        assertTrue(jobs.begin(other.request().id()));
        grants.revokeSession(first.cookie(), "alice");
        assertThrows(DeliveryGrantStore.Denied.class, () -> jobs.checkpoint(first.request().id()));
        assertThrows(DeliveryGrantStore.Denied.class,
                () -> jobs.owned(first.cookie(), first.request().id(), "alice", true));
        jobs.checkpoint(other.request().id());
    }

    @Test
    public void statusHeartbeatExtendsBrowserSessionButNeverTheFixedJobDeadline() {
        var created = create(null, "alice");
        String id = created.request().id();
        assertTrue(jobs.begin(id));
        for (int i = 0; i < 8; i++) {
            clock.advanceSeconds(200);
            jobs.owned(created.cookie(), id, "alice", true);
            jobs.checkpoint(id);
            assertEquals(created.status().expiresAt(), jobs.status(id).expiresAt());
        }
        clock.advanceSeconds(200);
        jobs.owned(created.cookie(), id, "alice", true);
        assertEquals("expired", jobs.status(id).state());
        assertThrows(DeliveryBulkStore.Stopped.class, () -> jobs.checkpoint(id));
        assertFalse(jobs.ready(id, 100, "zip-digest"));
    }

    @Test
    public void mereReadsDoNotKeepTheBrowserSessionAlive() {
        var created = create(null, "alice");
        clock.advanceSeconds(299);
        jobs.owned(created.cookie(), created.request().id(), "alice", false);
        clock.advanceSeconds(1);
        assertThrows(DeliveryGrantStore.Denied.class,
                () -> jobs.owned(created.cookie(), created.request().id(), "alice", false));
    }

    @Test
    public void duplicateWorkersAndTerminalTransitionsCannotResurrectAJob() {
        var created = create(null, "alice");
        String id = created.request().id();
        var otherNode = new DeliveryBulkStore(new DeliveryGrantStore(backing, clock, new SecureRandom()));
        assertTrue(jobs.begin(id));
        assertFalse(otherNode.begin(id));
        jobs.progress(id, 1, 2, 8, 16);
        jobs.finish(id, "cancelled", null);
        assertFalse(otherNode.ready(id, 100, "zip-digest"));
        assertThrows(DeliveryBulkStore.Stopped.class, () -> jobs.progress(id, 2, 2, 16, 16));
        assertThrows(DeliveryBulkStore.Stopped.class, () -> jobs.claim(id));
        assertEquals("cancelled", otherNode.finish(id, "failed", "late failure").state());
    }

    @Test
    public void cancellationWinningThePublicationCasPreventsReady() {
        var created = create(null, "alice");
        String id = created.request().id();
        jobs.begin(id);
        var old = jobs.status(id);
        var cancelled = new DeliveryBulkStore.Status(id, "cancelled", 0, 0, 0, 0, old.expiresAt(), null, 0, null);
        backing.replaceBeforeCompare = "bulk:status:" + id;
        backing.replacement = grants.encode(cancelled).getBytes(StandardCharsets.UTF_8);
        assertFalse(jobs.ready(id, 100, "zip-digest"));
        assertEquals("cancelled", jobs.status(id).state());
    }

    @Test
    public void onlyOneNodeCanConsumeAReadyArchiveAndCancelCannotUndoConsumption() {
        var created = create(null, "alice");
        String id = created.request().id();
        jobs.begin(id);
        jobs.progress(id, 1, 1, 10, 10);
        assertTrue(jobs.ready(id, 100, "zip-digest"));
        var otherNode = new DeliveryBulkStore(new DeliveryGrantStore(backing, clock, new SecureRandom()));
        assertEquals("consumed", jobs.claim(id).state());
        assertThrows(DeliveryBulkStore.Stopped.class, () -> otherNode.claim(id));
        assertFalse(otherNode.ready(id, 100, "zip-digest"));
        assertEquals("consumed", otherNode.finish(id, "cancelled", null).state());
    }

    @Test
    public void quotaIsPerOwnerAcrossBrowsersAndNodesAndTerminalJobsReleaseSlots() {
        var first = create(null, "alice");
        create(null, "alice");
        var third = create(null, "alice");
        var otherNode = new DeliveryBulkStore(new DeliveryGrantStore(backing, clock, new SecureRandom()));
        assertThrows(DeliveryBulkStore.Limit.class,
                () -> otherNode.create(null, "alice", "default", List.of("another"), "selection.zip"));
        create(null, "bob");
        jobs.finish(first.request().id(), "cancelled", null);
        create(third.cookie(), "alice");
        assertThrows(DeliveryBulkStore.Limit.class, () -> create(null, "alice"));
        clock.advanceSeconds(DeliveryBulkStore.JOB_MILLIS / 1000);
        create(null, "alice");
    }

    @Test
    public void requestAndManifestCaptureImmutableSelectionsWithoutRawCookie() {
        List<String> selected = new ArrayList<>(List.of("first"));
        var created = jobs.create(null, "alice", "default", selected, "selection.zip");
        selected.add("late");
        var entry = new DeliveryBulkStore.Entry("first", "file:content", "digest", 4, "file.txt");
        List<DeliveryBulkStore.Entry> entries = new ArrayList<>(List.of(entry));
        jobs.manifest(created.request().id(), entries);
        entries.clear();
        assertEquals(List.of("first"), jobs.request(created.request().id()).documentIds());
        assertEquals(List.of(entry), jobs.manifest(created.request().id()));
        backing.keyStream().forEach(key -> {
            assertFalse(key.contains(created.cookie()));
            assertFalse(backing.getString(key).contains(created.cookie()));
        });
    }

    @Test
    public void bulkGrantIsBoundToTheBrowserAndDeadlineAndCannotUseMediaRenewal() {
        var created = create(null, "alice");
        var issued = grants.mintBulk(created.cookie(), "alice", created.request().id(), clock.millis() + 10_000);
        assertEquals(created.request().id(), grants.require(created.cookie(), issued.grant().id()).bulkJobId());
        assertEquals("attachment", issued.grant().disposition());
        assertThrows(DeliveryGrantStore.Denied.class,
                () -> grants.renew(created.cookie(), issued.grant().id(), "alice"));
        clock.advanceSeconds(10);
        assertThrows(DeliveryGrantStore.Denied.class, () -> grants.require(created.cookie(), issued.grant().id()));
    }
}
