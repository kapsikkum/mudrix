package org.wizardchat.android.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TextFileTest {
    @Test
    fun textFilesArePickedByExtensionOrMimeType() {
        assertTrue(TextFile.showsCard("notes.md", null, null))
        assertTrue(TextFile.showsCard("config.JSON", "application/octet-stream", 10))
        assertTrue(TextFile.showsCard("notes", "text/plain", 10))
        assertFalse(TextFile.showsCard("photo.png", "image/png", 10))
        assertFalse(TextFile.showsCard("document.txt", "application/pdf", 10))
        assertFalse(TextFile.showsCard("document.pdf", null, 10))
    }

    @Test
    fun onlySmallFilesGetTheCard() {
        assertTrue(TextFile.showsCard("a.txt", "text/plain", TextFile.CARD_MAX_BYTES))
        assertFalse(TextFile.showsCard("a.txt", "text/plain", TextFile.CARD_MAX_BYTES + 1))
    }

    @Test
    fun theHeadStopsAtTheLimitWithoutAHalfCharacter() {
        val text = "héllo"
        val bytes = text.toByteArray()
        assertEquals("h", TextFile.decodeHead(bytes, 2))
        assertEquals(text, TextFile.decodeHead(bytes, bytes.size))
        assertEquals(text, TextFile.decodeHead(bytes))
    }

    @Test
    fun anExpandedCardIsCapped() {
        val long = "x".repeat(TextFile.MAX_CARD_CHARS + 20)
        assertEquals(TextFile.MAX_CARD_CHARS, TextFile.clampForCard(long).length)
        assertEquals("short", TextFile.clampForCard("short"))
    }
}
