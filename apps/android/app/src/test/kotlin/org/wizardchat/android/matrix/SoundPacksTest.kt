package org.wizardchat.android.matrix

import java.io.File
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SoundPacksTest {
    @Test
    fun everyResourceIsAFileInThePackage() {
        val raw = File("../../../packages/sounds/raw").listFiles().orEmpty().map { it.nameWithoutExtension }.toSet()
        assertTrue("sound files not found", raw.isNotEmpty())
        for (pack in SoundPacks.all) {
            for ((kind, resource) in pack.files) assertTrue("${pack.id}/${kind.id}: $resource", resource in raw)
        }
    }

    @Test
    fun fallsBackLikeTheWeb() {
        assertEquals("snd_cinny_mention", SoundPacks.resource("cinny", SoundKind.Mention))
        // A pack without a mention sound plays its message sound, without ring the default pack's ring
        assertEquals("snd_commet_message", SoundPacks.resource("commet", SoundKind.Mention))
        assertEquals("snd_megadrive2_ring", SoundPacks.resource("commet", SoundKind.Ring))
        assertEquals("mute", SoundPacks.resource("commet", SoundKind.Mute))
        assertEquals("alert", SoundPacks.resource("wizardchat", SoundKind.Message))
        assertEquals("snd_megadrive2_message", SoundPacks.resource("gone", SoundKind.Message))
    }

    @Test
    fun overridesBeatThePackAndOffSilences() {
        val overrides = mapOf(SoundKind.Mention to "glass", SoundKind.Message to SoundPacks.OFF, SoundKind.Join to "removed")
        assertEquals("glass", SoundPacks.resolve(SoundKind.Mention, "warm", overrides))
        assertNull(SoundPacks.resolve(SoundKind.Message, "warm", overrides))
        assertEquals("warm", SoundPacks.resolve(SoundKind.Join, "warm", overrides))
        assertEquals("megadrive2", SoundPacks.resolve(SoundKind.Leave, "gone", overrides))
    }

    @Test
    fun volumeFollowsTheSliderOnlyForMessagesAndCalls() {
        assertEquals(0.3f, SoundPacks.volume(SoundKind.Message, 30), 0.001f)
        assertEquals(0.5f, SoundPacks.volume(SoundKind.Mute, 30), 0.001f)
        assertEquals(1f, SoundPacks.volume(SoundKind.Ring, 400), 0.001f)
    }

    @Test
    fun syncedOverridesKeepOnlyKnownSounds() {
        val json = Json.parseToJsonElement("""{"mention":"glass","camera-on":"off","nope":"glass","join":"","leave":"Bad Name"}""")
        val clean = SoundPacks.sanitizeOverrides(json)!!
        assertEquals(mapOf(SoundKind.Mention to "glass", SoundKind.CameraOn to "off"), clean)
        assertEquals(clean, SoundPacks.sanitizeOverrides(SoundPacks.overridesJson(clean)))
        assertNull(SoundPacks.sanitizeOverrides(Json.parseToJsonElement("[]")))
    }
}
