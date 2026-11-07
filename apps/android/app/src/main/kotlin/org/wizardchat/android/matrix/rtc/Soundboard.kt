package org.wizardchat.android.matrix.rtc

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.MediaPlayer
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.Namespace
import org.wizardchat.core.WizardClient

/** A bundled clip; the ids are what other clients know them by, and the files are `sb_<id>` in `res/raw` */
data class BuiltInClip(val id: String, val name: String, val emoji: String, val durationMs: Long) {
    val resource get() = "sb_" + id.replace('-', '_')
}

/** A custom clip of a personal or room board: stored in account data or room state */
data class SoundboardSound(
    val id: String,
    val name: String,
    val emoji: String?,
    val url: String,
    val mimetype: String,
    val durationMs: Long,
    val size: Long,
    val volume: Float,
)

/** What the UI lists: a bundled clip (`url` empty) or a custom one */
data class SoundboardClip(
    val id: String,
    val name: String,
    val emoji: String?,
    val builtIn: Boolean,
    val url: String,
    val mimetype: String,
    val durationMs: Long,
    val volume: Float,
    val resource: String? = null,
)

/** One press as it is sent: `{ sound: { id, name, emoji?, volume, builtin? | url, mimetype, durationMs } }` */
data class SoundboardPress(
    val id: String,
    val name: String,
    val emoji: String?,
    val volume: Float,
    val builtIn: Boolean,
    val url: String?,
    val mimetype: String?,
    val durationMs: Long?,
)

enum class PlayResult { Ok, Disabled, NotInCall, RateLimited, Cooldown, Error }

/** Soundboard rate limits: the sender limits itself and every receiver limits each sender again */
class SoundboardLimiter(private val minGapMs: Long, private val burst: Int, private val windowMs: Long, private val perSoundCooldownMs: Long) {
    private class History(val times: ArrayList<Long> = ArrayList(), val perSound: HashMap<String, Long> = HashMap())

    private val senders = HashMap<String, History>()

    /** Records the clip when allowed */
    fun check(senderId: String, soundKey: String, now: Long = System.currentTimeMillis()): PlayResult {
        val history = senders.getOrPut(senderId) { History() }
        history.times.removeAll { now - it >= windowMs }
        history.perSound.entries.removeAll { now - it.value >= windowMs }
        val last = history.times.lastOrNull()
        if (last != null && now - last < minGapMs) return PlayResult.RateLimited
        if (history.times.size >= burst) return PlayResult.RateLimited
        val lastSame = history.perSound[soundKey]
        if (lastSame != null && now - lastSame < perSoundCooldownMs) return PlayResult.Cooldown
        history.times.add(now)
        history.perSound[soundKey] = now
        return PlayResult.Ok
    }

    fun reset() = senders.clear()

    companion object {
        /** What we allow ourselves: a new clip after 0.4 s, 5 per 10 s, 1 s cooldown per sound */
        fun forSending() = SoundboardLimiter(400, 5, 10_000, 1000)

        /** Receivers are a little looser on the gap, since events arrive with network jitter */
        fun forReceiving() = SoundboardLimiter(250, 5, 10_000, 700)
    }
}

/**
 * The call soundboard (`features/soundboard` on the web). A press is played here at once and sent to the
 * call as `io.github.kapsikkum.mudrix.soundboard.play`, on the data channel (topic = the type) and as a
 * room event for clients that cannot use the data channel; everyone who receives it plays it on their own
 * side, so each listener can silence it separately from voice. Receivers check what they are sent.
 */
object Soundboard {
    val PLAY_TYPE = Namespace.mudrixKey("soundboard.play")
    val PLAY_TYPES = listOf(PLAY_TYPE, Namespace.legacyMudrixKey("soundboard.play"))
    val BOARD_TYPE = Namespace.mudrixKey("soundboard")
    val LEGACY_BOARD_TYPE = Namespace.legacyMudrixKey("soundboard")

    const val MAX_DURATION_MS = 5000L
    const val MAX_SIZE_BYTES = 512 * 1024
    const val MAX_SOUNDS = 32
    const val MAX_NAME_LENGTH = 32
    private const val MAX_PLAY_MS = MAX_DURATION_MS + 1000
    private const val MAX_CONCURRENT = 4
    private const val DUPLICATE_WINDOW_MS = 1500L
    private const val ROOM_AFTER_CALL_WINDOW_MS = 10_000L

