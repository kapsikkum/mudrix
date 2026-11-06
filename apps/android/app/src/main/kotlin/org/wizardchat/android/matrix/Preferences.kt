package org.wizardchat.android.matrix

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import org.wizardchat.android.ui.theme.ThemeSetting

enum class MessageLayout { modern, classic }
enum class Density { compact, default, spacious }
enum class ReducedMotion { system, on, off }
enum class MediaVisibility { always, private, never }

/**
 * Settings on this device. Most of them sync with the other Mudrix apps through account data
 * ([SettingsSync]): a setting with a [Codec] is part of the synced event under that key.
 */
class AppPreferences(context: Context) {
    private val defaults = context.getSharedPreferences("preferences", Context.MODE_PRIVATE)

    /** How one synced setting is read from and written to the settings event */
    private class Codec<T>(val key: String, val toJson: (T) -> JsonElement?, val fromJson: (JsonElement) -> T?, val topLevel: Boolean = false)

    private class Synced(val read: () -> JsonElement?, val normalise: (JsonElement) -> JsonElement?, val apply: (JsonElement) -> Boolean)

    private val syncedPreferences = LinkedHashMap<String, Synced>()
    private val syncedTopLevel = LinkedHashMap<String, Synced>()

    /** Called after a synced setting changed on this device */
    var onSyncedSettingsChange: (() -> Unit)? = null

    // Per device like the system's light and dark mode, so not synced with the web
    var theme by pref(ThemeSetting.from(defaults.getString("theme.device", null))) { putString("theme.device", it.rawValue) }

    // The main layout comes from the account (the web's desktop layout); this device is a phone, so its own
    // choice is the phone layout, and until one is made it follows the main one
    private var mainMessageLayout by pref(defaults.getString("messageLayout.main", "modern") ?: "modern", stringCodec("messageLayout", LAYOUTS, topLevel = true)) {
        putString("messageLayout.main", it)
    }

    // "messageLayout" is where this device's own choice was kept before the phone layout existed
    private var phoneMessageLayout by pref(
        (defaults.getString("messageLayoutMobile", null) ?: defaults.getString("messageLayout", null))?.takeIf { it in LAYOUTS },
        nullableStringCodec("messageLayoutMobile", LAYOUTS),
    ) { if (it == null) remove("messageLayoutMobile") else putString("messageLayoutMobile", it) }
    var messageLayout: MessageLayout
        get() = if ((phoneMessageLayout ?: mainMessageLayout) == "classic") MessageLayout.classic else MessageLayout.modern
        set(value) {
            phoneMessageLayout = value.name
        }

