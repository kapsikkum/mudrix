package org.wizardchat.android.matrix.rtc

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.core.WizardClient

/** Adding, changing and removing clips of a personal, room or space board (the web's `boards.ts` writes and `upload.ts`) */
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

    const val MODERATOR_LEVEL = 50.0

    /** The three formats allowed, from the type the system reports or else the file name's ending */
    fun mimetypeOf(contentType: String?, fileName: String?): String? {
        Soundboard.normalizeMimetype(contentType)?.let { return it }
        return when (fileName?.substringAfterLast('.', "")?.lowercase()) {
            "mp3" -> "audio/mpeg"
            "ogg" -> "audio/ogg"
            "wav" -> "audio/wav"
            else -> null
        }
    }

    /** What is wrong with a chosen file, or null when it can be added */
    fun check(mimetype: String?, size: Long, durationMs: Long): Problem? = when {
        mimetype == null -> Problem.Type
        size <= 0 || size > Soundboard.MAX_SIZE_BYTES -> Problem.Size
        durationMs <= 0 -> Problem.Decode
        durationMs > Soundboard.MAX_DURATION_MS -> Problem.Duration
        else -> null
    }

    fun cleanName(name: String): String = name.trim().replace(Regex("\\s+"), " ").take(Soundboard.MAX_NAME_LENGTH)

    fun cleanEmoji(emoji: String): String? = emoji.trim().take(16).ifEmpty { null }

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

    /** How a board is stored in account data or room state */
    fun content(board: List<SoundboardSound>): JsonObject = buildJsonObject {
        put(
            "sounds",
            JsonArray(
                board.map { s ->
                    buildJsonObject {
                        put("id", s.id)
                        put("name", s.name)
                        s.emoji?.let { put("emoji", it) }
                        put("url", s.url)
                        put("mimetype", s.mimetype)
                        put("durationMs", s.durationMs)
                        put("size", s.size)
                        put("volume", s.volume.coerceIn(0f, 1f).toDouble())
                    }
                },
            ),
        )
    }

    fun settingsContent(enabled: Boolean, minPowerLevel: Double): JsonObject = buildJsonObject {
        put("enabled", enabled)
        put("minPowerLevel", JsonPrimitive(minPowerLevel))
    }

    /** Uploads the file and returns the clip to add to a board (it is not saved yet) */
    suspend fun upload(
        client: WizardClient,
        bytes: ByteArray,
        mimetype: String,
        durationMs: Long,
        name: String,
        emoji: String?,
        volume: Float,
    ): SoundboardSound {
        val url = try {
            client.uploadMedia(bytes, mimetype)
        } catch (e: Exception) {
            throw Failure(Problem.Upload, e.message)
        }
        return SoundboardSound(newId(), cleanName(name).ifEmpty { "Sound" }, cleanEmoji(emoji.orEmpty()), url, mimetype, durationMs, bytes.size.toLong(), volume.coerceIn(0f, 1f))
    }

    suspend fun writePersonal(client: WizardClient, board: List<SoundboardSound>) {
        try {
            client.setAccountData(Soundboard.BOARD_TYPE, content(board))
        } catch (e: Exception) {
            throw Failure(Problem.Save, e.message)
        }
    }

    /** Whether `userId` may send `type` state in the room (its board or its settings) */
    fun canManage(data: RoomSoundboards.Data?, userId: String, type: String): Boolean {
        val levels = data?.powerLevels ?: return false
        return SpaceModern.canSendState(levels, data.creators, userId, type)
    }

    suspend fun writeRoom(client: WizardClient, roomId: String, userId: String, board: List<SoundboardSound>) {
        val data = RoomSoundboards.load(client, roomId)
        if (!canManage(data, userId, Soundboard.BOARD_TYPE)) throw Failure(Problem.Forbidden)
        try {
            client.setStateEvent(roomId, Soundboard.BOARD_TYPE, "", content(board))
        } catch (e: Exception) {
            throw Failure(Problem.Save, e.message)
        }
        RoomSoundboards.remember(roomId, board = board)
    }

    suspend fun writeRoomSettings(client: WizardClient, roomId: String, enabled: Boolean, minPowerLevel: Double) {
        client.setStateEvent(roomId, RoomSoundboards.SETTINGS_TYPE, "", settingsContent(enabled, minPowerLevel))
        RoomSoundboards.remember(roomId, settings = RoomSoundboards.Settings(enabled, minPowerLevel))
    }
}
