package org.wizardchat.android.matrix

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.SpaceNode
import org.wizardchat.core.SpaceSummary

/** A room or space both people are in */
data class MutualEntry(val id: String, val name: String, val avatarUrl: String?)

data class MutualRooms(val rooms: List<MutualEntry>, val spaces: List<MutualEntry>) {
    val isEmpty get() = rooms.isEmpty() && spaces.isEmpty()
}

/** Rooms in common with someone, asked of the homeserver (MSC2666), matched against the rooms this device knows */
object MutualRoomsLookup {
    private val PATHS = listOf(
        "/_matrix/client/unstable/uk.half-shot.msc2666/user/mutual_rooms",
        "/_matrix/client/v3/user/mutual_rooms",
    )

    /** The room ids of a `mutual_rooms` answer, or null when the body is not one */
    fun parseJoined(body: String): List<String>? {
        val joined = (runCatching { Json.parseToJsonElement(body) }.getOrNull() as? JsonObject)?.get("joined") as? JsonArray ?: return null
        return joined.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
    }

    /** Joined rooms and top-level spaces among `ids`, by name; direct chats and replaced rooms are left out */
    fun classify(ids: List<String>, rooms: List<RoomSummary>, spaces: List<SpaceSummary>, graph: List<SpaceNode>): MutualRooms {
        val roomsById = rooms.associateBy { it.id }
        val spacesById = spaces.associateBy { it.id }
        val children = graph.flatMap { node -> node.children.map { it.roomId } }.toSet()
        val foundRooms = mutableListOf<MutualEntry>()
        val foundSpaces = mutableListOf<MutualEntry>()
        for (id in ids.distinct()) {
            val space = spacesById[id]
            if (space != null) {
                if (id !in children) foundSpaces += MutualEntry(id, space.name.ifEmpty { id }, space.avatarUrl)
                continue
            }
            val room = roomsById[id] ?: continue
            if (!room.isDirect && !room.isTombstoned && !room.isSpace) {
                foundRooms += MutualEntry(id, room.name?.ifEmpty { null } ?: id, room.avatarUrl)
            }
        }
        val byName = compareBy<MutualEntry, String>(String.CASE_INSENSITIVE_ORDER) { it.name }
        return MutualRooms(foundRooms.sortedWith(byName), foundSpaces.sortedWith(byName))
    }

    /** Asks the homeserver; null when it does not support the lookup */
    suspend fun fetch(homeserverUrl: String, accessToken: String, userId: String): List<String>? = withContext(Dispatchers.IO) {
        val base = homeserverUrl.trimEnd('/')
        for (path in PATHS) {
            val connection = runCatching {
                (URL("$base$path?user_id=${URLEncoder.encode(userId, "UTF-8")}").openConnection() as HttpURLConnection).apply {
                    setRequestProperty("Authorization", "Bearer $accessToken")
                    connectTimeout = 10_000
                    readTimeout = 15_000
                }
            }.getOrNull() ?: continue
            try {
                if (connection.responseCode == 200) {
                    parseJoined(connection.inputStream.bufferedReader().use { it.readText() })?.let { return@withContext it }
                }
            } catch (_: Exception) {
            } finally {
                connection.disconnect()
            }
        }
        null
    }
}
