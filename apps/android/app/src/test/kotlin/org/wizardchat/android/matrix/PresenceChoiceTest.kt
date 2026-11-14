package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.wizardchat.core.Presence
import org.junit.Test

class PresenceChoiceTest {
    @Test
    fun sharingOffIsAlwaysOffline() {
        PresenceChoice.entries.forEach { assertEquals(Presence.offline, it.presence(false)) }
    }

    @Test
    fun choicesMapToServerStates() {
        assertEquals(Presence.online, PresenceChoice.auto.presence(true))
        assertEquals(Presence.online, PresenceChoice.online.presence(true))
        assertEquals(Presence.unavailable, PresenceChoice.away.presence(true))
        assertEquals(Presence.offline, PresenceChoice.invisible.presence(true))
    }
}
