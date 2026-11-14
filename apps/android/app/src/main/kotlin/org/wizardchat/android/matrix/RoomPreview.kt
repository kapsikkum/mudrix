package org.wizardchat.android.matrix

import org.wizardchat.core.LastMessage
import org.wizardchat.core.LastMessageKind

/** The localized words a room list preview is built from */
data class RoomPreviewLabels(
    val you: String,
    val photo: String,
    val video: String,
    val audio: String,
    val file: String,
    val sticker: String,
    val poll: String,
    val call: String,
    val newMessage: String,
)

/** The one-line latest-message preview under a room list name */
object RoomPreview {
    /** The preview for `lastMessage` in a direct or group room, or `null` when there is nothing to show */
    fun line(lastMessage: LastMessage?, isDirect: Boolean, labels: RoomPreviewLabels): String? {
        lastMessage ?: return null
        val text = when (lastMessage.kind) {
            LastMessageKind.text -> lastMessage.body.trim().ifBlank { labels.newMessage }
            LastMessageKind.image -> labels.photo
            LastMessageKind.video -> labels.video
            LastMessageKind.audio -> labels.audio
            LastMessageKind.file -> labels.file
            LastMessageKind.sticker -> labels.sticker
            LastMessageKind.poll -> labels.poll
            LastMessageKind.call -> labels.call
            LastMessageKind.other -> labels.newMessage
        }
        val sender = when {
            lastMessage.isOwn -> labels.you
            isDirect -> null
            else -> lastMessage.senderName?.trim()?.takeIf { it.isNotEmpty() }
        }
        return if (sender == null) text else "$sender: $text"
    }
}
