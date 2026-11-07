package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/** The sounds the app plays; the ids are the web's (`util/notificationSounds.ts`) */
enum class SoundKind(val id: String, val labelKey: String, val gated: Boolean, val atSliderVolume: Boolean) {
    Message("message", "settings.voice.sound.message", true, true),
    Mention("mention", "settings.voice.sound.mention", true, true),
    Ring("ring", "settings.voice.sound.ring", true, true),
    Ringback("ringback", "settings.voice.sound.ringback", true, true),
    CallEnd("callend", "settings.voice.sound.callend", true, true),
    Mute("mute", "settings.voice.sound.mute", false, false),
    Unmute("unmute", "settings.voice.sound.unmute", false, false),
    CameraOn("camera-on", "settings.voice.sound.cameraOn", false, false),
    CameraOff("camera-off", "settings.voice.sound.cameraOff", false, false),
    Join("join", "settings.voice.sound.join", true, false),
    Leave("leave", "settings.voice.sound.leave", true, false),
    Moved("moved", "settings.voice.sound.moved", false, false),
    WatchTogetherStart("watch-together-start", "settings.voice.sound.watchTogetherStart", false, false),
    ;

    /** The file name part: `camera-on` is `camera_on` */
    val fileName get() = id.replace('-', '_')

    companion object {
        fun fromId(id: String) = entries.firstOrNull { it.id == id }
    }
}

/** A set of sounds; `files` maps a sound to its resource name in `res/raw` (no extension) */
data class SoundPack(val id: String, val name: String, val category: String, val files: Map<SoundKind, String>)

/**
 * Sound packs, the web's `SOUND_PACKS` with the files of `packages/sounds/raw` as flat resources
 * (`snd_<pack>_<sound>`). A pack that lacks a sound uses the app's own (voice sounds) or the default
 * pack's (calls).
 */
object SoundPacks {
    const val DEFAULT = "megadrive2"
    const val OFF = "off"
    val CATEGORIES = listOf("mudrix", "clients")

    private fun mudrixPack(id: String, name: String) =
        SoundPack(id, name, "mudrix", SoundKind.entries.associateWith { "snd_${id}_${it.fileName}" })

    private fun clientPack(id: String, name: String, kinds: List<SoundKind>, alert: Boolean = false) =
        SoundPack(id, name, "clients", kinds.associateWith { if (alert) "alert" else "snd_${id}_${it.fileName}" })

    val all: List<SoundPack> = listOf(
        mudrixPack("bloop", "Bloop"),
        mudrixPack("glass", "Glass"),
        mudrixPack("warm", "Warm"),
        mudrixPack("megadrive", "Slap"),
        mudrixPack("nes", "Overworld"),
        mudrixPack("megadrive2", "Velvet"),
        mudrixPack("nes2", "Shuffle"),
        mudrixPack("sms", "Chirp"),
        clientPack("wizardchat", "WizardChat", listOf(SoundKind.Message), alert = true),
        clientPack("element", "Element", listOf(SoundKind.Message, SoundKind.Ring, SoundKind.Ringback, SoundKind.CallEnd)),
        clientPack("cinny", "Cinny", listOf(SoundKind.Message, SoundKind.Mention)),
        clientPack("fluffychat", "FluffyChat", listOf(SoundKind.Message, SoundKind.Mention, SoundKind.Ring, SoundKind.CallEnd)),
        clientPack("commet", "Commet", listOf(SoundKind.Message, SoundKind.CallEnd)),
        clientPack("lightning", "Lightning", listOf(SoundKind.Message, SoundKind.Mention)),
    )

    /** The app's own voice sounds, used when a pack does not replace one */
    private val BUILTIN = mapOf(
        SoundKind.Mute to "mute",
        SoundKind.Unmute to "unmute",
        SoundKind.CameraOn to "camera_on",
        SoundKind.CameraOff to "camera_off",
        SoundKind.Join to "call_join",
        SoundKind.Leave to "call_leave",
        SoundKind.WatchTogetherStart to "watch_together_start",
    )

    /** A removed or unknown pack id reads as the default pack */
    fun get(id: String?): SoundPack = all.firstOrNull { it.id == id } ?: all.first { it.id == DEFAULT }

    /**
     * The resource of a sound for a pack. Mentions fall back to the pack's message sound; call sounds
     * to the default pack's file; voice sounds to the app's own.
     */
    fun resource(packId: String?, kind: SoundKind): String? {
        val pack = get(packId)
        pack.files[kind]?.let { return it }
        if (kind == SoundKind.Mention) return pack.files[SoundKind.Message]
        if (kind == SoundKind.Ring || kind == SoundKind.Ringback || kind == SoundKind.CallEnd) return get(DEFAULT).files[kind]
        return BUILTIN[kind]
    }

    /** The pack that plays for a sound: its override, else the main pack; null means the sound is off */
    fun resolve(kind: SoundKind, mainPack: String, overrides: Map<SoundKind, String>): String? {
        val chosen = overrides[kind]
        if (chosen == OFF) return null
        // An override naming a removed pack counts as unset
        val override = chosen?.takeIf { id -> all.any { it.id == id } }
        return get(override ?: mainPack).id
    }

    /** Volume of the sounds that answer something you did, whatever the slider says */
    const val FEEDBACK_VOLUME = 0.5f

    fun volume(kind: SoundKind, slider: Int): Float =
        if (kind.atSliderVolume) slider.coerceIn(0, 100) / 100f else FEEDBACK_VOLUME

    private val PACK_ID = Regex("^[a-z0-9_-]{0,40}$")

    /** Keeps the sounds this version knows, each with a pack id or "off" */
    fun sanitizeOverrides(raw: JsonElement?): Map<SoundKind, String>? {
        val input = raw as? JsonObject ?: return null
        val out = LinkedHashMap<SoundKind, String>()
        for (kind in SoundKind.entries) {
            val value = (input[kind.id] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: continue
            if (value.isNotEmpty() && PACK_ID.matches(value)) out[kind] = value
        }
        return out
    }

    fun overridesJson(overrides: Map<SoundKind, String>): JsonObject = buildJsonObject {
        for (kind in SoundKind.entries) overrides[kind]?.let { put(kind.id, JsonPrimitive(it)) }
    }

    fun isPackId(value: String?) = value != null && PACK_ID.matches(value)
}
