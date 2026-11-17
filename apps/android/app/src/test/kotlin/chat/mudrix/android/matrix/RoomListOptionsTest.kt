package chat.mudrix.android.matrix

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The DM screen's saved options and their ordering (K1, matching iOS's `RoomListOptionsTests`). */
class RoomListOptionsTest {
    private data class Row(val id: String, val last: Long?, val created: Long?, val name: String = id)

    private fun sorted(rows: List<Row>, mode: RoomSortMode): List<String> =
        sortRoomRows(rows, mode, { it.last }, { it.created }, { it.name }).map { it.id }

    @Test
    fun missingAccountDataKeepsTheOldAppsOrder() {
        val options = RoomListOptions.fromJson(null)
        assertEquals(RoomSortMode.Recent, options.sort)
        assertTrue(options.separateRoomsAndDms)
        assertTrue(options.favouritesSection)
        assertTrue(options.pinnedUsers.isEmpty())
        assertEquals("io.github.kapsikkum.mudrix.room_list", RoomListOptions.EVENT_TYPE)
    }

    @Test
    fun theStoredEventIsReadAndUnknownValuesFallBack() {
        val content = Json.parseToJsonElement(
            """{"sort":"newest","separateRoomsAndDms":false,"favouritesSection":false,
               "pinnedUsers":["@a:x","@a:x","@b:y"]}""",
        )
        val options = RoomListOptions.fromJson(content)
        assertEquals(RoomSortMode.Newest, options.sort)
        assertFalse(options.separateRoomsAndDms)
        assertFalse(options.favouritesSection)
        assertEquals(listOf("@a:x", "@b:y"), options.pinnedUsers)

        val unknown = RoomListOptions.fromJson(Json.parseToJsonElement("""{"sort":"sideways"}"""))
        assertEquals(RoomSortMode.Recent, unknown.sort)
    }

    @Test
    fun theEventRoundTrips() {
        val options = RoomListOptions(
            sort = RoomSortMode.Oldest,
            separateRoomsAndDms = false,
            favouritesSection = false,
            pinnedUsers = listOf("@a:x", "@b:y"),
        )
        assertEquals(options, RoomListOptions.fromJson(options.toJson()))
    }

    @Test
    fun pinningPutsTheNewestFirstAndUnpinningLeavesTheRest() {
        val options = RoomListOptions(pinnedUsers = listOf("@a:x", "@b:y"))
        assertEquals(listOf("@c:z", "@a:x", "@b:y"), options.withPin("@c:z", true).pinnedUsers)
        assertEquals(listOf("@a:x"), options.withPin("@b:y", false).pinnedUsers)
        assertEquals(listOf("@a:x", "@b:y"), options.withPin("@a:x", true).pinnedUsers)
    }

    @Test
    fun recentSortsByLastActivityAndPutsSilentRowsLast() {
        val rows = listOf(
            Row("old", 10, 10, "Old"),
            Row("new", 30, 10, "New"),
            Row("never", null, 10, "Never"),
            Row("mid", 20, 10, "Mid"),
        )
        assertEquals(listOf("new", "mid", "old", "never"), sorted(rows, RoomSortMode.Recent))
        // Categorised only changes the headings; inside a group it is still latest activity
        assertEquals(listOf("new", "mid", "old", "never"), sorted(rows, RoomSortMode.Categorised))
    }

    @Test
    fun newestAndOldestUseCreationTimeWithStableNames() {
        val rows = listOf(
            Row("b", 100, 20, "Beta"),
            Row("a", 100, 20, "Alpha"),
            Row("oldest", 10, 5, "Oldest"),
            Row("invite", 99, null, "Invite"),
        )
        assertEquals(listOf("a", "b", "oldest", "invite"), sorted(rows, RoomSortMode.Newest))
        assertEquals(listOf("oldest", "a", "b", "invite"), sorted(rows, RoomSortMode.Oldest))
    }
}
