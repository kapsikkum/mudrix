package chat.mudrix.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** [A11y]: touch target padding and what a screen reader is told about new messages */
class A11yTest {
    @Test
    fun smallControlsGrowToFortyEightDp() {
        assertEquals(6f, A11y.targetPadding(36f), 0f)
        assertEquals(4f, A11y.targetPadding(40f), 0f)
        assertEquals(0f, A11y.targetPadding(48f), 0f)
        assertEquals(0f, A11y.targetPadding(56f), 0f)
    }

    @Test
    fun messagesAreReadAsSenderAndText() {
        assertEquals("Juno: hello there", A11y.messageText("Juno", "  hello \n there "))
        assertEquals("Juno", A11y.messageText("Juno", ""))
        assertEquals("Juno", A11y.messageText("Juno", null))
        assertNull(A11y.messageText("", null))
        assertEquals("hi", A11y.messageText("", "hi")?.removePrefix(": "))
    }

    @Test
    fun longMessagesAreCut() {
        val text = A11y.messageText("Juno", "a".repeat(500))!!
        assertTrue(text.endsWith("…"))
        assertTrue(text.length <= "Juno: ".length + A11y.MAX_ANNOUNCE_CHARS + 1)
    }

    @Test
    fun onlyNewMessagesFromOthersAreAnnounced() {
        assertTrue(A11y.announcesMessage(isOwn = false, isNew = true, isContent = true))
        assertFalse(A11y.announcesMessage(isOwn = true, isNew = true, isContent = true))
        assertFalse(A11y.announcesMessage(isOwn = false, isNew = false, isContent = true))
        assertFalse(A11y.announcesMessage(isOwn = false, isNew = true, isContent = false))
    }
}
