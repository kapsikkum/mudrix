package chat.mudrix.android.matrix.rtc

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import chat.mudrix.android.matrix.MudrixRoomState
import chat.mudrix.android.matrix.MudrixTypes
import chat.mudrix.android.matrix.SpaceModern
import chat.mudrix.core.SpaceNode
import chat.mudrix.core.MudrixClient

/**
 * Who may play in a room's call. The packs themselves live in the core (`moe.crafty.room_soundboard`);
 * only the Mudrix "who may play" setting stays a room setting: `...soundboard.settings` with
 * `{ enabled, minPowerLevel }`. A space above the room can switch the soundboard off or raise the level.
 */
object RoomSoundboards {
    val SETTINGS_TYPE = chat.mudrix.android.matrix.Namespace.mudrixKey("soundboard.settings")

    /** Kept this long: custom state is not part of what sync delivers */
    private const val CACHE_MS = 30_000L

    class Settings(val enabled: Boolean, val minPowerLevel: Double)

    class Data(
        /** The room's own setting, or null when it never set one */
        val settings: Settings?,
        val powerLevels: JsonObject?,
        val creators: Set<String>,
        val loadedAt: Long,
    )

    enum class Access { ok, roomDisabled, forbidden }

    private val cache = HashMap<String, Data>()

    private fun sanitizeSettings(raw: JsonElement?): Settings? {
        val o = raw as? JsonObject ?: return null
        val enabled = (o["enabled"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
        val level = (o["minPowerLevel"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() }
        if (enabled == null && level == null) return null
        return Settings(enabled ?: true, level ?: 0.0)
    }

    /** The room's setting and power levels (kept for 30 seconds unless [force]) */
    suspend fun load(client: MudrixClient, roomId: String, force: Boolean = false, now: Long = System.currentTimeMillis()): Data {
        cache[roomId]?.let { if (!force && now - it.loadedAt < CACHE_MS) return it }
        val types = MudrixTypes.typeAndLegacy(SETTINGS_TYPE)
        val (events, room) = coroutineScope {
            val events = async { runCatching { client.stateEventsOfTypes(roomId, types) }.getOrDefault(emptyList()) }
            val room = async { runCatching { client.localRoomSettings(roomId) }.getOrNull() }
            events.await() to room.await()
        }
        val state = MudrixRoomState.from(events)
        val previous = cache[roomId]
        val data = Data(
            settings = sanitizeSettings(state.get(SETTINGS_TYPE)),
            powerLevels = (room?.powerLevels as? JsonObject) ?: previous?.powerLevels,
            creators = room?.creators?.toSet() ?: previous?.creators ?: emptySet(),
            loadedAt = now,
        )
        cache[roomId] = data
        return data
    }

    /** The rooms whose settings apply in [roomId]: the spaces above it (outermost first), then the room itself */
    fun boardRoomIds(graph: List<SpaceNode>, roomId: String): List<String> =
        (SpaceModern.rolesChainOf(graph, roomId).filter { it != roomId }.reversed() + roomId)

    /**
     * Whether [userId] may play clips in the call in [roomId]: the room and every space above it must have the soundboard on
     * (a setting never made counts as on), and the person needs the highest "who can play" level among them, checked against
     * their level in the room that set it (their level in the call room when that is unknown).
     */
    suspend fun access(client: MudrixClient, graph: List<SpaceNode>, roomId: String, userId: String): Access {
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

    /** Shows a change this device just wrote at once (the server's copy is read again after the cache runs out) */
    fun remember(roomId: String, settings: Settings? = null) {
        val current = cache[roomId]
        cache[roomId] = Data(
            settings = settings ?: current?.settings,
            powerLevels = current?.powerLevels,
            creators = current?.creators.orEmpty(),
            loadedAt = System.currentTimeMillis(),
        )
    }

    /** Forgets what was read (tests, and after the account changes) */
    fun reset() = cache.clear()
}
