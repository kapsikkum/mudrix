package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * "Listening to": what the phone's media session plays, shared on the profile (`io.github.kapsikkum.mudrix.activity`,
 * like the desktop app does for games). It carries an expiry that is pushed forward while the song lasts, so a
 * crash or a dead battery clears it by itself.
 */
object ListeningActivity {
    /** How long a written activity stays valid, and how often it is renewed (the web app's numbers) */
    const val TTL_MS = 12 * 60_000L
    const val RENEW_MS = 5 * 60_000L

    private const val MAX_CHARS = 80

    private fun clean(text: String?) = text.orEmpty().replace(Regex("[\\u0000-\\u001F\\u007F-\\u009F]"), " ").replace(Regex("\\s+"), " ").trim().take(MAX_CHARS)

    /** The activity for a track, or null when it has no title */
    fun track(title: String?, artist: String?, startedAt: Long, now: Long): ProfileActivity? {
        val name = clean(title).ifEmpty { return null }
        return ProfileActivity("listening", name, clean(artist), startedAt, now + TTL_MS)
    }

    /** What the profile should hold: the activities of other devices that are still running, then ours */
    fun merge(existing: List<ProfileActivity>, listening: ProfileActivity?, now: Long): List<ProfileActivity> =
        (ProfileFields.live(existing, now).filter { it.type != "listening" } + listOfNotNull(listening)).take(ProfileFields.MAX_ACTIVITIES)

    /** The profile field's value, or null to clear the field */
    fun value(activities: List<ProfileActivity>): JsonElement? {
        if (activities.isEmpty()) return null
        return JsonArray(
            activities.map {
                buildJsonObject {
                    put("type", it.type)
                    put("name", it.name)
                    if (it.details.isNotEmpty()) put("details", it.details)
                    if (it.startedAt > 0) put("started", it.startedAt)
                    put("expires", it.expiresAt)
                }
            },
        )
    }

    /** The same track is still playing (a renewal is due only by time) */
    fun same(a: ProfileActivity?, b: ProfileActivity?) = a?.name == b?.name && a?.details == b?.details
}
