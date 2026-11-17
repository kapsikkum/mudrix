package chat.mudrix.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HiddenMediaTest {
    @Test
    fun `hiding keeps known ids in place and appends new ones`() {
        assertEquals(listOf("a", "b", "c"), HiddenMedia.hiddenOrder(listOf("a", "b"), listOf("c")))
        assertEquals(listOf("a", "b"), HiddenMedia.hiddenOrder(listOf("a", "b"), listOf("a")))
        assertEquals(listOf("a", "b", "c"), HiddenMedia.hiddenOrder(listOf("a", "b"), listOf("c", "c")))
    }

    @Test
    fun `blank ids are ignored`() {
        assertEquals(listOf("a"), HiddenMedia.hiddenOrder(listOf("a"), listOf("", "a")))
    }

    @Test
    fun `the oldest choices fall off past the cap`() {
        assertEquals(listOf("b", "c", "d"), HiddenMedia.hiddenOrder(listOf("a", "b", "c"), listOf("d"), max = 3))
        assertEquals(listOf("c", "d"), HiddenMedia.hiddenOrder(listOf("a", "b", "c"), listOf("d"), max = 2))
    }

    @Test
    fun `showing again drops only those ids`() {
        assertEquals(listOf("a", "c"), HiddenMedia.revealedOrder(listOf("a", "b", "c"), listOf("b")))
        assertEquals(listOf("a", "b"), HiddenMedia.revealedOrder(listOf("a", "b"), listOf("z")))
        assertEquals(emptyList<String>(), HiddenMedia.revealedOrder(listOf("a"), listOf("a")))
    }

    @Test
    fun `hiding a gallery and showing one picture again leaves the rest covered`() {
        val gallery = listOf("g1", "g2")
        val hidden = HiddenMedia.hiddenOrder(emptyList(), gallery)
        assertTrue(hidden.containsAll(gallery))
        val left = HiddenMedia.revealedOrder(hidden, listOf("g1"))
        assertFalse(left.contains("g1"))
        assertTrue(left.contains("g2"))
    }
}
