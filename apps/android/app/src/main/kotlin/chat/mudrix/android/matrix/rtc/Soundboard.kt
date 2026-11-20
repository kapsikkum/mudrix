package chat.mudrix.android.matrix.rtc

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.MediaPlayer
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import chat.mudrix.android.MudrixApplication
import chat.mudrix.android.matrix.Namespace
import chat.mudrix.core.MudrixClient
import chat.mudrix.core.SoundPack
import chat.mudrix.core.SoundPackSource
import chat.mudrix.core.SoundboardSound as PackSound

/** A bundled clip of the pre-MSC4577 board; the ids are what 26.12.4 clients know them by, and the files are `sb_<id>` in `res/raw` */
data class BuiltInClip(val id: String, val name: String, val emoji: String, val durationMs: Long) {
    val resource get() = "sb_" + id.replace('-', '_')
}

/** A clip of a pack as the editor works on it; `id` is the shortcode MSC4577 sends */
data class SoundboardSound(
    val id: String,
    val name: String,
    val emoji: String?,
    val url: String,
    val mimetype: String,
    val durationMs: Long,
    val size: Long,
    val volume: Float = 1f,
)

/** What the UI lists: a clip of a core pack (`builtIn` for the standard sounds) */
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
    val size: Long? = null,
    /** The pack the clip came from, for editing; null for the standard sounds */
    val packRoomId: String? = null,
    val packStateKey: String? = null,
)

/** The payload of the pre-MSC4577 press, still accepted from 26.12.4 clients */
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
 * The call soundboard. A press is played here at once and sent in the standard MSC4577 form on the
 * LiveKit data topic `moe.crafty.soundboard`: `{ url, shortcode, org.wizardchat.emoji? }`, an `mxc://`
 * URI of at most 1024 bytes. Receivers fetch it with the core's `soundboardSound` and play it on their
 * own side, so each listener can silence it separately from voice. The old Mudrix topic
 * `io.github.kapsikkum.mudrix.soundboard.play` is still received from 26.12.4 clients and sent as a
 * silent fallback on the data channel (never as a room event). Packs live in core.
 */
object Soundboard {
    /** The standard LiveKit data topic (MSC4577) */
    const val TOPIC = "moe.crafty.soundboard"
    /** The old Mudrix data topic and room event, read for 26.12.4 clients */
    const val PLAY_TYPE = "io.github.kapsikkum.mudrix.soundboard.play"
    val PLAY_TYPES = listOf(PLAY_TYPE, Namespace.legacyMudrixKey("soundboard.play"))

    const val EMOJI_KEY = "org.wizardchat.emoji"
    const val MAX_MESSAGE_BYTES = 1024
    const val MAX_SHORTCODE_BYTES = 100
    const val MAX_EMOJI_BYTES = 32

    /** The limits of the core's pack API; a clip from any client is held to them */
    const val MAX_DURATION_MS = 15_000L
    const val MAX_SIZE_BYTES = 1024 * 1024L
    const val MAX_SOUNDS = 32
    const val MAX_NAME_LENGTH = 32
    private const val MAX_PLAY_MS = MAX_DURATION_MS + 1000
    private const val MAX_CONCURRENT = 4
    private const val DUPLICATE_WINDOW_MS = 1500L
    private const val ROOM_AFTER_CALL_WINDOW_MS = 10_000L

    /** The 26.12.4 built-ins, kept only to play what an old client sends */
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

    private fun readable(shortcode: String): String = when (shortcode) {
        "applause" -> "Applause"
        "laugh" -> "Laughter"
        "rimshot" -> "Ba-dum-tss"
        "drumroll" -> "Drum roll"
        "tada" -> "Ta-da"
        "airhorn" -> "Air horn"
        "crickets" -> "Crickets"
        "sad_trombone" -> "Sad trombone"
        else -> shortcode.replace('_', ' ').replace('-', ' ').replaceFirstChar { it.uppercase() }
    }

    /** A core pack sound as the UI lists it */
    fun toClip(sound: PackSound, builtIn: Boolean = false, roomId: String? = null, stateKey: String? = null) =
        SoundboardClip(
            sound.shortcode,
            sound.body?.takeIf { it.isNotBlank() } ?: readable(sound.shortcode),
            sound.emoji,
            builtIn,
            sound.url,
            sound.mimetype ?: "audio/mpeg",
            (sound.durationMs ?: 0).toLong(),
            1f,
            null,
            (sound.size ?: 0).toLong().takeIf { it > 0 },
            roomId,
            stateKey,
        )

    /** A core pack sound as the editor works on it */
    fun toSound(sound: PackSound) = SoundboardSound(
        sound.shortcode,
        sound.body?.takeIf { it.isNotBlank() } ?: readable(sound.shortcode),
        sound.emoji,
        sound.url,
        sound.mimetype ?: "audio/mpeg",
        (sound.durationMs ?: 0).toLong(),
        (sound.size ?: 0).toLong(),
        1f,
    )

