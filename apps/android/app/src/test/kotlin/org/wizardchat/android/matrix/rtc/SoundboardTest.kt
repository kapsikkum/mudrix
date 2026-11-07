package org.wizardchat.android.matrix.rtc

import java.io.File
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SoundboardTest {
    private fun json(text: String) = Json.parseToJsonElement(text)

    @Test
    fun everyBuiltInClipHasItsFile() {
        val raw = File("../../../packages/sounds/raw").listFiles().orEmpty().map { it.nameWithoutExtension }.toSet()
        assertEquals(18, Soundboard.builtIn.size)
        Soundboard.builtIn.forEach { assertTrue(it.resource, it.resource in raw) }
    }

    @Test
    fun builtInPressCarriesOnlyItsId() {
        val clip = Soundboard.builtInClip("sad-trombone")!!
        val content = Soundboard.playContent(clip).toString()
        assertEquals("""{"sound":{"id":"sad-trombone","name":"Sad Trombone","emoji":"😢","volume":1.0,"builtin":true}}""", content)
        val press = Soundboard.parsePress(json(content))!!
        assertTrue(press.builtIn)
        assertEquals(3782L, press.durationMs)
    }

    @Test
    fun customPressNeedsAnMxcUrlAndAKnownType() {
        val ok = """{"sound":{"id":"a","name":"x","volume":2,"url":"mxc://s/id","mimetype":"audio/x-wav; codecs=1","durationMs":9000}}"""
        val press = Soundboard.parsePress(json(ok))!!
        assertEquals("audio/wav", press.mimetype)
        assertEquals(1f, press.volume, 0f)
        assertEquals(Soundboard.MAX_DURATION_MS, press.durationMs)
        assertNull(Soundboard.parsePress(json("""{"sound":{"id":"a","url":"https://evil/x.mp3","mimetype":"audio/mpeg"}}""")))
        assertNull(Soundboard.parsePress(json("""{"sound":{"id":"a","url":"mxc://s/id","mimetype":"video/mp4"}}""")))
        assertNull(Soundboard.parsePress(json("""{"sound":{"id":"nope","builtin":true}}""")))
        assertNull(Soundboard.parsePress(json("[]")))
    }

    @Test
    fun boardKeepsOnlyWellFormedClips() {
        val board = Soundboard.parseBoard(
            json(
                """{"sounds":[
                {"id":"a","name":"A","url":"mxc://s/1","mimetype":"audio/mp3","durationMs":1000,"size":100,"volume":0.5},
                {"id":"a","name":"dup","url":"mxc://s/2","mimetype":"audio/mp3","durationMs":1000,"size":100},
                {"id":"b","name":"B","url":"http://s/3","mimetype":"audio/mp3","durationMs":1000,"size":100},
                {"id":"c","name":"C","url":"mxc://s/4","mimetype":"audio/mp3","durationMs":0,"size":100}]}""",
            ),
        )
        assertEquals(listOf("a"), board.map { it.id })
        assertEquals("audio/mpeg", board[0].mimetype)
        assertEquals(0.5f, board[0].volume, 0f)
    }

    @Test
    fun limitsApplyPerSenderAndPerSound() {
        val limiter = SoundboardLimiter.forSending()
        assertEquals(PlayResult.Ok, limiter.check("@a:x", "builtIn:ding", 0))
        assertEquals(PlayResult.RateLimited, limiter.check("@a:x", "builtIn:pop", 100))
        assertEquals(PlayResult.Cooldown, limiter.check("@a:x", "builtIn:ding", 600))
        assertEquals(PlayResult.Ok, limiter.check("@a:x", "builtIn:pop", 600))
        assertEquals(PlayResult.Ok, limiter.check("@b:x", "builtIn:ding", 100))
        var t = 1_000L
        repeat(3) { assertEquals(PlayResult.Ok, limiter.check("@c:x", "s$it", t)); t += 500 }
        assertEquals(PlayResult.Ok, limiter.check("@c:x", "s3", t))
        t += 500
        assertEquals(PlayResult.Ok, limiter.check("@c:x", "s4", t))
        t += 500
        assertEquals(PlayResult.RateLimited, limiter.check("@c:x", "s5", t))
        assertFalse(PlayResult.Ok == limiter.check("@c:x", "s6", t + 100))
        assertNotNull(limiter)
    }
}