    var chatFontSize by pref(defaults.getFloat("chatFontSize", DEFAULT_CHAT_FONT_SIZE), numberCodec("chatFontSize", 8f..40f)) { putFloat("chatFontSize", it) }
    var chatDensity by pref(enumPref("chatDensity", Density.default), enumCodec<Density>("chatDensity")) { putString("chatDensity", it.name) }
    var uiDensity by pref(enumPref("uiDensity", Density.default), enumCodec<Density>("uiDensity")) { putString("uiDensity", it.name) }
    var prettifyLinks by pref(defaults.getBoolean("prettifyLinks", true), boolCodec("prettifyLinks")) { putBoolean("prettifyLinks", it) }
    var themedAppIcon by pref(defaults.getBoolean("themedAppIcon", false), boolCodec("themedAppIcon")) { putBoolean("themedAppIcon", it) }
    var showRoomAvatars by pref(defaults.getBoolean("showRoomAvatars", true), boolCodec("showRoomAvatars")) { putBoolean("showRoomAvatars", it) }
    var reducedMotion by pref(enumPref("reducedMotion", ReducedMotion.system), enumCodec<ReducedMotion>("reducedMotion")) { putString("reducedMotion", it.name) }
    var autoplayGifs by pref(defaults.getBoolean("autoplayGifs", true), boolCodec("autoplayGifs")) { putBoolean("autoplayGifs", it) }
    var typingIndicators by pref(defaults.getBoolean("typingIndicators", true), boolCodec("typingIndicators")) { putBoolean("typingIndicators", it) }
    var sendReadReceipts by pref(defaults.getBoolean("sendReadReceipts", true), boolCodec("sendReadReceipts")) { putBoolean("sendReadReceipts", it) }
    var mediaVisibility by pref(enumPref("mediaVisibility", MediaVisibility.always), enumCodec<MediaVisibility>("mediaVisibility")) {
        putString("mediaVisibility", it.name)
    }
    var showPresence by pref(defaults.getBoolean("showPresence", false), boolCodec("showPresence")) { putBoolean("showPresence", it) }
    var notificationSounds by pref(defaults.getBoolean("notificationSounds", true), boolCodec("notificationSounds")) { putBoolean("notificationSounds", it) }
    var notificationBanners by pref(defaults.getBoolean("notificationBanners", true)) { putBoolean("notificationBanners", it) }
    var language by pref(
        defaults.getString("language", "") ?: "",
        Codec(
            "language",
            { JsonPrimitive(it.ifEmpty { "system" }) },
            { json -> (json as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { if (it == "system") "" else it.takeIf { code -> code in LANGUAGES } } },
            topLevel = true,
        ),
    ) {
        putString("language", it)
        applyLanguage(it)
    }
    var developerMode by pref(defaults.getBoolean("developerMode", false)) { putBoolean("developerMode", it) }
    var verificationBannerDismissed by pref(defaults.getBoolean("verificationBannerDismissed", false)) {
        putBoolean("verificationBannerDismissed", it)
    }

    val chatScale: Float get() = chatFontSize / DEFAULT_CHAT_FONT_SIZE

    val chatSpacing: Float
        get() = when (chatDensity) {
            Density.compact -> 0.35f
            Density.default -> 1f
            Density.spacious -> 1.8f
        }

    val roomAvatarSize: Dp get() = when (uiDensity) { Density.compact -> 32.dp; Density.default -> 44.dp; Density.spacious -> 52.dp }
    val roomRowPadding: Dp get() = when (uiDensity) { Density.compact -> 6.dp; Density.default -> 9.dp; Density.spacious -> 12.dp }
    val spaceGap: Dp get() = when (uiDensity) { Density.compact -> 4.dp; Density.default -> 6.dp; Density.spacious -> 10.dp }

    fun reducesMotion(systemSetting: Boolean) = when (reducedMotion) {
        ReducedMotion.system -> systemSetting
        ReducedMotion.on -> true
        ReducedMotion.off -> false
    }

    /** The settings event as this device would save it */
    fun settingsSnapshot(): JsonObject = buildJsonObject {
        for ((key, synced) in syncedTopLevel) synced.read()?.let { put(key, it) }
        put(
            "preferences",
            buildJsonObject { for ((key, synced) in syncedPreferences) synced.read()?.let { put(key, it) } },
        )
    }

    /**
     * Keeps what this version understands of a settings event, in the form [settingsSnapshot]
     * has: known keys only, with a value of the right type and an allowed value.
     */
    fun sanitizeSettings(raw: JsonObject): JsonObject = buildJsonObject {
        for ((key, synced) in syncedTopLevel) raw[key]?.let(synced.normalise)?.let { put(key, it) }
        // The WizardChat base keeps the preferences next to the theme instead of in a `preferences` object
        val flat = LinkedHashMap<String, JsonElement>(raw)
        LEGACY_KEYS.forEach { (old, current) -> if (current !in flat) raw[old]?.let { flat[current] = it } }
        (raw["preferences"] as? JsonObject)?.let { flat.putAll(it) }
        put(
            "preferences",
            buildJsonObject { for ((key, synced) in syncedPreferences) flat[key]?.let(synced.normalise)?.let { put(key, it) } },
        )
    }

    /** Applies a sanitized settings event ([sanitizeSettings]) to this device */
    fun applySettings(settings: JsonObject) {
        for ((key, synced) in syncedTopLevel) settings[key]?.let { synced.apply(it) }
        val prefs = settings["preferences"] as? JsonObject ?: return
        for ((key, synced) in syncedPreferences) prefs[key]?.let { synced.apply(it) }
    }

    private fun boolCodec(key: String) = Codec<Boolean>(
        key,
        { JsonPrimitive(it) },
        { json -> (json as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull },
    )

    private inline fun <reified E : Enum<E>> enumCodec(key: String) = Codec<E>(
        key,
        { JsonPrimitive(it.name) },
        { json -> (json as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { raw -> enumValues<E>().firstOrNull { it.name == raw } } },
    )

    private fun numberCodec(key: String, range: ClosedFloatingPointRange<Float>) = Codec<Float>(
        key,
        { if (it % 1f == 0f) JsonPrimitive(it.toInt()) else JsonPrimitive(it) },
        { json -> (json as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.toFloat()?.takeIf { it in range } },
    )

    private fun stringCodec(key: String, allowed: Set<String>, topLevel: Boolean = false) = Codec<String>(
        key,
        { JsonPrimitive(it) },
        { json -> (json as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it in allowed } },
        topLevel,
    )

    /** A setting that is absent until chosen: nothing is written for null */
    private fun nullableStringCodec(key: String, allowed: Set<String>) = Codec<String?>(
        key,
        { it?.let(::JsonPrimitive) },
        { json -> (json as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it in allowed } },
        topLevel = true,
    )

    private inline fun <reified E : Enum<E>> enumPref(key: String, fallback: E): E =
        defaults.getString(key, null)?.let { raw -> enumValues<E>().firstOrNull { it.name == raw } } ?: fallback

    /** A Compose-observable setting saved on every change; with a [codec] it also syncs through account data */
    private fun <T> pref(initial: T, codec: Codec<T>? = null, write: android.content.SharedPreferences.Editor.(T) -> Unit) =
        object : kotlin.properties.ReadWriteProperty<Any?, T> {
            private val state = mutableStateOf(initial)

            init {
                if (codec != null) {
                    val synced = Synced(
                        read = { codec.toJson(state.value) },
                        normalise = { json -> codec.fromJson(json)?.let(codec.toJson) },
                        apply = { json ->
                            val value = codec.fromJson(json)
                            if (value != null && value != state.value) assign(value)
                            value != null
                        },
                    )
                    (if (codec.topLevel) syncedTopLevel else syncedPreferences)[codec.key] = synced
                }
            }

            private fun assign(value: T) {
                state.value = value
                defaults.edit().apply { write(value) }.apply()
            }

            override fun getValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>) = state.value
            override fun setValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>, value: T) {
                assign(value)
                if (codec != null) onSyncedSettingsChange?.invoke()
            }
        }

    /** Android switches the app's language right away (per-app languages) */
    private fun applyLanguage(language: String) {
        AppCompatDelegate.setApplicationLocales(
            if (language.isEmpty()) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(language),
        )
    }

    companion object {
        val CHAT_FONT_SIZES = listOf(12f, 14f, 15f, 16f, 18f, 20f, 24f)
        const val DEFAULT_CHAT_FONT_SIZE = 15f

        /** The display languages, in the order of the picker (`packages/i18n/locales`) */
        val LANGUAGES = listOf("en", "de", "es", "fr", "it", "pt", "ru", "ja", "tr", "nl", "pl")

        private val LAYOUTS = setOf("classic", "modern", "compact")

        /** Names this app used before it followed the web's settings, by the key they are now under */
        private val LEGACY_KEYS = mapOf("sendTyping" to "typingIndicators", "notificationSound" to "notificationSounds")
    }
}
