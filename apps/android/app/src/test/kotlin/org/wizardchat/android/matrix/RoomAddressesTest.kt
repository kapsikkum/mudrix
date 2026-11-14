package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RoomAddressesTest {
    @Test
    fun validatesAddresses() {
        assertTrue(RoomAddresses.isValid("#room:example.org"))
        assertTrue(RoomAddresses.isValid("  #a-b_c.d:srv.example "))
        assertFalse(RoomAddresses.isValid("room:example.org"))
        assertFalse(RoomAddresses.isValid("#room"))
        assertFalse(RoomAddresses.isValid("#room:"))
    }

    @Test
    fun listsTheOtherAddresses() {
        assertEquals(listOf("#b:s", "#c:s"), RoomAddresses.others("#a:s", listOf("#b:s", "#a:s"), listOf("#c:s", "#b:s")))
        assertEquals(emptyList<String>(), RoomAddresses.others(null, emptyList(), emptyList()))
    }

    @Test
    fun addsOnce() {
        assertEquals(listOf("#b:s"), RoomAddresses.altAfterAdd("#a:s", emptyList(), "#b:s"))
        assertEquals(listOf("#b:s"), RoomAddresses.altAfterAdd("#a:s", listOf("#b:s"), "#b:s"))
        assertEquals(emptyList<String>(), RoomAddresses.altAfterAdd("#a:s", emptyList(), "#a:s"))
    }

    @Test
    fun removesFromBoth() {
        assertEquals(null to listOf("#b:s"), RoomAddresses.afterRemove("#a:s", listOf("#b:s"), "#a:s"))
        assertEquals("#a:s" to emptyList<String>(), RoomAddresses.afterRemove("#a:s", listOf("#b:s"), "#b:s"))
    }

    @Test
    fun theOldMainAddressStaysAsAlternative() {
        assertEquals("#b:s" to listOf("#a:s", "#c:s"), RoomAddresses.afterSetMain("#a:s", listOf("#b:s", "#c:s"), "#b:s"))
        assertEquals("#a:s" to emptyList<String>(), RoomAddresses.afterSetMain(null, emptyList(), "#a:s"))
    }

    @Test
    fun mapsJoinRulesToOptions() {
        assertEquals(RoomAccess.Public, RoomAccess.of("public"))
        assertEquals(RoomAccess.SpaceMembers, RoomAccess.of("restricted"))
        assertEquals(RoomAccess.Knock, RoomAccess.of("knock_restricted"))
        assertEquals(RoomAccess.Invite, RoomAccess.of("private"))
    }
}
