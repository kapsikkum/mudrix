package org.wizardchat.android.matrix

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
}
