package chat.mudrix.android.matrix.rtc

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import chat.mudrix.android.matrix.SpaceModern
import chat.mudrix.core.MudrixClient
import chat.mudrix.core.SoundPack
import chat.mudrix.core.SoundboardSound as PackSound

/** Adding, changing and removing clips of a core pack (the personal one, or a room's or space's) */
object SoundboardEdit {
    enum class Problem(val key: String) {
        Type("soundboard.error.type"),
        Size("soundboard.error.size"),
        Duration("soundboard.error.duration"),
        Decode("soundboard.error.decode"),
        Limit("soundboard.error.limit"),
        Forbidden("soundboard.error.forbidden"),
        Upload("soundboard.error.upload"),
        Save("soundboard.error.save"),
    }

    class Failure(val problem: Problem, detail: String? = null) : Exception(detail ?: problem.key)

    /** The power level of a moderator, the "Moderators and up" choice of the room settings */
    const val MODERATOR_LEVEL = 50.0

    /** The three formats the pre-MSC4577 clients know, from the type the system reports or else the file name's ending */
    fun mimetypeOf(contentType: String?, fileName: String?): String? {
        Soundboard.normalizeMimetype(contentType)?.let { return it }
        return when (fileName?.substringAfterLast('.', "")?.lowercase()) {
            "mp3" -> "audio/mpeg"
            "ogg" -> "audio/ogg"
            "wav" -> "audio/wav"
            else -> null
        }
    }

    /** What is wrong with a chosen file, or null when it can be added (the core's limits) */
    fun check(mimetype: String?, size: Long, durationMs: Long): Problem? = when {
        mimetype == null -> Problem.Type
        size <= 0 || size > Soundboard.MAX_SIZE_BYTES -> Problem.Size
        durationMs <= 0 -> Problem.Decode
        durationMs > Soundboard.MAX_DURATION_MS -> Problem.Duration
        else -> null
    }

    fun cleanName(name: String): String = name.trim().replace(Regex("\\s+"), " ").take(Soundboard.MAX_NAME_LENGTH)

    fun cleanEmoji(emoji: String): String? = emoji.trim().take(16).ifEmpty { null }

    /** A shortcode of the standard's shape: ASCII letters, digits, `-` and `_`, at most 100 bytes */
    fun newId(random: java.util.Random = java.security.SecureRandom()): String {
        val bytes = ByteArray(8).also(random::nextBytes)
        return "c_" + bytes.joinToString("") { "%02x".format(it) }
    }

    /** The board with `sound` added; throws when it is full */
    fun added(board: List<SoundboardSound>, sound: SoundboardSound): List<SoundboardSound> {
        if (board.size >= Soundboard.MAX_SOUNDS) throw Failure(Problem.Limit)
        return board + sound
    }

    fun replaced(board: List<SoundboardSound>, sound: SoundboardSound): List<SoundboardSound> =
        board.map { if (it.id == sound.id) sound else it }

    fun removed(board: List<SoundboardSound>, id: String): List<SoundboardSound> = board.filter { it.id != id }

    /** A UI sound as the core saves it */
    fun stored(sound: SoundboardSound) = PackSound(
        shortcode = sound.id,
        url = sound.url,
        body = sound.name.takeIf { it.isNotBlank() },
        emoji = sound.emoji,
        mimetype = sound.mimetype,
        size = sound.size.takeIf { it > 0 },
        durationMs = sound.durationMs,
    )

    private fun problem(error: Exception): Problem {
        val message = error.message.orEmpty()
        return when {
            "tooLarge" in message || "size" in message -> Problem.Size
            "tooLong" in message || "duration" in message -> Problem.Duration
            "unsupported" in message -> Problem.Type
            "badShortcode" in message || "shortcodeTaken" in message -> Problem.Save
            else -> Problem.Upload
        }
    }

    /** Uploads the file through the core and returns the clip to add to a pack (it is not saved yet) */
    suspend fun upload(
        client: MudrixClient,
        bytes: ByteArray,
        mimetype: String,
        durationMs: Long,
        name: String,
        emoji: String?,
    ): SoundboardSound {
        val uploaded = try {
            client.uploadSound(bytes, mimetype, durationMs)
        } catch (e: Exception) {
            throw Failure(problem(e), e.message)
        }
        return SoundboardSound(
            newId(),
            cleanName(name).ifEmpty { "Sound" },
            cleanEmoji(emoji.orEmpty()),
            uploaded.url,
            uploaded.mimetype ?: mimetype,
            (uploaded.durationMs ?: durationMs).toLong(),
            (uploaded.size ?: bytes.size.toLong()).toLong(),
            1f,
        )
    }

    /** Writes the personal pack (`moe.crafty.soundboard` account data) */
    suspend fun savePersonal(client: MudrixClient, pack: SoundPack?, board: List<SoundboardSound>) {
        try {
            client.saveSoundPack(null, "", pack?.name.orEmpty(), pack?.attribution, board.map(::stored))
        } catch (e: Exception) {
            throw Failure(Problem.Save, e.message)
        }
    }

    /** Writes a room's pack; a room without one gets the default pack first. Returns its state key. */
    suspend fun saveRoom(
        client: MudrixClient,
        roomId: String,
        stateKey: String,
        name: String,
        attribution: String?,
        board: List<SoundboardSound>,
    ): String {
        try {
            val key = stateKey.ifEmpty { client.createSoundPack(roomId, name) }
            client.saveSoundPack(roomId, key, name, attribution, board.map(::stored))
            return key
        } catch (e: Exception) {
            throw Failure(Problem.Save, e.message)
        }
    }

    /** Whether `userId` may send `type` state in the room (its board or its settings) */
    fun canManage(data: RoomSoundboards.Data?, userId: String, type: String): Boolean {
        val levels = data?.powerLevels ?: return false
        return SpaceModern.canSendState(levels, data.creators, userId, type)
    }

    fun settingsContent(enabled: Boolean, minPowerLevel: Double) = buildJsonObject {
        put("enabled", enabled)
        put("minPowerLevel", JsonPrimitive(minPowerLevel))
    }

    /** The "who may play" setting is a Mudrix room setting, not part of the standard; it stays as it was */
    suspend fun writeRoomSettings(client: MudrixClient, roomId: String, enabled: Boolean, minPowerLevel: Double) {
        client.setStateEvent(roomId, RoomSoundboards.SETTINGS_TYPE, "", settingsContent(enabled, minPowerLevel))
        RoomSoundboards.remember(roomId, settings = RoomSoundboards.Settings(enabled, minPowerLevel))
    }
}