    val builtIn = listOf(
        BuiltInClip("airhorn", "Air Horn", "📯", 2009),
        BuiltInClip("applause", "Applause", "👏", 3451),
        BuiltInClip("cheer", "Cheer", "🎉", 3283),
        BuiltInClip("clap", "Clapping", "🙌", 1754),
        BuiltInClip("giggle", "Giggles", "🤭", 2176),
        BuiltInClip("rimshot", "Rimshot", "🥁", 937),
        BuiltInClip("sad-trombone", "Sad Trombone", "😢", 3782),
        BuiltInClip("ding", "Ding", "🔔", 1216),
        BuiltInClip("whoosh", "Whoosh", "💨", 2131),
        BuiltInClip("pop", "Pop", "🫧", 171),
        BuiltInClip("tada", "Ta-da", "🎊", 1398),
        BuiltInClip("boing", "Boing", "🦘", 906),
        BuiltInClip("record-scratch", "Record Scratch", "💿", 448),
        BuiltInClip("crickets", "Crickets", "🦗", 2832),
        BuiltInClip("gong", "Gong", "🎶", 3972),
        BuiltInClip("drumroll", "Drum Roll", "🥁", 3600),
        BuiltInClip("sparkle", "Magic Sparkle", "✨", 419),
        BuiltInClip("honk", "Horn Honk", "🚲", 1300),
    )

    val builtInClips: List<SoundboardClip> = builtIn.map {
        SoundboardClip(it.id, it.name, it.emoji, true, "", "audio/mpeg", it.durationMs, 1f, it.resource)
    }

    fun builtInClip(id: String) = builtInClips.firstOrNull { it.id == id }

    /** The three formats a clip may have, with the names servers and phones use for them */
    fun normalizeMimetype(raw: String?): String? = when ((raw ?: "").substringBefore(';').trim().lowercase()) {
        "audio/mpeg", "audio/mp3" -> "audio/mpeg"
        "audio/ogg", "application/ogg" -> "audio/ogg"
        "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave" -> "audio/wav"
        else -> null
    }

    private fun JsonElement?.string() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
    private fun JsonElement?.number() = (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() }

    /** Keeps only well-formed clips with an allowed type, size and length; never throws */
    fun parseBoard(raw: JsonElement?): List<SoundboardSound> {
        val list = (raw as? JsonObject)?.get("sounds") as? JsonArray ?: return emptyList()
        val seen = HashSet<String>()
        val out = ArrayList<SoundboardSound>()
        for (entry in list) {
            val s = entry as? JsonObject ?: continue
            val id = s["id"].string()?.takeIf { it.isNotEmpty() && it !in seen } ?: continue
            val name = s["name"].string()?.takeIf { it.isNotEmpty() } ?: continue
            val url = s["url"].string()?.takeIf { it.startsWith("mxc://") } ?: continue
            val mimetype = normalizeMimetype(s["mimetype"].string()) ?: continue
            val duration = s["durationMs"].number()?.takeIf { it > 0 } ?: continue
            val size = s["size"].number()?.takeIf { it >= 0 } ?: continue
            seen.add(id)
            out.add(
                SoundboardSound(
                    id,
                    name.take(MAX_NAME_LENGTH),
                    s["emoji"].string()?.takeIf { it.isNotEmpty() }?.take(16),
                    url,
                    mimetype,
                    minOf(duration, MAX_DURATION_MS.toDouble()).toLong(),
                    minOf(size, MAX_SIZE_BYTES * 2.0).toLong(),
                    (s["volume"].number() ?: 1.0).coerceIn(0.0, 1.0).toFloat(),
                ),
            )
        }
        return out.take(MAX_SOUNDS)
    }

    fun toClip(sound: SoundboardSound) =
        SoundboardClip(sound.id, sound.name, sound.emoji, false, sound.url, sound.mimetype, sound.durationMs, sound.volume)

