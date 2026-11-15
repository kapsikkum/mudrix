package chat.mudrix.android.matrix

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** What the room list's long-press menu offers: marking a room read or unread, and flagging a Modern text channel */
object RoomMenu {
    /** Which of "Mark as read" and "Mark as unread" apply; a room marked unread counts as unread */
    data class Actions(val markRead: Boolean, val markUnread: Boolean)

    /** As on the web: read applies while anything is unread, unread only when nothing is */
    fun actions(readCount: Int, mentionCount: Int): Actions = Actions(
        markRead = readCount > 0 || mentionCount > 0,
        markUnread = readCount <= 0 && mentionCount <= 0,
    )

    /** Only a plain text room of a Modern list can be flagged, and only by someone who may write the state */
    fun offersVoiceChannel(modern: Boolean, isVoiceRoom: Boolean, maySendState: Boolean): Boolean =
        modern && maySendState && !isVoiceRoom

    /** The `io.github.kapsikkum.mudrix.voice_channel` content that turns the flag on or off */
    fun voiceChannelContent(enabled: Boolean): JsonObject = buildJsonObject { put("enabled", enabled) }

    /**
     * The room ids after moving the room at [index] by [offset] (`-1` up, `1` down), or null when that would leave
     * the list. The same save the reorder handles use.
     */
    fun moved(ids: List<String>, index: Int, offset: Int): List<String>? {
        if (offset == 0 || index !in ids.indices) return null
        val to = index + offset
        if (to !in ids.indices) return null
        val next = ids.toMutableList()
        java.util.Collections.swap(next, index, to)
        return next
    }
}
