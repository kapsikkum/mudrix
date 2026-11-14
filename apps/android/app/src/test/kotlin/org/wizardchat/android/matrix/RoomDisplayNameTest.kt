package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Test

class RoomDisplayNameTest {
    @Test
    fun `a DM whose partner left is named after the partner`() {
        assertEquals("Sable", roomDisplayName(true, "Sable", "Empty Room (was Sable)", null, "!dm:example.org"))
    }

    @Test
    fun `a DM without a partner name keeps the room name`() {
        assertEquals("Sable", roomDisplayName(true, null, "Sable", null, "!dm:example.org"))
        assertEquals("Sable", roomDisplayName(true, " ", "Sable", null, "!dm:example.org"))
    }

    @Test
    fun `a room keeps its own name`() {
        assertEquals("general", roomDisplayName(false, null, "general", "#general:example.org", "!room:example.org"))
    }

    @Test
    fun `without a name the alias then the id is used`() {
        assertEquals("#general:example.org", roomDisplayName(false, null, null, "#general:example.org", "!room:example.org"))
        assertEquals("!room:example.org", roomDisplayName(false, null, null, null, "!room:example.org"))
    }
}