    /** A UI sound as the editor previews it */
    fun toClip(sound: SoundboardSound) = SoundboardClip(
        id = sound.id,
        name = sound.name,
        emoji = sound.emoji,
        builtIn = false,
        url = sound.url,
        mimetype = sound.mimetype,
        durationMs = sound.durationMs,
        volume = sound.volume,
        size = sound.size,
    )

    /** The clips of a core pack */
    fun clips(pack: SoundPack): List<SoundboardClip> =
        pack.sounds.map { toClip(it, pack.source == SoundPackSource.builtIn, pack.roomId, pack.stateKey) }

    /**
     * Keeps only well-formed clips of the old `{ sounds: [ { id, name, url, ... } ] }` board; never
     * throws. Only used by the access rules, whose settings are not part of MSC4577.
     */
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

    /** The MSC4577 payload of a press: the `mxc://` URI, the shortcode and the emoji */
    fun message(clip: SoundboardClip): JsonObject = buildJsonObject {
        put("url", clip.url)
        put("shortcode", clip.id.take(MAX_SHORTCODE_BYTES))
        clip.emoji?.takeIf { it.encodeToByteArray().size <= MAX_EMOJI_BYTES }?.let { put(EMOJI_KEY, it) }
    }

    /** The old payload, sent as a silent fallback on the data channel so 26.12.4 clients can fetch the same file */
    fun legacyMessage(clip: SoundboardClip): JsonObject = buildJsonObject {
        put(
            "sound",
            buildJsonObject {
                put("id", clip.id)
                put("name", clip.name)
                clip.emoji?.let { put("emoji", it) }
                put("volume", 1.0)
                put("url", clip.url)
                put("mimetype", normalizeMimetype(clip.mimetype) ?: "audio/mpeg")
                put("durationMs", minOf(clip.durationMs, 5000L))
            },
        )
    }

    class Play(val url: String, val shortcode: String?, val emoji: String?)

    /** A press on the standard topic, or null when it is not an acceptable one */
    fun parse(data: ByteArray): Play? {
        if (data.size > MAX_MESSAGE_BYTES) return null
        val message = runCatching { Json.parseToJsonElement(data.decodeToString()) as? JsonObject }.getOrNull() ?: return null
        val url = message["url"].string()?.takeIf { it.startsWith("mxc://") } ?: return null
        val shortcode = message["shortcode"].string()?.takeIf { it.encodeToByteArray().size <= MAX_SHORTCODE_BYTES }
        val emoji = message[EMOJI_KEY].string()?.takeIf { it.encodeToByteArray().size <= MAX_EMOJI_BYTES }
        return Play(url, shortcode, emoji)
    }

