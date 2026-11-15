package chat.mudrix.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RoomMenuTest {
    @Test
    fun `an unread room can be marked read but not unread`() {
        assertEquals(RoomMenu.Actions(markRead = true, markUnread = false), RoomMenu.actions(3, 0))
        assertEquals(RoomMenu.Actions(markRead = true, markUnread = false), RoomMenu.actions(0, 1))
    }

    @Test
    fun `a read room can only be marked unread`() {
        assertEquals(RoomMenu.Actions(markRead = false, markUnread = true), RoomMenu.actions(0, 0))
    }

    @Test
    fun `the voice channel flag is offered only in modern lists, to writers, on text rooms`() {
        assertTrue(RoomMenu.offersVoiceChannel(modern = true, isVoiceRoom = false, maySendState = true))
        assertFalse(RoomMenu.offersVoiceChannel(modern = false, isVoiceRoom = false, maySendState = true))
        assertFalse(RoomMenu.offersVoiceChannel(modern = true, isVoiceRoom = true, maySendState = true))
        assertFalse(RoomMenu.offersVoiceChannel(modern = true, isVoiceRoom = false, maySendState = false))
    }

    @Test
    fun `the flag content is just enabled`() {
        assertEquals("""{"enabled":true}""", RoomMenu.voiceChannelContent(true).toString())
        assertEquals("""{"enabled":false}""", RoomMenu.voiceChannelContent(false).toString())
    }

    @Test
    fun `moving a room swaps it with its neighbour`() {
        val ids = listOf("a", "b", "c")
        assertEquals(listOf("b", "a", "c"), RoomMenu.moved(ids, 1, -1))
        assertEquals(listOf("a", "c", "b"), RoomMenu.moved(ids, 1, 1))
    }

    @Test
    fun `moving past either end changes nothing`() {
        val ids = listOf("a", "b", "c")
        assertNull(RoomMenu.moved(ids, 0, -1))
        assertNull(RoomMenu.moved(ids, 2, 1))
        assertNull(RoomMenu.moved(ids, 3, -1))
        assertNull(RoomMenu.moved(ids, 0, 0))
        assertNull(RoomMenu.moved(emptyList(), 0, 1))
    }

    @Test
    fun `the original list is left alone`() {
        val ids = listOf("a", "b")
        RoomMenu.moved(ids, 0, 1)
        assertEquals(listOf("a", "b"), ids)
    }
}
