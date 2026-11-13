package org.wizardchat.android.matrix

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProfileFieldsTest {
    private fun json(text: String) = Json.parseToJsonElement(text) as JsonObject

    @Test
    fun readsTheStableAndUnstableNames() {
        val profile = ProfileFields.parse(
            json(
                """{"gay.fomx.biography":{"m.text":[{"body":"hi\r\n\r\n\r\nthere"}]},
                   "m.pronouns":[{"language":"en","summary":"she/her"},"they/them","she/her"],
                   "m.tz":"Europe/Berlin","io.github.kapsikkum.mudrix.accent":"#ABC",
                   "chat.mudrix.is_user":true}""",
            ),
        )
        assertEquals("hi\n\nthere", profile.bio)
        assertEquals(listOf("she/her", "they/them"), profile.pronouns)
        assertEquals("Europe/Berlin", profile.timezone)
        assertEquals("#aabbcc", profile.accent)
        assertTrue(profile.isMudrixUser)
    }

    @Test
    fun dropsWhatItCannotTrust() {
        val profile = ProfileFields.parse(
            json("""{"m.tz":"Not/AZone","io.github.kapsikkum.mudrix.avatar_decoration":"https://evil.example/x.svg","io.github.kapsikkum.mudrix.accent":"red"}"""),
        )
        assertNull(profile.timezone)
        assertNull(profile.avatarDecoration)
        assertNull(profile.accent)
        assertFalse(profile.isMudrixUser)
    }

    @Test
    fun readsPackCosmeticsInEveryStoredShape() {
        val profile = ProfileFields.parse(
            json(
                """{"io.github.kapsikkum.mudrix.avatar_decoration":"mxc://example.org/deco",
                   "io.github.kapsikkum.mudrix.profile_effect":"mxc://example.org/fx",
                   "chat.mudrix.nameplate":{"url":"mxc://example.org/plate","palette":"berry"},
                   "io.github.kapsikkum.mudrix.profile_frame":{"url":"","pieces":[{"pos":"top","url":"mxc://example.org/top","layer":"back"}]}}""",
            ),
        )
        assertEquals(CosmeticPacks.Value.Media("mxc://example.org/deco"), profile.avatarDecoration)
        assertEquals(CosmeticPacks.Value.Media("mxc://example.org/fx"), profile.profileEffect)
        assertEquals(CosmeticPacks.Value.Media("mxc://example.org/plate", "berry"), profile.nameplate)
        assertEquals(
            CosmeticPacks.Value.Media("", pieces = listOf(CosmeticPacks.FramePiece("top", "mxc://example.org/top", "back"))),
            profile.profileFrame,
        )
    }

    @Test
    fun htmlBioIsOnlyAFallback() {
        val value = json("""{"m.biography":{"m.text":[{"body":"<b>x</b><br>y","mimetype":"text/html"},{"body":"plain"}]}}""")
        assertEquals("plain", ProfileFields.parse(value).bio)
        val htmlOnly = json("""{"m.biography":{"m.text":[{"body":"<b>x</b><br>y","mimetype":"text/html"}]}}""")
        assertEquals("x\ny", ProfileFields.parse(htmlOnly).bio)
    }

    @Test
    fun activitiesNeedAnExpiry() {
        val value = json(
            """{"io.github.kapsikkum.mudrix.activity":[{"type":"playing","name":"Game","expires":2000,"started":1000},
               {"type":"listening","name":"No expiry"},{"type":"flying","name":"x","expires":5}]}""",
        )
        val activities = ProfileFields.parse(value).activities
        assertEquals(1, activities.size)
        assertEquals(1000L, activities[0].startedAt)
        assertEquals(emptyList<ProfileActivity>(), ProfileFields.live(activities, now = 2000))
        assertEquals(1, ProfileFields.live(activities, now = 1999).size)
    }

    @Test
    fun pronounInputIsSplitAndCapped() {
        assertEquals(listOf("a", "b", "c", "d", "e"), ProfileFields.parsePronounInput("a, b; c\nd, e, f"))
    }

    @Test
    fun localTimeOffsetIsRelativeToTheViewer() {
        val now = Instant.parse("2026-01-15T12:00:00Z")
        val (time, offset) = ProfileFields.localTime("Asia/Tokyo", now, ZoneId.of("UTC"))!!
        assertEquals("21:00", time.toString())
        assertEquals(9.0, offset, 0.0)
    }

    @Test
    fun softwareAndNotes() {
        assertEquals("Synapse", ProfileFields.describeSoftware(" synapse ").label)
        assertEquals("X", ProfileFields.describeSoftware("xyz").glyph)
        assertEquals("example.org", ProfileFields.serverNameOf("@a:example.org"))
        val notes = ProfileFields.parseNotes(json("""{"notes":{"@a:b":"hello","@c:d":""}}"""))
        assertEquals(mapOf("@a:b" to "hello"), notes)
        assertEquals(notes, ProfileFields.parseNotes(ProfileFields.notesValue(notes)))
    }
}