    /** The personal board: the current name wins, the earlier Mudrix one fills in */
    suspend fun personalBoard(client: WizardClient): List<SoundboardSound> {
        val current = runCatching { client.cachedAccountData(BOARD_TYPE) }.getOrNull()
        val board = parseBoard(current)
        if (board.isNotEmpty() || current != null) return board
        return parseBoard(runCatching { client.cachedAccountData(LEGACY_BOARD_TYPE) }.getOrNull())
    }

    /** The content for a press: bundled clips carry only their id, the rest the `mxc://` URI */
    fun playContent(clip: SoundboardClip): JsonObject = buildJsonObject {
        put(
            "sound",
            buildJsonObject {
                put("id", clip.id)
                put("name", clip.name)
                clip.emoji?.let { put("emoji", it) }
                put("volume", clip.volume.coerceIn(0f, 1f).toDouble())
                if (clip.builtIn) {
                    put("builtin", true)
                } else {
                    put("url", clip.url)
                    put("mimetype", clip.mimetype)
                    put("durationMs", clip.durationMs)
                }
            },
        )
    }

    /** What a received press asks for, or null when it is not an acceptable one */
    fun parsePress(content: JsonElement?): SoundboardPress? {
        val sound = (content as? JsonObject)?.get("sound") as? JsonObject ?: return null
        val id = sound["id"].string() ?: return null
        val volume = (sound["volume"].number() ?: 1.0).coerceIn(0.0, 1.0).toFloat()
        val name = sound["name"].string()?.take(64).orEmpty().ifEmpty { id }
        val emoji = sound["emoji"].string()?.take(16)
        if ((sound["builtin"] as? JsonPrimitive)?.booleanOrNull == true) {
            val clip = builtInClip(id) ?: return null
            return SoundboardPress(id, name, emoji, volume, true, null, clip.mimetype, clip.durationMs)
        }
        val url = sound["url"].string()?.takeIf { it.startsWith("mxc://") } ?: return null
        val mimetype = normalizeMimetype(sound["mimetype"].string()) ?: return null
        val duration = sound["durationMs"].number()?.coerceIn(0.0, MAX_DURATION_MS.toDouble())?.toLong()
        return SoundboardPress(id, name, emoji, volume, false, url, mimetype, duration)
    }

    // --- Runtime: what the call tells us, and what is playing ---

    /** Set by the call while joined: the room, who is in it, whether we are deafened and how to send */
    class CallLink(
        val client: WizardClient,
        val roomId: String,
        val userId: String,
        val inCall: (String) -> Boolean,
        val deafened: () -> Boolean,
        val send: (JsonObject) -> Unit,
    )

    @Volatile var link: CallLink? = null

    private val scope = MainScope()
    private val sendLimiter = SoundboardLimiter.forSending()
    private val receiveLimiter = SoundboardLimiter.forReceiving()
    private val recentCall = HashMap<String, Long>()
    private val recentRoom = HashMap<String, Long>()
    private val active = HashMap<String, MediaPlayer>()
    private val files by lazy { File(WizardApplication.instance.cacheDir, "soundboard") }

    /** A new call: forget the senders' history */
    fun reset() {
        sendLimiter.reset()
        receiveLimiter.reset()
        recentCall.clear()
        recentRoom.clear()
    }

    private val prefs get() = WizardApplication.instance.prefs

    /** Plays a clip here and sends it to the call; the result says why nothing happened */
    fun press(roomId: String, clip: SoundboardClip): PlayResult {
        val link = link ?: return PlayResult.NotInCall
        if (!prefs.soundboardEnabled) return PlayResult.Disabled
        if (link.roomId != roomId) return PlayResult.NotInCall
        val verdict = sendLimiter.check(link.userId, (if (clip.builtIn) "builtIn:" else "custom:") + clip.id)
        if (verdict != PlayResult.Ok) return verdict
        // While deafened the press is sent but not heard
        if (!link.deafened()) {
            play(link.client, link.userId, clip.id, clip.builtIn, clip.resource, clip.url, clip.volume, clip.durationMs)
        }
        link.send(playContent(clip))
        return PlayResult.Ok
    }

