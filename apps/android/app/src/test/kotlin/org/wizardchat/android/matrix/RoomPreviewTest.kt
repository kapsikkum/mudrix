package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.wizardchat.core.LastMessage
import org.wizardchat.core.LastMessageKind

class RoomPreviewTest {
    private val labels = RoomPreviewLabels(
        you = "You",
        photo = "Photo",
        video = "Video",
        audio = "Voice message",
        file = "File",
        sticker = "Sticker",
        poll = "Poll",
        call = "Call",
        newMessage = "New message",
    )

    private fun message(
        kind: LastMessageKind,
        body: String = "",
        own: Boolean = false,
        sender: String? = null,
    ) = LastMessage(
        body = body,
        senderId = "@sender:example.org",
        senderName = sender,
        isOwn = own,
        timestamp = 1_700_000_000_000,
        kind = kind,
    )

    private fun line(isDirect: Boolean, kind: LastMessageKind, body: String = "", own: Boolean = false, sender: String? = null) =
        RoomPreview.line(message(kind, body, own, sender), isDirect, labels)

    @Test
    fun `a direct chat shows the text alone unless it is the user's own`() {
        assertEquals("hello", line(isDirect = true, LastMessageKind.text, body = "hello"))
        assertEquals("You: hello", line(isDirect = true, LastMessageKind.text, body = "hello", own = true))
    }

    @Test
    fun `a group room names the sender`() {
        assertEquals("Alice: hello", line(isDirect = false, LastMessageKind.text, body = "hello", sender = "Alice"))
        assertEquals("You: hello", line(isDirect = false, LastMessageKind.text, body = "hello", own = true))
        assertEquals("hello", line(isDirect = false, LastMessageKind.text, body = "hello"))
    }

    @Test
    fun `every kind has its own label`() {
        assertEquals("Photo", line(isDirect = true, LastMessageKind.image))
        assertEquals("Video", line(isDirect = true, LastMessageKind.video))
        assertEquals("Voice message", line(isDirect = true, LastMessageKind.audio))
        assertEquals("File", line(isDirect = true, LastMessageKind.file))
        assertEquals("Sticker", line(isDirect = true, LastMessageKind.sticker))
        assertEquals("Poll", line(isDirect = true, LastMessageKind.poll))
        assertEquals("Call", line(isDirect = true, LastMessageKind.call))
        assertEquals("Alice: Photo", line(isDirect = false, LastMessageKind.image, sender = "Alice"))
        assertEquals("You: Photo", line(isDirect = false, LastMessageKind.image, own = true))
    }

    @Test
    fun `an empty body falls back to the neutral label`() {
        assertEquals("New message", line(isDirect = true, LastMessageKind.other))
        assertEquals("Alice: New message", line(isDirect = false, LastMessageKind.other, sender = "Alice"))
        assertEquals("New message", line(isDirect = true, LastMessageKind.text, body = "  "))
    }

    @Test
    fun `a room without a last message has no preview`() {
        assertNull(RoomPreview.line(null, isDirect = true, labels))
        assertNull(RoomPreview.line(null, isDirect = false, labels))
    }
}
