package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.core.StateChange
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

/** The Mudrix state types kept on a space or room (`io.github.kapsikkum.mudrix.*`, read under `chat.mudrix.*` too) */
object MudrixTypes {
    val SPACE_LIST_STYLE = Namespace.mudrixKey("space_list_style")
    val SPACE_BANNER = Namespace.mudrixKey("space_banner")
    val SPACE_AUTO_JOIN = Namespace.mudrixKey("space_auto_join")
    val SPACE_ROLES = Namespace.mudrixKey("space_roles")
    val SPACE_MEMBER_ROLES = Namespace.mudrixKey("space_member_roles")
    val VOICE_CHANNEL = Namespace.mudrixKey("voice_channel")
    val VOICE_MOVE = Namespace.mudrixKey("voice_move")

    val ROOM_STATE = listOf(SPACE_LIST_STYLE, SPACE_BANNER, SPACE_AUTO_JOIN, SPACE_ROLES, SPACE_MEMBER_ROLES, VOICE_CHANNEL)

    /** The current name first, then the one earlier Mudrix versions used */
    fun typeAndLegacy(type: String): List<String> =
        if (type.startsWith(Namespace.MUDRIX + ".")) listOf(type, Namespace.legacyMudrixKey(type.removePrefix(Namespace.MUDRIX + "."))) else listOf(type)
}

/** What one room holds of the Mudrix state types: (type, state key, content) as the core hands them over */
class MudrixRoomState(private val entries: List<Entry>) {
    data class Entry(val type: String, val stateKey: String, val content: JsonElement)

    /** The content under [type] (or its legacy name) and [stateKey] */
    fun get(type: String, stateKey: String = ""): JsonObject? {
        for (name in MudrixTypes.typeAndLegacy(type)) {
            val found = entries.firstOrNull { it.type == name && it.stateKey == stateKey }?.content
            if (found is JsonObject) return found
        }
        return null
    }

    /** Every state key's content under [type]; a key set under both names counts once, the current name first */
    fun all(type: String): List<Pair<String, JsonObject>> {
        val out = LinkedHashMap<String, JsonObject>()
        for (name in MudrixTypes.typeAndLegacy(type)) {
            for (entry in entries) {
                if (entry.type != name || entry.stateKey in out) continue
                (entry.content as? JsonObject)?.let { out[entry.stateKey] = it }
            }
        }
        return out.toList()
    }

    companion object {
        /** From the core's `stateEventsOfTypes`: lists of `[type, stateKey, content]` */
        fun from(raw: List<List<JsonElement>>): MudrixRoomState = MudrixRoomState(
            raw.mapNotNull { row ->
                val type = (row.getOrNull(0) as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return@mapNotNull null
                val key = (row.getOrNull(1) as? JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
                Entry(type, key, row.getOrNull(2) ?: return@mapNotNull null)
            },
        )

        val EMPTY = MudrixRoomState(emptyList())
    }
}

/**
 * Sliding sync never delivers custom state, so a room's Mudrix state is asked from the server once (`stateEventsOfTypes`,
 * one request for all the types), kept for a minute, asked again when the room's state changes, and updated at once
 * after this device writes. At most four rooms are asked at a time.
 */
class MudrixRoomStates {
    /** Room id to what it holds; replaced as a whole so readers recompose */
    var states by mutableStateOf(mapOf<String, MudrixRoomState>())
        private set

    private class Slot(var at: Long = 0, var loading: Boolean = false)

    private val slots = HashMap<String, Slot>()
    private val queue = ArrayDeque<String>()
    private var running = 0
    private var client: WizardClient? = null
    private var subscription: Subscription? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val fetched = MudrixTypes.ROOM_STATE.flatMap { MudrixTypes.typeAndLegacy(it) }
    private val relevant = fetched.toSet() + "m.room.power_levels"

    fun start(client: WizardClient) {
        stop()
        this.client = client
        subscription = client.watchStateChanges { change -> scope.launch { onStateChange(change) } }
    }

    fun stop() {
        subscription?.cancel()
        subscription = null
        client = null
        slots.clear()
        queue.clear()
        running = 0
        states = emptyMap()
    }

    private fun onStateChange(change: StateChange) {
        if (change.eventType in relevant && change.roomId in slots) ensure(change.roomId, force = true)
    }

    fun state(roomId: String?): MudrixRoomState? = roomId?.let { states[it] }

    /** Asks for a room's state unless it is fresh or already on its way */
    fun ensure(roomId: String, force: Boolean = false) {
        if (client == null) return
        val slot = slots.getOrPut(roomId) { Slot() }
        if (slot.loading || (!force && roomId in states && System.currentTimeMillis() - slot.at < FRESH_MS)) return
        slot.loading = true
        queue.addLast(roomId)
        pump()
    }

    fun ensureAll(roomIds: Collection<String>) = roomIds.forEach { ensure(it) }

    private fun pump() {
        val client = client ?: return
        while (running < MAX_PARALLEL && queue.isNotEmpty()) {
            val roomId = queue.removeFirst()
            running++
            scope.launch {
                val loaded = runCatching { MudrixRoomState.from(client.stateEventsOfTypes(roomId, fetched)) }.getOrNull()
                // A room that cannot be read (left, or the server said no) simply has none of it
                states = states + (roomId to (loaded ?: states[roomId] ?: MudrixRoomState.EMPTY))
                slots[roomId]?.let {
                    it.at = System.currentTimeMillis()
                    it.loading = false
                }
                running--
                pump()
            }
        }
    }

    /** Sets a Mudrix state event under its current name and shows the change at once */
    suspend fun set(client: WizardClient, roomId: String, type: String, content: JsonObject, stateKey: String = "") {
        client.setStateEvent(roomId, type, stateKey, content)
        val current = states[roomId]
        val kept = MudrixTypes.ROOM_STATE.flatMap { other ->
            current?.all(other).orEmpty()
                .filter { (key, _) -> !(other == type && key == stateKey) }
                .map { (key, value) -> MudrixRoomState.Entry(other, key, value) }
        }
        states = states + (roomId to MudrixRoomState(kept + MudrixRoomState.Entry(type, stateKey, content)))
        slots.getOrPut(roomId) { Slot() }.at = System.currentTimeMillis()
    }

    /** Keeps the rooms on screen current while [roomIds] returns them (every minute, like the web) */
    suspend fun keepFresh(roomIds: () -> Collection<String>) {
        while (true) {
            ensureAll(roomIds())
            delay(FRESH_MS)
        }
    }

    companion object {
        const val FRESH_MS = 60_000L
        const val MAX_PARALLEL = 4
        val shared = MudrixRoomStates()
    }
}