    /** Plays someone else's press when everything checks out; `fromRoom` is a press that came as a room event */
    fun receive(roomId: String, sender: String, content: JsonElement?, fromRoom: Boolean) {
        val link = link ?: return
        if (link.roomId != roomId || sender == link.userId || !link.inCall(sender)) return
        if (!prefs.soundboardEnabled || link.deafened() || sender in prefs.soundboardMutedUsers) return
        val press = parsePress(content) ?: return
        val now = System.currentTimeMillis()
        val key = "$sender:${press.id}"
        // The same press can arrive twice, on the data channel and as a room event
        val own = if (fromRoom) recentRoom else recentCall
        if (own[key]?.let { now - it < DUPLICATE_WINDOW_MS } == true) return
        if (fromRoom && recentCall[key]?.let { now - it < ROOM_AFTER_CALL_WINDOW_MS } == true) return
        own[key] = now
        if (own.size > 100) own.remove(own.keys.first())
        if (receiveLimiter.check(sender, press.id) != PlayResult.Ok) return
        play(link.client, sender, press.id, press.builtIn, if (press.builtIn) builtInClip(press.id)?.resource else null, press.url.orEmpty(), press.volume, press.durationMs)
    }

    @SuppressLint("DiscouragedApi")
    private fun play(client: WizardClient, sender: String, id: String, builtIn: Boolean, resource: String?, url: String, volume: Float, durationMs: Long?) {
        scope.launch {
            try {
                if (active.size >= MAX_CONCURRENT) return@launch
                val player = open(client, builtIn, resource, url) ?: return@launch
                if (!prefs.soundboardEnabled || link?.deafened?.invoke() == true || active.size >= MAX_CONCURRENT) {
                    player.release()
                    return@launch
                }
                // One clip per person at a time: a new press cuts off that person's previous one
                active.keys.filter { it.startsWith("$sender|") }.forEach { stop(it) }
                val gain = volume.coerceIn(0f, 1f) * (prefs.soundboardVolume.coerceIn(0, 100) / 100f)
                player.setVolume(gain, gain)
                val key = "$sender|$id|${System.nanoTime()}"
                active[key] = player
                player.setOnCompletionListener { stop(key) }
                player.setOnErrorListener { _, _, _ -> stop(key).let { true } }
                player.start()
                // A file claiming 5 s but running longer is cut off
                val limit = minOf(durationMs?.takeIf { it > 0 } ?: MAX_PLAY_MS, MAX_PLAY_MS) + 400
                kotlinx.coroutines.delay(limit)
                stop(key)
            } catch (_: Exception) {
            }
        }
    }

    private fun stop(key: String) {
        active.remove(key)?.let { player ->
            runCatching { player.stop() }
            player.release()
        }
    }

    /** Stops every clip now: the call ended, we deafened or the soundboard was turned off */
    fun stopAll() {
        active.keys.toList().forEach(::stop)
    }

    @SuppressLint("DiscouragedApi")
    private suspend fun open(client: WizardClient, builtIn: Boolean, resource: String?, url: String): MediaPlayer? {
        val context = WizardApplication.instance
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        return runCatching {
            MediaPlayer().apply {
                setAudioAttributes(attributes)
                if (builtIn) {
                    val id = context.resources.getIdentifier(resource ?: return null, "raw", context.packageName)
                    if (id == 0) return null
                    val descriptor = context.resources.openRawResourceFd(id)
                    setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                    descriptor.close()
                } else {
                    setDataSource(download(client, url).absolutePath)
                }
                prepare()
            }
        }.getOrNull()
    }

    /** A custom clip on disk, downloaded once (and decrypted when the room's media is) */
    private suspend fun download(client: WizardClient, url: String): File {
        val name = MessageDigest.getInstance("SHA-256").digest(url.encodeToByteArray()).joinToString("") { "%02x".format(it) }.take(32)
        val file = File(files, name)
        if (file.exists()) return file
        val bytes = client.media(buildJsonObject { put("url", url) })
        if (bytes.size > MAX_SIZE_BYTES * 1.5) throw IllegalStateException("clip too large")
        withContext(Dispatchers.IO) {
            files.mkdirs()
            file.writeBytes(bytes)
        }
        return file
    }
}
