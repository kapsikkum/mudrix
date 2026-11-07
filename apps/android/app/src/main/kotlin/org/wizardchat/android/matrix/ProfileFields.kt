package org.wizardchat.android.matrix

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** One thing a person is playing or listening to (`io.github.kapsikkum.mudrix.activity`) */
data class ProfileActivity(
    val type: String,
    val name: String,
    val details: String,
    val startedAt: Long,
    val expiresAt: Long,
)

/** What a profile shows beyond name and picture; `profileFields.ts` and `profileCosmetics.ts` in Kotlin */
data class ExtendedProfile(
    val bio: String = "",
    val pronouns: List<String> = emptyList(),
    val timezone: String? = null,
    val activities: List<ProfileActivity> = emptyList(),
    val accent: String? = null,
    val avatarDecoration: String? = null,
    val nameplate: String? = null,
    val profileFrame: String? = null,
    val isMudrixUser: Boolean = false,
)

object ProfileFields {
    const val BIO = "m.biography"
    const val BIO_UNSTABLE = "gay.fomx.biography"
    const val PRONOUNS = "m.pronouns"
    const val PRONOUNS_UNSTABLE = "io.fsky.nyx.pronouns"
    const val TZ = "m.tz"
    val BIO_KEYS = listOf(BIO, BIO_UNSTABLE)
    val PRONOUN_KEYS = listOf(PRONOUNS, PRONOUNS_UNSTABLE)

    const val MAX_BIO_CHARS = 2048
    const val MAX_BIO_LINES = 40
    const val MAX_PRONOUN_ENTRIES = 5
    const val MAX_PRONOUN_CHARS = 32
    const val MAX_ACTIVITIES = 3
    private const val MAX_ACTIVITY_CHARS = 80

    private fun mudrix(name: String) = listOf(Namespace.mudrixKey(name), Namespace.legacyMudrixKey(name))

    val ACCENT_KEYS = mudrix("accent")
    val DECORATION_KEYS = mudrix("avatar_decoration")
    val NAMEPLATE_KEYS = mudrix("nameplate")
    val FRAME_KEYS = mudrix("profile_frame")
    val IS_USER_KEYS = mudrix("is_user")
    val ACTIVITY_KEYS = mudrix("activity")

