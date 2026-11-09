package io.maretha.webui.server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import org.junit.After;
import org.junit.Test;
import org.nuxeo.runtime.kv.MemKeyValueStore;

/** Exercise expiry and revocation with Nuxeo's actual compare-and-set implementation. */
public class DeliveryGrantStoreTest {

    protected static final DeliveryGrantStore.Target TARGET =
            new DeliveryGrantStore.Target("default", "document-id", "file:content", "original-digest");

    protected final MutableClock clock = new MutableClock();
    protected final RaceStore backing = new RaceStore();
    protected final DeliveryGrantStore store = new DeliveryGrantStore(backing, clock, new SecureRandom());

    @After
    public void close() {
        backing.close();
    }

    @Test
    public void capabilitiesNeedBothIndependentSecretsAndNeverStoreTheCookie() {
        var issued = store.mint(null, "alice", TARGET, "attachment");
        assertTrue(issued.cookie().matches(DeliveryGrantStore.TOKEN_PATTERN));
        assertTrue(issued.grant().id().matches(DeliveryGrantStore.TOKEN_PATTERN));
        assertNotEquals(issued.cookie(), issued.grant().id());
        assertEquals(TARGET, store.require(issued.cookie(), issued.grant().id()).target());
        backing.keyStream().forEach(key -> {
            assertFalse(key.contains(issued.cookie()));
            assertFalse(backing.getString(key).contains(issued.cookie()));
        });
        assertTrue(backing.ttls.stream().allMatch(ttl -> ttl == DeliveryGrantStore.TTL_SECONDS));
        for (String cookie : new String[] { null, "", "bad-cookie", issued.grant().id() }) {
            assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(cookie, issued.grant().id()));
        }
        for (String id : new String[] { null, "", "../session", issued.cookie(), "A".repeat(42) }) {
            assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(issued.cookie(), id));
        }
    }

    @Test
    public void anotherBrowserAndAnotherPrincipalCannotReadRenewOrRevoke() {
        var alice = store.mint(null, "alice", TARGET, "inline");
        var otherBrowser = store.mint(null, "alice", TARGET, "inline");
        assertThrows(DeliveryGrantStore.Denied.class,
                () -> store.require(otherBrowser.cookie(), alice.grant().id()));
        assertThrows(DeliveryGrantStore.Denied.class,
                () -> store.renew(alice.cookie(), alice.grant().id(), "bob"));
        assertThrows(DeliveryGrantStore.Denied.class,
                () -> store.revoke(alice.cookie(), alice.grant().id(), "bob"));
        store.revokeSession(alice.cookie(), "bob");
        assertEquals(alice.grant(), store.require(alice.cookie(), alice.grant().id()));
    }

    @Test
    public void browserLogoutRevokesEveryGrantButLeavesOtherDevicesAlone() {
        var first = store.mint(null, "alice", TARGET, "inline");
        var second = store.mint(first.cookie(), "alice", TARGET, "attachment");
        var otherDevice = store.mint(null, "alice", TARGET, "inline");
        store.revokeSession(first.cookie(), "alice");
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(first.cookie(), first.grant().id()));
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(second.cookie(), second.grant().id()));
        assertEquals(otherDevice.grant(), store.require(otherDevice.cookie(), otherDevice.grant().id()));
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.renew(first.cookie(), first.grant().id(), "alice"));
    }

    @Test
    public void accountSwitchRotatesCookieAndInvalidatesThePreviousPrincipal() {
        var alice = store.mint(null, "alice", TARGET, "inline");
        var bob = store.mint(alice.cookie(), "bob", TARGET, "inline");
        assertNotEquals(alice.cookie(), bob.cookie());
        assertEquals("bob", store.require(bob.cookie(), bob.grant().id()).owner());
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(alice.cookie(), alice.grant().id()));
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(bob.cookie(), alice.grant().id()));
    }

    @Test
    public void revokingOneGrantLeavesItsSiblingUsable() {
        var first = store.mint(null, "alice", TARGET, "inline");
        var sibling = store.mint(first.cookie(), "alice", TARGET, "attachment");
        store.revoke(first.cookie(), first.grant().id(), "alice");
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(first.cookie(), first.grant().id()));
        assertEquals(sibling.grant(), store.require(sibling.cookie(), sibling.grant().id()));
    }

    @Test
    public void explicitExpiryDeniesEvenBeforeTheBackendPurgesItsRecords() {
        var issued = store.mint(null, "alice", TARGET, "inline");
        clock.advanceSeconds(DeliveryGrantStore.TTL_SECONDS - 1);
        assertEquals(issued.grant(), store.require(issued.cookie(), issued.grant().id()));
        clock.advanceSeconds(1);
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(issued.cookie(), issued.grant().id()));
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.renew(issued.cookie(), issued.grant().id(), "alice"));
    }

    @Test
    public void readingDoesNotRefreshAndMintingDoesNotExtendOlderGrants() {
        var old = store.mint(null, "alice", TARGET, "inline");
        clock.advanceSeconds(200);
        assertEquals(old.grant().expiresAt(), store.require(old.cookie(), old.grant().id()).expiresAt());
        var fresh = store.mint(old.cookie(), "alice", TARGET, "inline");
        clock.advanceSeconds(100);
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(old.cookie(), old.grant().id()));
        assertEquals(fresh.grant(), store.require(fresh.cookie(), fresh.grant().id()));
    }

    @Test
    public void renewalKeepsTheUrlAndImmutableTargetWhileRefreshingBothExpiries() {
        var issued = store.mint(null, "alice", TARGET, "attachment");
        clock.advanceSeconds(250);
        var renewed = store.renew(issued.cookie(), issued.grant().id(), "alice");
        assertEquals(issued.grant().id(), renewed.id());
        assertEquals(issued.grant().sessionKey(), renewed.sessionKey());
        assertEquals(TARGET, renewed.target());
        assertEquals("attachment", renewed.disposition());
        assertEquals(clock.millis() + 300_000, renewed.expiresAt());
        clock.advanceSeconds(100);
        assertEquals(renewed, store.require(issued.cookie(), renewed.id()));
    }

    @Test
    public void separateNodesObserveRevocationImmediatelyThroughSharedStorage() {
        var nodeTwo = new DeliveryGrantStore(backing, clock, new SecureRandom());
        var issued = store.mint(null, "alice", TARGET, "inline");
        assertEquals(issued.grant(), nodeTwo.require(issued.cookie(), issued.grant().id()));
        nodeTwo.revokeSession(issued.cookie(), "alice");
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(issued.cookie(), issued.grant().id()));
    }

    @Test
    public void recordsFromAnotherApplicationFailEvenIfTheStorageNamespaceIsShared() throws Exception {
        for (boolean alterSession : new boolean[] { true, false }) {
            var issued = store.mint(null, "alice", TARGET, "inline");
            String key = alterSession ? issued.grant().sessionKey() : "grant:" + issued.grant().id();
            var record = (com.fasterxml.jackson.databind.node.ObjectNode)
                    DeliveryGrantStore.JSON.readTree(backing.getString(key));
            record.put("application", "another.application");
            backing.put(key, record.toString(), DeliveryGrantStore.TTL_SECONDS);
            assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(issued.cookie(), issued.grant().id()));
            assertThrows(DeliveryGrantStore.Denied.class,
                    () -> store.renew(issued.cookie(), issued.grant().id(), "alice"));
        }
    }

    @Test
    public void concurrentSessionRevocationCannotBeUndoneByRenewal() {
        var issued = store.mint(null, "alice", TARGET, "inline");
        clock.advanceSeconds(1);
        backing.revokeBeforeCompare = issued.grant().sessionKey();
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.renew(issued.cookie(), issued.grant().id(), "alice"));
        assertNull(backing.getString(issued.grant().sessionKey()));
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(issued.cookie(), issued.grant().id()));
    }

    @Test
    public void concurrentGrantRevocationCannotBeUndoneByRenewal() {
        var issued = store.mint(null, "alice", TARGET, "inline");
        clock.advanceSeconds(1);
        backing.revokeBeforeCompare = "grant:" + issued.grant().id();
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.renew(issued.cookie(), issued.grant().id(), "alice"));
        assertNull(backing.getString("grant:" + issued.grant().id()));
        assertThrows(DeliveryGrantStore.Denied.class, () -> store.require(issued.cookie(), issued.grant().id()));
    }

    @Test
    public void concurrentRenewalOfAnotherLiveGrantDoesNotInvalidateThisOne() {
        var issued = store.mint(null, "alice", TARGET, "inline");
        var sibling = store.mint(issued.cookie(), "alice", TARGET, "inline");
        clock.advanceSeconds(1);
        backing.replaceBeforeCompare = issued.grant().sessionKey();
        backing.replacement = store.encode(new DeliveryGrantStore.BrowserSession(DeliveryGrantStore.APPLICATION,
                "alice", clock.millis() + 300_000)).getBytes(StandardCharsets.UTF_8);
        var renewed = store.renew(issued.cookie(), issued.grant().id(), "alice");
        assertEquals(renewed, store.require(issued.cookie(), issued.grant().id()));
        assertEquals(sibling.grant(), store.require(sibling.cookie(), sibling.grant().id()));
        assertNull("The competing update must have occurred", backing.replaceBeforeCompare);
    }

    protected static class RaceStore extends MemKeyValueStore {
        protected final List<Long> ttls = new ArrayList<>();
        protected String revokeBeforeCompare;
        protected String replaceBeforeCompare;
        protected byte[] replacement;

        @Override
        public void put(String key, byte[] value, long ttl) {
            if (value != null) {
                ttls.add(ttl);
            }
            super.put(key, value, ttl);
        }

        @Override
        public boolean compareAndSet(String key, byte[] expected, byte[] value, long ttl) {
            if (key.equals(revokeBeforeCompare)) {
                revokeBeforeCompare = null;
                super.put(key, (byte[]) null, 0);
            }
            if (key.equals(replaceBeforeCompare)) {
                replaceBeforeCompare = null;
                super.put(key, replacement, DeliveryGrantStore.TTL_SECONDS);
            }
            return super.compareAndSet(key, expected, value, ttl);
        }
    }

    protected static class MutableClock extends Clock {
        protected Instant now = Instant.parse("2026-01-01T00:00:00Z");

        public void advanceSeconds(long seconds) {
            now = now.plusSeconds(seconds);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
