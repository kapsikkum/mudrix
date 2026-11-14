package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SpaceRailTest {
    private fun space(id: String, name: String = id) = RailSpace(id, name, null)

    private fun room(vararg spaceIds: String, unread: Boolean = false, mentions: Int = 0) =
        RailRoom(spaceIds.toSet(), unread, mentions)

    @Test
    fun `home comes first and only counts rooms in no space`() {
        val slots = SpaceRail.slots(
            listOf(space("!a"), space("!b")),
            listOf(room(unread = true), room("!a", mentions = 2), room("!b")),
        )
        assertEquals(listOf(null, "!a", "!b"), slots.map { it.space?.id })
        assertTrue(slots[0].unread)
        assertEquals(0, slots[0].mentions)
        assertTrue(slots[1].unread)
        assertEquals(2, slots[1].mentions)
        assertFalse(slots[2].unread)
        assertEquals(0, slots[2].mentions)
    }

    @Test
    fun `a space's rooms aggregate mentions and stay unread with a mention alone`() {
        val slots = SpaceRail.slots(
            listOf(space("!a")),
            listOf(room("!a", mentions = 3), room("!a", mentions = 4), room("!a", unread = true)),
        )
        assertTrue(slots[1].unread)
        assertEquals(7, slots[1].mentions)
    }

    @Test
    fun `a room in a space is not counted at home`() {
        val slots = SpaceRail.slots(listOf(space("!a")), listOf(room("!a", unread = true)))
        assertFalse(slots[0].unread)
        assertTrue(slots[1].unread)
    }

    @Test
    fun `badges hide zero and cap at 99 plus`() {
        assertNull(SpaceRail.badge(0))
        assertNull(SpaceRail.badge(-1))
        assertEquals("1", SpaceRail.badge(1))
        assertEquals("99", SpaceRail.badge(99))
        assertEquals("99+", SpaceRail.badge(100))
        assertEquals("99+", SpaceRail.badge(4321))
    }

    @Test
    fun `the remembered space falls back to home when it is gone`() {
        val spaces = listOf(space("!a"), space("!b"))
        assertEquals("!b", SpaceRail.selected("!b", spaces)?.id)
        assertNull(SpaceRail.selected("!gone", spaces))
        assertNull(SpaceRail.selected(null, spaces))
    }
}
