package org.wizardchat.android.matrix.rtc

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import org.wizardchat.android.matrix.MudrixRoomState
import org.wizardchat.android.matrix.Namespace
import org.wizardchat.android.matrix.MudrixTypes
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.core.SpaceNode
import org.wizardchat.core.WizardClient

/**
 * The boards of rooms and spaces and who may play in them (read only here; editing is not done on Android). A room's board is
 * its `io.github.kapsikkum.mudrix.soundboard` state (also read under the earlier name), its settings
 * `...soundboard.settings`. A space's clips are shared with its rooms, and every space above the room can switch the
 * soundboard off or raise the level needed to play, like the web's `boards.ts`.
 */
object RoomSoundboards {
    private val DATA_TYPE = Namespace.mudrixKey("soundboard")
    private val SETTINGS_TYPE = Namespace.mudrixKey("soundboard.settings")

    /** Kept this long: custom state is not part of what sync delivers */
    private const val CACHE_MS = 30_000L

    class Settings(val enabled: Boolean, val minPowerLevel: Double)

    class Data(
        val board: List<SoundboardSound>,
        /** The room's own setting, or null when it never set one */
        val settings: Settings?,
        val powerLevels: JsonObject?,
        val creators: Set<String>,
        val loadedAt: Long,
    )

    /** A clip of a room or space board and the room whose board holds it */
    class RoomClip(val clip: SoundboardClip, val originRoomId: String)

    enum class Access { ok, roomDisabled, forbidden }

    private val cache = HashMap<String, Data>()

    private fun sanitizeSettings(raw: JsonElement?): Settings? {
        val o = raw as? JsonObject ?: return null
        val enabled = (o["enabled"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
        val level = (o["minPowerLevel"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() }
        if (enabled == null && level == null) return null
        return Settings(enabled ?: true, level ?: 0.0)
    }

    /** The room's board, settings and power levels (kept for 30 seconds unless [force]) */
    suspend fun load(client: WizardClient, roomId: String, force: Boolean = false, now: Long = System.currentTimeMillis()): Data {
        cache[roomId]?.let { if (!force && now - it.loadedAt < CACHE_MS) return it }
        val types = MudrixTypes.typeAndLegacy(DATA_TYPE) + MudrixTypes.typeAndLegacy(SETTINGS_TYPE)
        val (events, room) = coroutineScope {
            val events = async { runCatching { client.stateEventsOfTypes(roomId, types) }.getOrDefault(emptyList()) }
            val room = async { runCatching { client.localRoomSettings(roomId) }.getOrNull() }
            events.await() to room.await()
        }
        val state = MudrixRoomState.from(events)
        val previous = cache[roomId]
        val data = Data(
            board = Soundboard.parseBoard(state.get(DATA_TYPE)),
            settings = sanitizeSettings(state.get(SETTINGS_TYPE)),
            powerLevels = (room?.powerLevels as? JsonObject) ?: previous?.powerLevels,
            creators = room?.creators?.toSet() ?: previous?.creators ?: emptySet(),
            loadedAt = now,
        )
        cache[roomId] = data
        return data
    }

    /** The rooms whose boards apply in [roomId]: the spaces above it (outermost first), then the room itself */
    fun boardRoomIds(graph: List<SpaceNode>, roomId: String): List<String> =
        (SpaceModern.rolesChainOf(graph, roomId).filter { it != roomId }.reversed() + roomId)

    /** Every room and space board that applies in [roomId] (the room's own clip wins over a space's with the same id) */
    suspend fun clips(client: WizardClient, graph: List<SpaceNode>, roomId: String): List<RoomClip> {
        val ids = boardRoomIds(graph, roomId)
        val all = coroutineScope { ids.map { id -> async { load(client, id) } }.map { it.await() } }
        val out = ArrayList<RoomClip>()
        ids.forEachIndexed { i, origin ->
            for (sound in all[i].board) {
                out.removeAll { it.clip.id == sound.id }
                out += RoomClip(Soundboard.toClip(sound), origin)
            }
        }
        return out
    }

    /**
     * Whether [userId] may play clips in the call in [roomId]: the room and every space above it must have the soundboard on
     * (a setting never made counts as on), and the person needs the highest "who can play" level among them, checked against
     * their level in the room that set it (their level in the call room when that is unknown).
     */
    suspend fun access(client: WizardClient, graph: List<SpaceNode>, roomId: String, userId: String): Access {
        val ids = boardRoomIds(graph, roomId)
        val all = coroutineScope { ids.map { id -> async { load(client, id) } }.map { it.await() } }
        fun levelIn(data: Data): Double? = data.powerLevels?.let { if (userId in data.creators) Double.MAX_VALUE else SpaceModern.powerLevelOf(it, userId) }
        val roomLevel = levelIn(all.last()) ?: 0.0
        var verdict = Access.ok
        for (data in all) {
            val settings = data.settings ?: continue
            if (verdict == Access.roomDisabled) break
            if (!settings.enabled) {
                verdict = Access.roomDisabled
                continue
            }
            if ((levelIn(data) ?: roomLevel) < settings.minPowerLevel) verdict = Access.forbidden
        }
        return verdict
    }

    /** Forgets what was read (tests, and after the account changes) */
    fun reset() = cache.clear()
}
