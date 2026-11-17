package chat.mudrix.android.matrix

import chat.mudrix.core.RoomSummary
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** How the DM screen orders its rows, saved in account data so Android and iOS agree. */
enum class RoomSortMode(val wire: String) {
    /** Latest activity first; the old app's order and the default. */
    Recent("recent"),

    /** Rooms created most recently first, from `m.room.create`. */
    Newest("newest"),

    /** Rooms created longest ago first. */
    Oldest("oldest"),

    /** Pinned, favourites, DMs, then rooms; sections are always shown. */
    Categorised("categorised");

    companion object {
        fun fromWire(value: String?): RoomSortMode = entries.firstOrNull { it.wire == value } ?: Recent
    }
}

/**
 * The DM screen's preferences: its order, whether rooms and DMs share a list, whether
 * favourites get their own section, and the users whose DMs are pinned to the top.
 *
 * Kept in `io.github.kapsikkum.mudrix.room_list`; missing keys use the old app's behaviour, so an
 * account that never opened the sheet sees no change.
 */
data class RoomListOptions(
    val sort: RoomSortMode = RoomSortMode.Recent,
    val separateRoomsAndDms: Boolean = true,
    val favouritesSection: Boolean = true,
    /** Pinned DMs' partners, newest pin first */
    val pinnedUsers: List<String> = emptyList(),
) {
    fun toJson(): JsonObject = buildJsonObject {
        put("sort", sort.wire)
        put("separateRoomsAndDms", separateRoomsAndDms)
        put("favouritesSection", favouritesSection)
        putJsonArray("pinnedUsers") { pinnedUsers.forEach { add(JsonPrimitive(it)) } }
    }

    fun withPin(userId: String, pinned: Boolean): RoomListOptions = copy(
        pinnedUsers = if (pinned) listOf(userId) + (pinnedUsers - userId) else pinnedUsers - userId,
    )

    companion object {
        val EVENT_TYPE = Namespace.mudrixKey("room_list")

        fun fromJson(content: JsonElement?): RoomListOptions {
            val fields = content as? JsonObject ?: return RoomListOptions()
            val pins = (fields["pinnedUsers"] as? JsonArray)
                .orEmpty()
                .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                .distinct()
            return RoomListOptions(
                sort = RoomSortMode.fromWire((fields["sort"] as? JsonPrimitive)?.contentOrNull),
                separateRoomsAndDms = (fields["separateRoomsAndDms"] as? JsonPrimitive)?.booleanOrNull ?: true,
                favouritesSection = (fields["favouritesSection"] as? JsonPrimitive)?.booleanOrNull ?: true,
                pinnedUsers = pins,
            )
        }
    }
}

/**
 * The rows in [mode]'s order. A row without the sort key goes after the ones that have it, and
 * equal keys fall back to the name, so the order is stable for rooms that have never had activity.
 * `Categorised` only changes how the list is grouped; inside each group it is latest activity.
 */
internal fun <T> sortRoomRows(
    rows: List<T>,
    mode: RoomSortMode,
    lastActivity: (T) -> Long?,
    createdAt: (T) -> Long?,
    name: (T) -> String,
): List<T> {
    fun byName(): Comparator<T> = compareBy { name(it).lowercase() }
    return when (mode) {
        RoomSortMode.Recent, RoomSortMode.Categorised -> rows.sortedWith(
            compareByDescending<T> { lastActivity(it) != null }
                .thenByDescending { lastActivity(it) ?: 0L }
                .then(byName()),
        )
        RoomSortMode.Newest -> rows.sortedWith(
            compareByDescending<T> { createdAt(it) != null }
                .thenByDescending { createdAt(it) ?: 0L }
                .then(byName()),
        )
        RoomSortMode.Oldest -> rows.sortedWith(
            compareBy<T> { createdAt(it) == null }
                .thenBy { createdAt(it) ?: 0L }
                .then(byName()),
        )
    }
}

internal fun List<RoomSummary>.sortedForRoomList(options: RoomListOptions): List<RoomSummary> =
    sortRoomRows(this, options.sort, { it.lastActivity }, { it.createdAt }, { it.displayName })
