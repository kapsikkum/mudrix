package org.wizardchat.android.matrix

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import org.wizardchat.android.media.VideoPlan
import org.wizardchat.android.ui.theme.CustomTheme
import org.wizardchat.android.ui.theme.CustomThemes
import org.wizardchat.android.ui.theme.Themes

enum class MessageLayout { modern, classic, compact }
/** The mobile shell: the space rail, or the earlier bottom pill navigation */
enum class NavigationStyle { rail, classic }
enum class Density { compact, default, spacious }
enum class ReducedMotion { system, on, off }

/** Which online status to send when presence is shared: follow the app, or always online, away or invisible (offline) */
enum class PresenceChoice {
    auto, online, away, invisible;

    /** What to tell the server; sharing off always reads as offline */
    fun presence(shared: Boolean): org.wizardchat.core.Presence = when {
        !shared || this == invisible -> org.wizardchat.core.Presence.offline
        this == away -> org.wizardchat.core.Presence.unavailable
        else -> org.wizardchat.core.Presence.online
    }
}
enum class MediaVisibility { always, private, never }

/** An enum whose synced value is not its Kotlin name (`12h` cannot be one) */
interface JsonName {
    val json: String
}

enum class TimeFormat(override val json: String) : JsonName { auto("auto"), h12("12h"), h24("24h") }
enum class DateFormatStyle(override val json: String) : JsonName { long("long"), dmy("dmy"), mdy("mdy"), ymd("ymd") }
enum class EmojiOnlySize(override val json: String) : JsonName { normal("normal"), large("large"), jumbo("jumbo") }

/** Videos sent as they are, shrunk to fit a size (smart), or shrunk to one fixed resolution */
enum class VideoUploadMode { original, smart, fixed }

/** Short side, in pixels, a fixed-resolution upload is scaled to */
enum class VideoUploadHeight(override val json: String, val pixels: Int) : JsonName { p1080("1080", 1080), p720("720", 720), p480("480", 480) }

/** Size a smart upload aims for, in MB, or whatever the server allows */
enum class VideoUploadTarget(override val json: String, val megabytes: Int?) : JsonName {
    mb25("25", 25), mb50("50", 50), mb100("100", 100), server("server", null)
}

/** Videos smaller than this many MB are never re-encoded */
enum class VideoUploadMinSize(override val json: String, val megabytes: Int) : JsonName {
    mb10("10", 10), mb25("25", 25), mb50("50", 50), mb100("100", 100)
}

/** Longest side, in pixels, bigger photos are scaled down to before sending; null keeps them */
enum class PhotoUploadSize(override val json: String, val maxSide: Int?) : JsonName {
    original("original", null), px2560("2560", 2560), px1920("1920", 1920), px1280("1280", 1280)
}

/** YouTube link embeds: asked once, then on (cards that can play) or off (no embed at all) */
enum class YouTubeEmbeds { ask, on, off }

