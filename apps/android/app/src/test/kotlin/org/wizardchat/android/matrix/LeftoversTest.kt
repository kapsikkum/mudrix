package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.android.matrix.rtc.RoomSoundboards
import org.wizardchat.core.SpaceLink
import org.wizardchat.core.SpaceNode

class LeftoversTest {
    @Test fun aThreadIsUnreadWhenSomebodyElseRepliedAfterItWasSeen() {
        fun rule(sender: String?, latest: Long?, me: String?, seen: Long?) = ThreadLastSeen.isUnread(sender, latest, me, seen)
        assertTrue(rule("@a:x", 200, "@me:x", null))
        assertTrue(rule("@a:x", 200, "@me:x", 100))
        assertFalse(rule("@a:x", 200, "@me:x", 200))
        assertFalse("my own reply is not unread", rule("@me:x", 300, "@me:x", 100))
        assertFalse("no reply at all", rule(null, null, "@me:x", null))
    }

    @Test fun roomBoardsComeFromTheSpacesAboveFirstAndTheRoomLast() {
        fun link(id: String) = SpaceLink(id, null, false, 0, emptyList())
        val graph = listOf(SpaceNode("!top", listOf(link("!mid"))), SpaceNode("!mid", listOf(link("!room"))))
        assertEquals(listOf("!top", "!mid", "!room"), RoomSoundboards.boardRoomIds(graph, "!room"))
        assertEquals(listOf("!stray"), RoomSoundboards.boardRoomIds(graph, "!stray"))
    }
}
