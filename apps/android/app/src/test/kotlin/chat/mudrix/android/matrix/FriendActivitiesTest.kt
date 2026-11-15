package chat.mudrix.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FriendActivitiesTest {
    private fun candidate(userId: String, roomId: String = "room-$userId") =
        FriendCandidate(userId, roomId, userId.removePrefix("@"), null)

    private fun playing(name: String, expiresAt: Long) = ProfileActivity("playing", name, "", 0, expiresAt)

    @Test
    fun `a person in several direct chats is listed once`() {
        val candidates = FriendActivities.candidates(
            listOf(candidate("@a", "!one"), candidate("@b"), candidate("@a", "!two"), candidate("")),
        )
        assertEquals(listOf("@a", "@b"), candidates.map { it.userId })
        assertEquals("!one", candidates.first().roomId)
    }

    @Test
    fun `at most twenty people are checked`() {
        val many = (1..30).map { candidate("@$it") }
        assertEquals(FriendActivities.MAX_FRIENDS, FriendActivities.candidates(many).size)
    }

    @Test
    fun `only live activities put a friend in the feed`() {
        val now = 10_000L
        val candidates = listOf(candidate("@a"), candidate("@b"), candidate("@c"))
        val feed = FriendActivities.feed(
            candidates,
            mapOf(
                "@a" to listOf(playing("Chess", now + 1)),
                "@b" to listOf(playing("Old game", now - 1)),
            ),
            now,
        )
        assertEquals(listOf("@a"), feed.map { it.userId })
        assertEquals(listOf("Chess"), feed.first().activities.map { it.name })
    }

    @Test
    fun `the feed keeps the direct-list order`() {
        val now = 10_000L
        val candidates = listOf(candidate("@a"), candidate("@b"))
        val activities = mapOf("@a" to listOf(playing("A", now + 5)), "@b" to listOf(playing("B", now + 5)))
        assertEquals(listOf("@a", "@b"), FriendActivities.feed(candidates, activities, now).map { it.userId })
    }

    @Test
    fun `several running activities stay together, in profile order`() {
        val now = 10_000L
        val feed = FriendActivities.feed(
            listOf(candidate("@a")),
            mapOf("@a" to listOf(playing("Game", now + 5), ProfileActivity("listening", "Song", "Artist", 0, now + 6))),
            now,
        )
        assertEquals(listOf("playing", "listening"), feed.single().activities.map { it.type })
        assertTrue(feed.single().activities.size == 2)
    }
}
