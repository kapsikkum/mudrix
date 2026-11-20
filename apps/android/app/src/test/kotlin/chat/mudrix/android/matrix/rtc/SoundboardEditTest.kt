package chat.mudrix.android.matrix.rtc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SoundboardEditTest {
    private fun sound(id: String, name: String = id) =
        SoundboardSound(id, name, null, "mxc://s/$id", "audio/mpeg", 1200, 4000, 1f)

    @Test
    fun readsTheTypeFromTheSystemOrTheFileName() {
        assertEquals("audio/mpeg", SoundboardEdit.mimetypeOf("audio/mp3", null))
        assertEquals("audio/ogg", SoundboardEdit.mimetypeOf("application/octet-stream", "clip.OGG"))
        assertEquals("audio/wav", SoundboardEdit.mimetypeOf(null, "a.wav"))
        assertNull(SoundboardEdit.mimetypeOf("video/mp4", "a.mp4"))
    }

    @Test
    fun checksFilesAgainstTheCoresLimits() {
        assertNull(SoundboardEdit.check("audio/mpeg", 1000, 2000))
        assertEquals(SoundboardEdit.Problem.Type, SoundboardEdit.check(null, 1000, 2000))
        assertEquals(SoundboardEdit.Problem.Size, SoundboardEdit.check("audio/mpeg", Soundboard.MAX_SIZE_BYTES + 1L, 2000))
        assertEquals(SoundboardEdit.Problem.Size, SoundboardEdit.check("audio/mpeg", 0, 2000))
        assertEquals(SoundboardEdit.Problem.Decode, SoundboardEdit.check("audio/mpeg", 1000, 0))
        assertEquals(SoundboardEdit.Problem.Duration, SoundboardEdit.check("audio/mpeg", 1000, Soundboard.MAX_DURATION_MS + 1))
    }

    @Test
    fun tidiesNamesAndEmoji() {
        assertEquals("Big  boom".replace("  ", " "), SoundboardEdit.cleanName("  Big \n boom  "))
        assertEquals(Soundboard.MAX_NAME_LENGTH, SoundboardEdit.cleanName("x".repeat(100)).length)
        assertNull(SoundboardEdit.cleanEmoji("   "))
        assertEquals("🎺", SoundboardEdit.cleanEmoji(" 🎺 "))
    }

    @Test
    fun shortcodesLookLikeTheStandardsAndDiffer() {
        val a = SoundboardEdit.newId()
        assertTrue(Regex("^c_[0-9a-f]{16}$").matches(a))
        assertTrue(a != SoundboardEdit.newId())
        assertTrue(a.length <= Soundboard.MAX_SHORTCODE_BYTES)
    }

    @Test
    fun editsABoard() {
        val board = listOf(sound("a"), sound("b"))
        assertEquals(listOf("a", "b", "c"), SoundboardEdit.added(board, sound("c")).map { it.id })
        assertEquals(listOf("a"), SoundboardEdit.removed(board, "b").map { it.id })
        assertEquals("Renamed", SoundboardEdit.replaced(board, sound("b", "Renamed"))[1].name)
        val full = List(Soundboard.MAX_SOUNDS) { sound("s$it") }
        val failure = assertThrows(SoundboardEdit.Failure::class.java) { SoundboardEdit.added(full, sound("x")) }
        assertEquals(SoundboardEdit.Problem.Limit, failure.problem)
    }

    @Test
    fun storedSoundsUseTheStandardFields() {
        val stored = SoundboardEdit.stored(sound("a", "One").copy(emoji = "🔔"))
        assertEquals("a", stored.shortcode)
        assertEquals("mxc://s/a", stored.url)
        assertEquals("One", stored.body)
        assertEquals("🔔", stored.emoji)
        assertEquals("audio/mpeg", stored.mimetype)
        assertEquals(1200L, stored.durationMs)
        assertEquals(4000L, stored.size)
    }

    @Test
    fun settingsAreStoredAsTheWebWritesThem() {
        assertEquals("""{"enabled":false,"minPowerLevel":50.0}""", SoundboardEdit.settingsContent(false, 50.0).toString())
    }
}
