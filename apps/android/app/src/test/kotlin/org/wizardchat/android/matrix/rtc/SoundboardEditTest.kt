package org.wizardchat.android.matrix.rtc

import kotlinx.serialization.json.Json
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
    fun checksFilesAgainstTheLimits() {
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
    fun idsLookLikeTheWebsAndDiffer() {
        val a = SoundboardEdit.newId()
        assertTrue(Regex("^c_[0-9a-f]{16}$").matches(a))
        assertTrue(a != SoundboardEdit.newId())
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
    fun storedBoardsReadBackTheSame() {
        val board = listOf(sound("a", "One").copy(emoji = "🔔", volume = 0.5f), sound("b"))
        val stored = SoundboardEdit.content(board)
        assertEquals(board, Soundboard.parseBoard(Json.parseToJsonElement(stored.toString())))
    }

    @Test
    fun settingsAreStoredAsTheWebWritesThem() {
        assertEquals("""{"enabled":false,"minPowerLevel":50.0}""", SoundboardEdit.settingsContent(false, 50.0).toString())
    }
}