    /** What a received old press asks for, or null when it is not an acceptable one */
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
        val client: MudrixClient,
        val roomId: String,
        val userId: String,
        val inCall: (String) -> Boolean,
        val deafened: () -> Boolean,
        val send: (JsonObject, String) -> Unit,
    )

    @Volatile var link: CallLink? = null

    private val scope = MainScope()
    private val sendLimiter = SoundboardLimiter.forSending()
    private val receiveLimiter = SoundboardLimiter.forReceiving()
    private val recentCall = HashMap<String, Long>()
    private val recentRoom = HashMap<String, Long>()
    private val active = HashMap<String, MediaPlayer>()
    private val files by lazy { File(MudrixApplication.instance.cacheDir, "soundboard") }

    /** A new call: forget the senders' history */
    fun reset() {
        sendLimiter.reset()
        receiveLimiter.reset()
        recentCall.clear()
        recentRoom.clear()
    }

    private val prefs get() = MudrixApplication.instance.prefs

    /** Plays a clip here and sends it to the call; the result says why nothing happened */
    fun press(roomId: String, clip: SoundboardClip): PlayResult {
        val link = link ?: return PlayResult.NotInCall
        if (!prefs.soundboardEnabled) return PlayResult.Disabled
        if (link.roomId != roomId) return PlayResult.NotInCall
        if (clip.url.isEmpty()) return PlayResult.Error
        val verdict = sendLimiter.check(link.userId, clip.id)
        if (verdict != PlayResult.Ok) return verdict
        // While deafened the press is sent but not heard
        if (!link.deafened()) playUrl(link.client, link.userId, clip.url, clip.volume, clip.durationMs)
        link.send(message(clip), TOPIC)
        // Silent fallback for 26.12.4 clients, on the data channel only (no room event)
        link.send(legacyMessage(clip), PLAY_TYPE)
        scope.launch { runCatching { link.client.recordSoundPlayed(clip.url) } }
        return PlayResult.Ok
    }

    /** Plays a clip here only (the editor's preview); nothing is sent */
    fun preview(client: MudrixClient, clip: SoundboardClip) {
        if (clip.url.isNotEmpty()) playUrl(client, "preview", clip.url, clip.volume, clip.durationMs)
        else if (clip.builtIn && clip.resource != null) playBundled("preview", clip.resource, clip.volume, clip.durationMs)
    }

    /** A press on the call's data channel: the standard topic, or the old one from 26.12.4 */
    fun receive(roomId: String, sender: String, topic: String, data: ByteArray) {
        if (topic == TOPIC) {
            val play = parse(data) ?: return
            receiveStandard(roomId, sender, play)
        } else if (topic in PLAY_TYPES) {
            val content = runCatching { Json.parseToJsonElement(data.decodeToString()) }.getOrNull() ?: return
            receiveLegacy(roomId, sender, content, fromRoom = false)
        }
    }

    /** A press that came as the old room event (26.12.4 clients send one as well as the data topic) */
    fun receive(roomId: String, sender: String, content: JsonElement, fromRoom: Boolean) {
        receiveLegacy(roomId, sender, content, fromRoom)
    }

    private fun listening(roomId: String, sender: String): CallLink? {
        val link = link ?: return null
        if (link.roomId != roomId || sender == link.userId || !link.inCall(sender)) return null
        if (!prefs.soundboardEnabled || link.deafened() || sender in prefs.soundboardMutedUsers) return null
        return link
    }

    private fun duplicate(sender: String, key: String, fromRoom: Boolean): Boolean {
        val now = System.currentTimeMillis()
        val own = if (fromRoom) recentRoom else recentCall
        if (own["$sender:$key"]?.let { now - it < DUPLICATE_WINDOW_MS } == true) return true
        if (fromRoom && recentCall["$sender:$key"]?.let { now - it < ROOM_AFTER_CALL_WINDOW_MS } == true) return true
        own["$sender:$key"] = now
        if (own.size > 100) own.remove(own.keys.first())
        return false
    }

    private fun receiveStandard(roomId: String, sender: String, play: Play) {
        val link = listening(roomId, sender) ?: return
        val key = play.shortcode ?: play.url
        if (duplicate(sender, key, fromRoom = false)) return
        if (receiveLimiter.check(sender, key) != PlayResult.Ok) return
        playUrl(link.client, sender, play.url, 1f, null)
    }

    private fun receiveLegacy(roomId: String, sender: String, content: JsonElement?, fromRoom: Boolean) {
        val link = listening(roomId, sender) ?: return
        val press = parsePress(content) ?: return
        if (duplicate(sender, press.id, fromRoom)) return
        if (receiveLimiter.check(sender, press.id) != PlayResult.Ok) return
        if (press.builtIn) {
            playBundled(sender, builtInClip(press.id)?.resource, press.volume, press.durationMs)
        } else {
            playUrl(link.client, sender, press.url.orEmpty(), press.volume, press.durationMs)
        }
    }

    private fun playUrl(client: MudrixClient, sender: String, url: String, volume: Float, durationMs: Long?) {
        if (url.isEmpty()) return
        scope.launch {
            try {
                if (active.size >= MAX_CONCURRENT) return@launch
                val player = openFile(client, url) ?: return@launch
                start(sender, url, player, volume, durationMs)
            } catch (_: Exception) {
            }
        }
    }

    private fun playBundled(sender: String, resource: String?, volume: Float, durationMs: Long?) {
        if (resource == null) return
        scope.launch {
            try {
                if (active.size >= MAX_CONCURRENT) return@launch
                val player = openBundled(resource) ?: return@launch
                start(sender, resource, player, volume, durationMs)
            } catch (_: Exception) {
            }
        }
    }

    private fun start(sender: String, id: String, player: MediaPlayer, volume: Float, durationMs: Long?) {
        if (!prefs.soundboardEnabled || link?.deafened?.invoke() == true || active.size >= MAX_CONCURRENT) {
            player.release()
            return
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
        scope.launch {
            // A file claiming 5 s but running longer is cut off
            val limit = minOf(durationMs?.takeIf { it > 0 } ?: MAX_PLAY_MS, MAX_PLAY_MS) + 400
            kotlinx.coroutines.delay(limit)
            stop(key)
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
    private fun openBundled(resource: String): MediaPlayer? {
        val context = MudrixApplication.instance
        return runCatching {
            MediaPlayer().apply {
                setAudioAttributes(attributes())
                val id = context.resources.getIdentifier(resource, "raw", context.packageName)
                if (id == 0) return null
                val descriptor = context.resources.openRawResourceFd(id)
                setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                descriptor.close()
                prepare()
            }
        }.getOrNull()
    }

    private suspend fun openFile(client: MudrixClient, url: String): MediaPlayer? {
        val file = download(client, url)
        return runCatching {
            MediaPlayer().apply {
                setAudioAttributes(attributes())
                setDataSource(file.absolutePath)
                prepare()
            }
        }.getOrNull()
    }

    private fun attributes() = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    /** A clip on disk, downloaded once through the core (which decrypts the room's media and knows the built-ins) */
    private suspend fun download(client: MudrixClient, url: String): File {
        val name = MessageDigest.getInstance("SHA-256").digest(url.encodeToByteArray()).joinToString("") { "%02x".format(it) }.take(32)
        val file = File(files, name)
        if (file.exists()) return file
        val bytes = client.soundboardSound(url)
        if (bytes.size > MAX_SIZE_BYTES * 1.5) throw IllegalStateException("clip too large")
        withContext(Dispatchers.IO) {
            files.mkdirs()
            file.writeBytes(bytes)
        }
        return file
    }
}