    private val CONTROL = Regex("[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u202A-\\u202E\\u2066-\\u2069]")
    private val HEX = Regex("^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

    private fun first(raw: JsonObject, keys: List<String>): JsonElement? =
        keys.firstNotNullOfOrNull { key -> raw[key]?.takeIf { it !is JsonNull } }

    private fun JsonElement?.text() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun codePoints(text: String) = text.codePoints().toArray()

    private fun limit(text: String, max: Int): String {
        val points = codePoints(text)
        return if (points.size <= max) text else String(points, 0, max)
    }

    /** CRLF to LF, control and bidi characters to spaces, blank runs collapsed, trimmed and capped */
    fun sanitizeBio(text: String): String {
        val lines = ArrayList<String>()
        var blankRun = 0
        for (raw in text.replace("\r\n", "\n").replace('\r', '\n').replace(CONTROL, " ").split('\n')) {
            val line = raw.trimEnd()
            if (line.isEmpty()) {
                blankRun++
                if (blankRun > 1) continue
            } else {
                blankRun = 0
            }
            lines.add(line)
            if (lines.size >= MAX_BIO_LINES) break
        }
        while (lines.isNotEmpty() && lines.first().isEmpty()) lines.removeAt(0)
        while (lines.isNotEmpty() && lines.last().isEmpty()) lines.removeAt(lines.size - 1)
        return limit(lines.joinToString("\n"), MAX_BIO_CHARS)
    }

    private fun stripHtml(html: String) = html
        .replace(Regex("<\\s*(br|/p|/div|/li)\\b[^>]*>", RegexOption.IGNORE_CASE), "\n")
        .replace(Regex("<[^>]*>"), "")
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")

    /** Plain text from an MSC4440 value (`{ "m.text": [{ body, mimetype? }] }`) or a bare string */
    fun parseBio(value: JsonElement?): String {
        value.text()?.let { return sanitizeBio(it) }
        val entries = ((value as? JsonObject)?.get("m.text") as? JsonArray) ?: return ""
        var html = ""
        for (entry in entries) {
            val bare = entry.text()
            if (bare != null) {
                sanitizeBio(bare).takeIf { it.isNotEmpty() }?.let { return it }
                continue
            }
            val obj = entry as? JsonObject ?: continue
            val body = obj["body"].text() ?: continue
            if (obj["mimetype"].text()?.lowercase() == "text/html") {
                if (html.isEmpty()) html = sanitizeBio(stripHtml(body))
                continue
            }
            sanitizeBio(body).takeIf { it.isNotEmpty() }?.let { return it }
        }
        return html
    }

    fun bioValue(text: String): JsonElement = buildJsonObject {
        putJsonArray("m.text") { add(buildJsonObject { put("body", text) }) }
    }

    fun sanitizePronoun(text: String): String =
        limit(text.replace(CONTROL, " ").replace(Regex("\\s+"), " ").trim(), MAX_PRONOUN_CHARS)

    fun parsePronouns(value: JsonElement?): List<String> {
        val out = ArrayList<String>()
        for (entry in (value as? JsonArray).orEmpty()) {
            val raw = entry.text() ?: (entry as? JsonObject)?.get("summary").text() ?: continue
            val cleaned = sanitizePronoun(raw)
            if (cleaned.isNotEmpty() && cleaned !in out) out.add(cleaned)
            if (out.size >= MAX_PRONOUN_ENTRIES) break
        }
        return out
    }

    fun pronounsValue(pronouns: List<String>): JsonElement = buildJsonArray {
        pronouns.forEach { add(buildJsonObject { put("language", "en"); put("summary", it) }) }
    }

    /** "she/her, they/them" to a list */
    fun parsePronounInput(input: String): List<String> =
        parsePronouns(JsonArray(input.split(',', ';', '\n').map { JsonPrimitive(it) }))

    fun isValidTimeZone(tz: String?): Boolean {
        if (tz.isNullOrEmpty() || tz.length > 64) return false
        return runCatching { ZoneId.of(tz) }.isSuccess
    }

    fun normalizeHex(value: String?): String? {
        val match = HEX.matchEntire(value?.trim() ?: return null) ?: return null
        var hex = match.groupValues[1].lowercase()
        if (hex.length == 3) hex = hex.map { "$it$it" }.joinToString("")
        return "#$hex"
    }

    private fun activityText(value: JsonElement?): String =
        limit(value.text().orEmpty().replace(CONTROL, " ").replace(Regex("\\s+"), " ").trim(), MAX_ACTIVITY_CHARS)

    private fun JsonElement?.positive(): Long =
        (this as? JsonPrimitive)?.doubleOrNull?.takeIf { it > 0 && it.isFinite() }?.toLong() ?: 0L

    fun parseActivities(value: JsonElement?): List<ProfileActivity> {
        val items = when (value) {
            null, is JsonNull -> emptyList()
            is JsonArray -> value
            else -> listOf(value)
        }
        return items.mapNotNull { item ->
            val obj = item as? JsonObject ?: return@mapNotNull null
            val type = obj["type"].text()?.takeIf { it == "playing" || it == "listening" } ?: return@mapNotNull null
            val name = activityText(obj["name"]).ifEmpty { return@mapNotNull null }
            // No expiry is a client that does not renew it; showing nothing beats showing it forever
            val expires = obj["expires"].positive().takeIf { it > 0 } ?: return@mapNotNull null
            ProfileActivity(type, name, activityText(obj["details"]), obj["started"].positive(), expires)
        }.take(MAX_ACTIVITIES)
    }

    /** The activities that have not run out yet */
    fun live(activities: List<ProfileActivity>, now: Long = System.currentTimeMillis()) = activities.filter { it.expiresAt > now }

    /** Only an id is read from a profile, never anything that could become a URL */
    private fun cosmeticId(value: JsonElement?): String? {
        val id = value.text()?.trim().orEmpty()
        return id.takeIf { it.isNotEmpty() && it.length <= 128 && !it.contains("://") && !it.startsWith("{") }
    }

    fun parse(raw: JsonElement?): ExtendedProfile {
        val obj = raw as? JsonObject ?: return ExtendedProfile()
        val tz = obj[TZ].text()
        return ExtendedProfile(
            bio = BIO_KEYS.asSequence().map { parseBio(obj[it]) }.firstOrNull { it.isNotEmpty() }.orEmpty(),
            pronouns = PRONOUN_KEYS.asSequence().map { parsePronouns(obj[it]) }.firstOrNull { it.isNotEmpty() }.orEmpty(),
            timezone = tz?.takeIf { isValidTimeZone(it) },
            activities = parseActivities(first(obj, ACTIVITY_KEYS)),
            accent = normalizeHex(first(obj, ACCENT_KEYS).text()),
            avatarDecoration = cosmeticId(first(obj, DECORATION_KEYS)),
            nameplate = cosmeticId(first(obj, NAMEPLATE_KEYS)),
            profileFrame = cosmeticId(first(obj, FRAME_KEYS)),
            isMudrixUser = (first(obj, IS_USER_KEYS) as? JsonPrimitive)?.booleanOrNull == true,
        )
    }

    /** Local time in `tz` as hours of offset from the viewer's zone, and the clock there */
    fun localTime(tz: String, now: Instant = Instant.now(), viewer: ZoneId = ZoneId.systemDefault()): Pair<java.time.LocalTime, Double>? {
        val zone = runCatching { ZoneId.of(tz) }.getOrNull() ?: return null
        val there = now.atZone(zone)
        val here = now.atZone(viewer)
        val offset = (there.offset.totalSeconds - here.offset.totalSeconds) / 3600.0
        return there.toLocalTime() to offset
    }

    // --- Known homeserver software ---

    data class KnownSoftware(val label: String, val color: Long, val glyph: String)

    private val KNOWN = mapOf(
        "synapse" to KnownSoftware("Synapse", 0xFF0DBD8B, "S"),
        "dendrite" to KnownSoftware("Dendrite", 0xFF6C5CE7, "D"),
        "conduit" to KnownSoftware("Conduit", 0xFFF59E0B, "C"),
        "conduwuit" to KnownSoftware("Conduwuit", 0xFFEC008C, "Cw"),
        "continuwuity" to KnownSoftware("Continuwuity", 0xFFF472B6, "Ct"),
        "tuwunel" to KnownSoftware("Tuwunel", 0xFFF472B6, "T"),
        "grapevine" to KnownSoftware("Grapevine", 0xFFA855F7, "G"),
        "construct" to KnownSoftware("Construct", 0xFF64748B, "Co"),
        "telodendria" to KnownSoftware("Telodendria", 0xFF84CC16, "Te"),
        "palpo" to KnownSoftware("Palpo", 0xFFEF4444, "P"),
    )

    /** Unknown servers get a neutral badge with their initial */
    fun describeSoftware(name: String): KnownSoftware {
        val trimmed = name.trim()
        KNOWN[trimmed.lowercase()]?.let { return it }
        val initial = trimmed.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
        return KnownSoftware(trimmed.take(32), 0xFF6B7280, initial)
    }

    fun serverNameOf(userId: String): String = userId.split(':').drop(1).joinToString(":")

    // --- Private notes (`user_notes` account data) ---

    const val MAX_NOTE_LENGTH = 1000
    val NOTES_TYPE = Namespace.mudrixKey("user_notes")
    val LEGACY_NOTES_TYPE = Namespace.legacyMudrixKey("user_notes")

    fun parseNotes(content: JsonElement?): Map<String, String> {
        val notes = (content as? JsonObject)?.get("notes") as? JsonObject ?: return emptyMap()
        return notes.entries.mapNotNull { (id, value) -> value.text()?.takeIf { it.isNotEmpty() }?.let { id to it.take(MAX_NOTE_LENGTH) } }.toMap()
    }

    fun notesValue(notes: Map<String, String>): JsonObject = buildJsonObject {
        put("notes", buildJsonObject { notes.forEach { (id, note) -> put(id, note) } })
    }
}
