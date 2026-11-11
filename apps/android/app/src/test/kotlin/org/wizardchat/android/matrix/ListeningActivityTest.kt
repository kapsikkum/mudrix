package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ListeningActivityTest {
    private val now = 1_000_000L

    @Test
    fun aTrackExpiresAfterTheTtl() {
        val track = ListeningActivity.track("  Song \n name ", "Band", 5, now)!!
        assertEquals("listening", track.type)
        assertEquals("Song name", track.name)
        assertEquals("Band", track.details)
        assertEquals(now + ListeningActivity.TTL_MS, track.expiresAt)
    }

    @Test
    fun noTitleIsNoActivity() {
        assertNull(ListeningActivity.track(null, "Band", 0, now))
        assertNull(ListeningActivity.track("   ", "Band", 0, now))
    }

    @Test
    fun mergeKeepsRunningGamesAndReplacesOldListening() {
        val game = ProfileActivity("playing", "Game", "", 1, now + 1000)
        val over = ProfileActivity("playing", "Old game", "", 1, now - 1)
        val oldSong = ProfileActivity("listening", "Old song", "", 1, now + 1000)
        val song = ListeningActivity.track("New", null, 2, now)
        val merged = ListeningActivity.merge(listOf(game, over, oldSong), song, now)
        assertEquals(listOf("Game", "New"), merged.map { it.name })
    }

    @Test
    fun stoppingLeavesOnlyOtherActivities() {
        val game = ProfileActivity("playing", "Game", "", 1, now + 1000)
        val song = ProfileActivity("listening", "Song", "", 1, now + 1000)
        assertEquals(listOf(game), ListeningActivity.merge(listOf(game, song), null, now))
        assertNull(ListeningActivity.value(ListeningActivity.merge(listOf(song), null, now)))
    }

    @Test
    fun valueRoundTripsThroughTheParser() {
        val song = ListeningActivity.track("Song", "Band", 7, now)!!
        val value = ListeningActivity.value(listOf(song))
        assertTrue(value is JsonArray)
        assertEquals(song.expiresAt.toDouble(), ((value as JsonArray)[0] as JsonObject)["expires"]!!.let { (it as JsonPrimitive).doubleOrNull }!!, 0.0)
        assertEquals(listOf(song), ProfileFields.parseActivities(value))
        assertNotNull(value)
    }
}
