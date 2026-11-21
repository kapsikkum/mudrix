package chat.mudrix.android.matrix

import chat.mudrix.core.RoomSummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RoomArchiveGroupingTest {
    private fun room(id: String, archived: Boolean = false, direct: Boolean = false) = RoomSummary(
        id = id,
        isDirect = direct,
        isInvite = false,
        isFavourite = false,
        unreadMessages = 0,
        unreadMentions = 0,
        unreadNotifications = 0,
        markedUnread = false,
        isVoice = false,
        isLowPriority = false,
        isArchived = archived,
        isTombstoned = false,
        isEncrypted = false,
        memberCount = 2,
        callParticipants = emptyList(),
        inCall = false,
        inCallElsewhere = false,
        isSpace = false,
        isKnocked = false,
    )

    @Test
    fun `archived rooms leave the main list`() {
        val rooms = listOf(room("pinned"), room("favourite"), room("dm", direct = true), room("low"), room("archived", archived = true))

        val active = rooms.withoutArchived()

        assertEquals(listOf("pinned", "favourite", "dm", "low"), active.map { it.id })
        assertFalse(active.any { it.isArchived })
    }

    @Test
    fun `archived rooms appear in one Archived group at the end`() {
        val main = listOf(RoomGroup(RoomGroup.Kind.Rooms, listOf(room("a"), room("b"))))
        val archived = listOf(room("c", archived = true), room("d", archived = true))

        val groups = main.withArchivedGroup(archived)

        assertEquals(RoomGroup.Kind.Rooms, groups.first().kind)
        assertEquals(RoomGroup.Kind.Archived, groups.last().kind)
        assertEquals(listOf("c", "d"), groups.last().rooms.map { it.id })
    }

    @Test
    fun `no Archived group when nothing is archived`() {
        val main = listOf(RoomGroup(RoomGroup.Kind.Rooms, listOf(room("a"))))

        assertEquals(main, main.withArchivedGroup(emptyList()))
        assertTrue(main.withArchivedGroup(emptyList()).none { it.kind == RoomGroup.Kind.Archived })
    }

    @Test
    fun `the Archived group is not movable and has its own id`() {
        val group = RoomGroup(RoomGroup.Kind.Archived, listOf(room("a", archived = true)))

        assertEquals("archived", group.id)
        assertFalse(group.isMovable)
    }
}
