package chat.mudrix.android.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SafeFileNameTest {
    private fun assertSafe(name: String, safe: String) {
        assertTrue("empty name for <$name>", safe.isNotEmpty())
        assertFalse("separator in <$safe>", safe.contains('/') || safe.contains('\\'))
        assertFalse("dot-dot in <$safe>", safe.contains(".."))
        assertFalse("control character in <$safe>", safe.any { it.isISOControl() })
        assertNotEquals(".", safe)
        assertNotEquals("..", safe)
        assertTrue(
            "more than $MAX_SAFE_FILE_NAME_BYTES UTF-8 bytes: ${safe.encodeToByteArray().size}",
            safe.encodeToByteArray().size <= MAX_SAFE_FILE_NAME_BYTES,
        )
    }

    @Test
    fun aTraversalNameKeepsOnlyItsLastComponent() {
        assertEquals("accounts.bin", safeFileName("../../files/accounts.bin"))
    }

    @Test
    fun bothKindsOfSeparatorAreCut() {
        assertEquals("b", safeFileName("a/b"))
        assertEquals("b", safeFileName("a\\b"))
        assertEquals("c", safeFileName("a/b\\c"))
    }

    @Test
    fun dotAndEmptyNamesGetAGeneratedName() {
        for (name in listOf(".", "..", "...", "", "   ", "/", "a/")) {
            val safe = safeFileName(name)
            assertSafe(name, safe)
            assertTrue("expected a generated name for <$name>, got <$safe>", safe.startsWith("attachment-"))
        }
    }

    @Test
    fun controlCharactersAreStripped() {
        assertEquals("evilname.txt", safeFileName("evil\u0000na\u0007me\n.txt"))
    }

    @Test
    fun aVeryLongNameIsCappedAndKeepsItsExtension() {
        val safe = safeFileName("x".repeat(400) + ".jpeg")
        assertSafe(safe, safe)
        assertTrue(safe.endsWith(".jpeg"))
        assertEquals(MAX_SAFE_FILE_NAME_BYTES, safe.encodeToByteArray().size)
    }

    @Test
    fun aLongUnicodeNameIsCutWithoutSplittingACharacter() {
        val safe = safeFileName("\uD83D\uDE00".repeat(100) + ".png")
        assertSafe(safe, safe)
        assertTrue(safe.endsWith(".png"))
        assertFalse(Character.isHighSurrogate(safe[safe.length - 5]))
    }

    @Test
    fun anOrdinaryNameIsKept() {
        assertEquals("photo.jpg", safeFileName("photo.jpg"))
    }
}
