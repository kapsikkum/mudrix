package org.wizardchat.android.ui.theme

import androidx.compose.ui.graphics.Color
import java.security.SecureRandom
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import org.wizardchat.tokens.WZ

/** The nine colours a user picks for a custom theme (`#rrggbb`); everything else is derived */
data class ThemeSpec(
    val bgPrimary: String,
    val bgSecondary: String,
    val bgTertiary: String,
    val accent: String,
    val textPrimary: String,
    val textMuted: String,
    val border: String,
    val msgMineBg: String,
    val msgOtherBg: String,
) {
    /** The colours by their key in the synced event and in a shared theme */
    fun toMap(): LinkedHashMap<String, String> = linkedMapOf(
        "bgPrimary" to bgPrimary,
        "bgSecondary" to bgSecondary,
        "bgTertiary" to bgTertiary,
        "accent" to accent,
        "textPrimary" to textPrimary,
        "textMuted" to textMuted,
        "border" to border,
        "msgMineBg" to msgMineBg,
        "msgOtherBg" to msgOtherBg,
    )

    fun with(key: String, hex: String): ThemeSpec = when (key) {
        "bgPrimary" -> copy(bgPrimary = hex)
        "bgSecondary" -> copy(bgSecondary = hex)
        "bgTertiary" -> copy(bgTertiary = hex)
        "accent" -> copy(accent = hex)
        "textPrimary" -> copy(textPrimary = hex)
        "textMuted" -> copy(textMuted = hex)
        "border" -> copy(border = hex)
        "msgMineBg" -> copy(msgMineBg = hex)
        "msgOtherBg" -> copy(msgOtherBg = hex)
        else -> this
    }

    companion object {
        val KEYS = listOf("bgPrimary", "bgSecondary", "bgTertiary", "accent", "textPrimary", "textMuted", "border", "msgMineBg", "msgOtherBg")

        fun fromMap(map: Map<String, String>): ThemeSpec? {
            fun get(key: String) = map[key]?.takeIf(ThemeDerive::isHexColor)?.lowercase()
            return ThemeSpec(
                get("bgPrimary") ?: return null,
                get("bgSecondary") ?: return null,
                get("bgTertiary") ?: return null,
                get("accent") ?: return null,
                get("textPrimary") ?: return null,
                get("textMuted") ?: return null,
                get("border") ?: return null,
                get("msgMineBg") ?: return null,
                get("msgOtherBg") ?: return null,
            )
        }

        /** The colours of a theme in editable form (used to start a custom theme from it) */
        fun of(colors: WZ.ThemeColors) = ThemeSpec(
            ThemeDerive.hexOf(colors.bgApp),
            ThemeDerive.hexOf(colors.bgSurface),
            ThemeDerive.hexOf(colors.bgRaised),
            ThemeDerive.hexOf(colors.accentDefault),
            ThemeDerive.hexOf(colors.textPrimary),
            ThemeDerive.hexOf(colors.textMuted),
            ThemeDerive.hexOf(colors.borderDefault),
            ThemeDerive.hexOf(colors.messageMine),
            ThemeDerive.hexOf(colors.messageOther),
        )
    }
}

/** A theme made by the user: a name and a handful of colours. Chosen as `custom:<id>`. */
data class CustomTheme(val id: String, val name: String, val colors: ThemeSpec) {
    val themeName: String get() = CustomThemes.PREFIX + id

    fun toJson(): JsonObject = buildJsonObject {
        put("id", id)
        put("name", name)
        put("colors", JsonObject(colors.toMap().mapValues { JsonPrimitive(it.value) }))
    }
}

/** Custom themes, compatible with the web (`theme/customThemes.ts`): the same limits, ids and shared-theme format */
object CustomThemes {
    const val PREFIX = "custom:"
    const val MAX = 20
    const val MAX_NAME_LENGTH = 40

    private val ID = Regex("^[a-z0-9]{6,32}$")
    private val THEME_NAME = Regex("^custom:[a-z0-9]{6,32}$")
    private val prettyJson = Json { prettyPrint = true; prettyPrintIndent = "  " }

    fun isCustomName(name: String) = name.startsWith(PREFIX)

    /** Whether [value] is the name of a custom theme (`custom:` and an id), whether or not it exists */
    fun isCustomThemeName(value: String) = THEME_NAME.matches(value)

    fun newId(): String {
        val bytes = ByteArray(6).also { SecureRandom().nextBytes(it) }
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun colorsOf(raw: JsonElement?): ThemeSpec? {
        val obj = raw as? JsonObject ?: return null
        val map = HashMap<String, String>()
        for (key in ThemeSpec.KEYS) {
            val value = (obj[key] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
            map[key] = value
        }
        return ThemeSpec.fromMap(map)
    }

    fun cleanName(raw: String?): String = raw?.replace(Regex("\\s+"), " ")?.trim()?.take(MAX_NAME_LENGTH).orEmpty()

    /** Keeps well-formed custom themes only (used for synced and stored data alike) */
    fun sanitize(raw: JsonElement?): List<CustomTheme> {
        val list = raw as? JsonArray ?: return emptyList()
        val out = ArrayList<CustomTheme>()
        val seen = HashSet<String>()
        for (entry in list) {
            if (out.size >= MAX) break
            val obj = entry as? JsonObject ?: continue
            val id = (obj["id"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: continue
            if (!ID.matches(id) || id in seen) continue
            val colors = colorsOf(obj["colors"]) ?: continue
            val name = cleanName((obj["name"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
            if (name.isEmpty()) continue
            seen += id
            out += CustomTheme(id, name, colors)
        }
        return out
    }

    fun toJson(themes: List<CustomTheme>): JsonArray = JsonArray(themes.map { it.toJson() })

    /** A theme pasted from another person: `{ "name": "...", "colors": { ... } }` */
    fun parseShared(text: String): Pair<String, ThemeSpec>? = runCatching {
        val data = Json.parseToJsonElement(text) as? JsonObject ?: return null
        val colors = colorsOf(data["colors"]) ?: return null
        val name = cleanName((data["name"] as? JsonPrimitive)?.contentOrNull)
        if (name.isEmpty()) null else name to colors
    }.getOrNull()

    fun serialize(theme: CustomTheme): String {
        val json = buildJsonObject {
            put("name", theme.name)
            put("colors", JsonObject(theme.colors.toMap().mapValues { JsonPrimitive(it.value) }))
        }
        return prettyJson.encodeToString(JsonObject.serializer(), json)
    }

    /** The theme [name] refers to, if it is a custom theme in [themes] */
    fun find(name: String, themes: List<CustomTheme>): CustomTheme? =
        if (isCustomName(name)) themes.firstOrNull { it.themeName == name } else null

    /** A swatch colour for lists */
    fun swatch(theme: CustomTheme): Pair<Color, Color> =
        ThemeDerive.parse(theme.colors.bgSecondary) to ThemeDerive.parse(theme.colors.accent)
}
