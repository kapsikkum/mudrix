package chat.mudrix.android.matrix.rtc

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import chat.mudrix.core.SoundboardSound as PackSound
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SoundboardTest {
    private fun json(text: String) = Json.parseToJsonElement(text)

    @Test
    fun everyOldBuiltInClipHasItsFile() {
        val raw = File("../../../packages/sounds/raw").listFiles().orEmpty().map { it.nameWithoutExtension }.toSet()
        assertEquals(18, Soundboard.builtIn.size)
        Soundboard.builtIn.forEach { assertTrue(it.resource, it.resource in raw) }
    }

    @Test
    fun standardPressCarriesOnlyUrlShortcodeAndEmoji() {
        val sound = PackSound(shortcode = "sad_trombone", url = "mxc://s/id", body = "Sad trombone", emoji = "🎺", mimetype = "audio/mpeg", size = 10, durationMs = 5060)
        val clip = Soundboard.toClip(sound, builtIn = true)
        assertEquals("""{"url":"mxc://s/id","shortcode":"sad_trombone","org.wizardchat.emoji":"🎺"}""", Soundboard.message(clip).toString())
        val play = Soundboard.parse(Soundboard.message(clip).toString().encodeToByteArray())!!
        assertEquals("mxc://s/id", play.url)
        assertEquals("sad_trombone", play.shortcode)
        assertEquals("🎺", play.emoji)
    }

    @Test
    fun standardPressIsChecked() {
        assertNull(Soundboard.parse("""{"url":"https://evil/x.mp3","shortcode":"a"}""".encodeToByteArray()))
        assertNull(Soundboard.parse("""{"shortcode":"a"}""".encodeToByteArray()))
        assertNull(Soundboard.parse("[]".encodeToByteArray()))
        val big = buildJsonObject { put("url", "mxc://s/id"); put("shortcode", "x".repeat(200)) }
        assertNull(Soundboard.parse(big.toString().encodeToByteArray())?.shortcode)
        val emoji = buildJsonObject { put("url", "mxc://s/id"); put(Soundboard.EMOJI_KEY, "x".repeat(40)) }
        assertNull(Soundboard.parse(emoji.toString().encodeToByteArray())?.emoji)
        assertNull(Soundboard.parse(ByteArray(Soundboard.MAX_MESSAGE_BYTES + 1) { ' '.code.toByte() }))
    }

    @Test
    fun oldPressStillPlaysFor26124Clients() {
        val ok = """{"sound":{"id":"a","name":"x","volume":2,"url":"mxc://s/id","mimetype":"audio/x-wav; codecs=1","durationMs":9000}}"""
        val press = Soundboard.parsePress(json(ok))!!
        assertEquals("audio/wav", press.mimetype)
        assertEquals(1f, press.volume, 0f)
        assertNull(Soundboard.parsePress(json("""{"sound":{"id":"a","url":"https://evil/x.mp3","mimetype":"audio/mpeg"}}""")))
        assertNull(Soundboard.parsePress(json("""{"sound":{"id":"a","url":"mxc://s/id","mimetype":"video/mp4"}}""")))
        assertNull(Soundboard.parsePress(json("""{"sound":{"id":"nope","builtin":true}}""")))
        val builtIn = Soundboard.parsePress(json("""{"sound":{"id":"sad-trombone","builtin":true}}"""))!!
        assertTrue(builtIn.builtIn)
        assertEquals(3782L, builtIn.durationMs)
        assertNull(Soundboard.parsePress(json("[]")))
    }

    @Test
    fun limitsApplyPerSenderAndPerSound() {
        val limiter = SoundboardLimiter.forSending()
        assertEquals(PlayResult.Ok, limiter.check("@a:x", "ding", 0))
        assertEquals(PlayResult.RateLimited, limiter.check("@a:x", "pop", 100))
        assertEquals(PlayResult.Cooldown, limiter.check("@a:x", "ding", 600))
        assertEquals(PlayResult.Ok, limiter.check("@a:x", "pop", 600))
        assertEquals(PlayResult.Ok, limiter.check("@b:x", "ding", 100))
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