/** Streamer mode: hide private details always, or only while this device shares its screen */
enum class StreamerMode(override val json: String) : JsonName { off("off"), on("on"), auto("auto") }

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

    // "theme.device" is where this app kept the theme before it followed the web's settings: "system" or a theme id
    private val earlierTheme = defaults.getString("theme.device", null)

    /** The chosen theme: a built-in theme's name or `custom:<id>` */
    var theme by pref(
        defaults.getString("theme", null)
            ?: Themes.builtin.firstOrNull { it.name.equals(earlierTheme, ignoreCase = true) }?.label
            ?: Themes.defaultName,
        themeCodec("theme", topLevel = true),
    ) { putString("theme", it) }

    /** Themes the user made; chosen as `custom:<id>` */
    var customThemes by pref(
        defaults.getString("customThemes", null)?.let { runCatching { CustomThemes.sanitize(Json.parseToJsonElement(it)) }.getOrNull() }.orEmpty(),
        Codec<List<CustomTheme>>(
            "customThemes",
            { CustomThemes.toJson(it) },
            { json -> (json as? JsonArray)?.let(CustomThemes::sanitize) },
            topLevel = true,
        ),
    ) { putString("customThemes", CustomThemes.toJson(it).toString()) }

    /** Switch between the two themes below when the system changes between light and dark (the default until a theme is picked) */
    var followSystemTheme by pref(
        defaults.getBoolean("followSystemTheme", earlierTheme == null || earlierTheme == "system"),
        boolCodec("followSystemTheme"),
    ) { putBoolean("followSystemTheme", it) }
    var systemDarkTheme by pref(defaults.getString("systemDarkTheme", null) ?: Themes.defaultName, themeCodec("systemDarkTheme")) { putString("systemDarkTheme", it) }
    var systemLightTheme by pref(defaults.getString("systemLightTheme", null) ?: Themes.defaultLightName, themeCodec("systemLightTheme")) { putString("systemLightTheme", it) }

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

    // Absent until chosen, then synced like the main message layout; a rail is the default
    private var phoneNavigationStyle by pref(
        defaults.getString("navigationStyle", null)?.takeIf { it in NAVIGATION_STYLES },
        nullableStringCodec("navigationStyle", NAVIGATION_STYLES),
    ) { if (it == null) remove("navigationStyle") else putString("navigationStyle", it) }
    var navigationStyle: NavigationStyle
        get() = if (phoneNavigationStyle == NavigationStyle.classic.name) NavigationStyle.classic else NavigationStyle.rail
        set(value) {
            phoneNavigationStyle = value.name
        }

    var chatFontSize by pref(defaults.getFloat("chatFontSize", DEFAULT_CHAT_FONT_SIZE), numberCodec("chatFontSize", 8f..40f)) { putFloat("chatFontSize", it) }
    var chatDensity by pref(enumPref("chatDensity", Density.default), enumCodec<Density>("chatDensity")) { putString("chatDensity", it.name) }
    var uiDensity by pref(enumPref("uiDensity", Density.default), enumCodec<Density>("uiDensity")) { putString("uiDensity", it.name) }
    var colorUsernames by pref(defaults.getBoolean("colorUsernames", true), boolCodec("colorUsernames")) { putBoolean("colorUsernames", it) }
    var prettifyLinks by pref(defaults.getBoolean("prettifyLinks", true), boolCodec("prettifyLinks")) { putBoolean("prettifyLinks", it) }
    /** Show images sent together as one gallery; off shows every image as its own message */
    var groupImages by pref(defaults.getBoolean("groupImages", true), boolCodec("groupImages")) { putBoolean("groupImages", it) }
    var themedAppIcon by pref(defaults.getBoolean("themedAppIcon", false), boolCodec("themedAppIcon")) { putBoolean("themedAppIcon", it) }
    var showRoomAvatars by pref(defaults.getBoolean("showRoomAvatars", true), boolCodec("showRoomAvatars")) { putBoolean("showRoomAvatars", it) }
    var reducedMotion by pref(enumPref("reducedMotion", ReducedMotion.system), enumCodec<ReducedMotion>("reducedMotion")) { putString("reducedMotion", it.name) }
    var autoplayGifs by pref(defaults.getBoolean("autoplayGifs", true), boolCodec("autoplayGifs")) { putBoolean("autoplayGifs", it) }
    var typingIndicators by pref(defaults.getBoolean("typingIndicators", true), boolCodec("typingIndicators")) { putBoolean("typingIndicators", it) }
    var sendReadReceipts by pref(defaults.getBoolean("sendReadReceipts", true), boolCodec("sendReadReceipts")) { putBoolean("sendReadReceipts", it) }
    var mediaVisibility by pref(enumPref("mediaVisibility", MediaVisibility.always), enumCodec<MediaVisibility>("mediaVisibility")) {
        putString("mediaVisibility", it.name)
    }
    var videoUploadMode by pref(enumPref("videoUploadMode", VideoUploadMode.original), enumCodec<VideoUploadMode>("videoUploadMode")) {
        putString("videoUploadMode", it.name)
    }
    var videoUploadHeight by pref(
        jsonEnumPref("videoUploadHeight", VideoUploadHeight.entries, VideoUploadHeight.p720),
        jsonEnumCodec("videoUploadHeight", VideoUploadHeight.entries),
    ) { putString("videoUploadHeight", it.json) }
    var videoUploadTarget by pref(
        jsonEnumPref("videoUploadTarget", VideoUploadTarget.entries, VideoUploadTarget.mb50),
        jsonEnumCodec("videoUploadTarget", VideoUploadTarget.entries),
    ) { putString("videoUploadTarget", it.json) }
    var videoUploadMinSize by pref(
        jsonEnumPref("videoUploadMinSize", VideoUploadMinSize.entries, VideoUploadMinSize.mb25),
        jsonEnumCodec("videoUploadMinSize", VideoUploadMinSize.entries),
    ) { putString("videoUploadMinSize", it.json) }
    var photoStripMetadata by pref(defaults.getBoolean("photoStripMetadata", false), boolCodec("photoStripMetadata")) { putBoolean("photoStripMetadata", it) }
    var photoUploadSize by pref(
        jsonEnumPref("photoUploadSize", PhotoUploadSize.entries, PhotoUploadSize.original),
        jsonEnumCodec("photoUploadSize", PhotoUploadSize.entries),
    ) { putString("photoUploadSize", it.json) }
    var youtubeEmbeds by pref(enumPref("youtubeEmbeds", YouTubeEmbeds.ask), enumCodec<YouTubeEmbeds>("youtubeEmbeds")) { putString("youtubeEmbeds", it.name) }
    var timeFormat by pref(jsonEnumPref("timeFormat", TimeFormat.entries, TimeFormat.auto), jsonEnumCodec("timeFormat", TimeFormat.entries)) {
        putString("timeFormat", it.json)
    }
    var dateFormat by pref(jsonEnumPref("dateFormat", DateFormatStyle.entries, DateFormatStyle.long), jsonEnumCodec("dateFormat", DateFormatStyle.entries)) {
        putString("dateFormat", it.json)
    }
    var emojiOnlySize by pref(jsonEnumPref("emojiOnlySize", EmojiOnlySize.entries, EmojiOnlySize.large), jsonEnumCodec("emojiOnlySize", EmojiOnlySize.entries)) {
        putString("emojiOnlySize", it.json)
    }
    var emoticonsToEmoji by pref(defaults.getBoolean("emoticonsToEmoji", true), boolCodec("emoticonsToEmoji")) { putBoolean("emoticonsToEmoji", it) }

    // Whether this device is being streamed is a fact about this device, so it is not synced
    var streamerMode by pref(jsonEnumPref("streamerMode", StreamerMode.entries, StreamerMode.auto)) { putString("streamerMode", it.json) }

    var showPresence by pref(defaults.getBoolean("showPresence", false), boolCodec("showPresence")) { putBoolean("showPresence", it) }
    var notificationSounds by pref(defaults.getBoolean("notificationSounds", true), boolCodec("notificationSounds")) { putBoolean("notificationSounds", it) }
    /** Message sounds also play while the app is open on screen */
    var notificationSoundsWhenFocused by pref(
        defaults.getBoolean("notificationSoundsWhenFocused", false),
        boolCodec("notificationSoundsWhenFocused"),
    ) { putBoolean("notificationSoundsWhenFocused", it) }
    /** People who manage a space may move this person between its voice channels while in a call */
    var allowVoiceMoves by pref(defaults.getBoolean("allowVoiceMoves", true), boolCodec("allowVoiceMoves")) { putBoolean("allowVoiceMoves", it) }
    /** The sound pack for every sound without an override of its own */
    var notificationSoundPack by pref(
        defaults.getString("notificationSoundPack", null)?.takeIf(SoundPacks::isPackId) ?: SoundPacks.DEFAULT,
        packCodec("notificationSoundPack"),
    ) { putString("notificationSoundPack", it) }
    /** The mention pack of earlier versions; read as the mention override */
    var notificationMentionSoundPack by pref(
        defaults.getString("notificationMentionSoundPack", null)?.takeIf(SoundPacks::isPackId) ?: "",
        packCodec("notificationMentionSoundPack"),
    ) { putString("notificationMentionSoundPack", it) }
    /** 0-100, for message, mention and call sounds */
    var notificationSoundVolume by pref(
        defaults.getInt("notificationSoundVolume", 70).coerceIn(0, 100),
        Codec<Int>(
            "notificationSoundVolume",
            { JsonPrimitive(it) },
            { json -> (json as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it in 0.0..100.0 }?.toInt() },
        ),
    ) { putInt("notificationSoundVolume", it) }
    /** Per sound: a pack id or "off"; a sound left out follows [notificationSoundPack] */
    var soundOverrides by pref(
        defaults.getString("soundOverrides", null)
            ?.let { raw -> runCatching { SoundPacks.sanitizeOverrides(Json.parseToJsonElement(raw)) }.getOrNull() }.orEmpty(),
        Codec<Map<SoundKind, String>>(
            "soundOverrides",
            { SoundPacks.overridesJson(it) },
            { json -> SoundPacks.sanitizeOverrides(json) },
        ),
    ) { putString("soundOverrides", SoundPacks.overridesJson(it).toString()) }
    /** Microphone processing applied when a call is joined */
    var noiseSuppression by pref(defaults.getBoolean("noiseSuppression", true), boolCodec("noiseSuppression")) { putBoolean("noiseSuppression", it) }
    var echoCancellation by pref(defaults.getBoolean("echoCancellation", true), boolCodec("echoCancellation")) { putBoolean("echoCancellation", it) }
    var autoGainControl by pref(defaults.getBoolean("autoGainControl", true), boolCodec("autoGainControl")) { putBoolean("autoGainControl", it) }

    // Soundboard listening choices are per device (a phone in a pocket and a desktop with speakers differ), so they are not synced
    var soundboardEnabled by pref(defaults.getBoolean("soundboardEnabled", true)) { putBoolean("soundboardEnabled", it) }
    /** 0-100, separate from voice and notification volume */
    var soundboardVolume by pref(defaults.getInt("soundboardVolume", 70).coerceIn(0, 100)) { putInt("soundboardVolume", it) }
    /** People whose soundboard clips are muted on this device */
    var soundboardMutedUsers by pref(defaults.getStringSet("soundboardMutedUsers", emptySet()).orEmpty().toSet()) {
        putStringSet("soundboardMutedUsers", it)
    }

    /** Ask a person's homeserver what it runs and show it on their profile */
    /** Keeps the app connected in the background (the foreground service); on from the start in a build that has no push service */
    var keepAlive by pref(
        defaults.getBoolean("keepAlive", org.wizardchat.android.push.PushMode.current == org.wizardchat.android.push.PushMode.keepalive),
    ) { putBoolean("keepAlive", it) }
    /** Shares the song playing on the phone as the profile's "listening to" (needs Notification access) */
    var shareListening by pref(defaults.getBoolean("shareListening", false)) { putBoolean("shareListening", it) }
    /** The accent colour comes from the wallpaper (Material You, Android 12+) instead of the theme */
    var useSystemAccent by pref(defaults.getBoolean("useSystemAccent", false), boolCodec("useSystemAccent")) { putBoolean("useSystemAccent", it) }
    var presenceChoice by pref(enumPref("presenceChoice", PresenceChoice.auto)) { putString("presenceChoice", it.name) }
    var hideMembershipEvents by pref(defaults.getBoolean("hideMembershipEvents", false), boolCodec("hideMembershipEvents")) {
        putBoolean("hideMembershipEvents", it)
    }
    var hideProfileEvents by pref(defaults.getBoolean("hideProfileEvents", true), boolCodec("hideProfileEvents")) {
        putBoolean("hideProfileEvents", it)
    }
    var showHomeserverSoftware by pref(defaults.getBoolean("showHomeserverSoftware", true), boolCodec("showHomeserverSoftware")) {
        putBoolean("showHomeserverSoftware", it)
    }
    /** Draw the decorations, nameplates, frames and effects that come from packs, for everyone (the web's `showCosmeticPacks`) */
    var showCosmeticPacks by pref(defaults.getBoolean("showCosmeticPacks", true), boolCodec("showCosmeticPacks")) {
        putBoolean("showCosmeticPacks", it)
    }
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
    var pushToTalk by pref(defaults.getBoolean("pushToTalk", false)) { putBoolean("pushToTalk", it) }
    var verifySkippedDevice by pref(defaults.getString("verifySkippedDevice", "") ?: "") {
        putString("verifySkippedDevice", it)
    }
    var verificationBannerDismissed by pref(defaults.getBoolean("verificationBannerDismissed", false)) {
        putBoolean("verificationBannerDismissed", it)
    }

    /** The sound overrides with the older mention pack read as the mention override */
    fun effectiveSoundOverrides(): Map<SoundKind, String> =
        if (SoundKind.Mention !in soundOverrides && notificationMentionSoundPack.isNotEmpty()) {
            soundOverrides + (SoundKind.Mention to notificationMentionSoundPack)
        } else {
            soundOverrides
        }

    /** The video options in the form [VideoPlan] plans with */
    fun videoUploadPrefs(): VideoPlan.UploadPrefs = VideoPlan.UploadPrefs(
        mode = VideoPlan.Mode.valueOf(videoUploadMode.name),
        height = videoUploadHeight.pixels,
        // Without a size the server limit is the target; smartMaxBytes caps it anyway
        targetBytes = videoUploadTarget.megabytes?.let { it * 1024L * 1024 } ?: Long.MAX_VALUE,
        minBytes = videoUploadMinSize.megabytes * 1024L * 1024,
    )

    /** The theme in use: the chosen one, or the one for the system's light or dark mode when following it */
    fun effectiveThemeName(systemDark: Boolean): String = when {
        !followSystemTheme -> theme
        systemDark -> systemDarkTheme
        else -> systemLightTheme
    }

    /** Whether streamer mode hides private details now: always when chosen, or "auto" while this device shares its screen */
    fun streamerModeActive(screenSharing: Boolean): Boolean =
        streamerMode == StreamerMode.on || (streamerMode == StreamerMode.auto && screenSharing)

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

    private fun packCodec(key: String) = Codec<String>(
        key,
        { JsonPrimitive(it) },
        { json -> (json as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf(SoundPacks::isPackId) },
    )

    private inline fun <reified E : Enum<E>> enumCodec(key: String) = Codec<E>(
        key,
        { JsonPrimitive(it.name) },
        { json -> (json as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { raw -> enumValues<E>().firstOrNull { it.name == raw } } },
    )

    /** A built-in theme's name, or a custom theme's (`custom:<id>`, which may not have arrived yet) */
    private fun themeCodec(key: String, topLevel: Boolean = false) = Codec<String>(
        key,
        { JsonPrimitive(it) },
        { json -> (json as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf(Themes::isValidName) },
        topLevel,
    )

    private fun <E> jsonEnumCodec(key: String, entries: List<E>) where E : Enum<E>, E : JsonName = Codec<E>(
        key,
        { JsonPrimitive(it.json) },
        { json -> (json as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { raw -> entries.firstOrNull { it.json == raw } } },
    )

    private fun <E> jsonEnumPref(key: String, entries: List<E>, fallback: E): E where E : Enum<E>, E : JsonName =
        defaults.getString(key, null)?.let { raw -> entries.firstOrNull { it.json == raw } } ?: fallback

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
        private val NAVIGATION_STYLES = setOf("rail", "classic")

        /** Names this app used before it followed the web's settings, by the key they are now under */
        private val LEGACY_KEYS = mapOf("sendTyping" to "typingIndicators", "notificationSound" to "notificationSounds")
    }
}
