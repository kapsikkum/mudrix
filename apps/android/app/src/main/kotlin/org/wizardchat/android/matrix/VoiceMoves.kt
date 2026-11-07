package org.wizardchat.android.matrix

import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.rtc.Sounds
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.RoomEvent
import org.wizardchat.core.SpaceNode
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

/**
 * Call membership belongs to the person who joined, so nobody else can move them. Someone who manages a space asks
 * instead: the request is an `io.github.kapsikkum.mudrix.voice_move` room event (also sent as `chat.mudrix.voice_move`)
 * in the voice channel the person is in, and their own client checks it and joins the other channel. Same rules as the
 * web's `voiceMove.ts` and `useVoiceMoves.ts`.
 */
object VoiceMoves {
    /** Requests older than this are ignored, so a move is never replayed after a restart */
    const val MAX_AGE_MS = 60_000L

    /** How far ahead of this device's clock a request may be dated before it is ignored */
    const val MAX_CLOCK_SKEW_MS = 30_000L
    private const val MAX_REMEMBERED = 200

    private var subscription: Subscription? = null
    private var scope: CoroutineScope? = null
    private val seen = LinkedHashSet<String>()

    /** Asks [userId], who is in [fromRoomId], to join [toRoomId] (the sender must manage a space containing both) */
    suspend fun request(client: WizardClient, fromRoomId: String, userId: String, toRoomId: String) {
        val content = JsonObject(
            mapOf(
                "user_id" to JsonPrimitive(userId),
                "to_room_id" to JsonPrimitive(toRoomId),
                "move_id" to JsonPrimitive(UUID.randomUUID().toString()),
            ),
        )
        client.sendEvent(fromRoomId, MudrixTypes.VOICE_MOVE, content)
        // Clients that have not updated only listen for the old name
        runCatching { client.sendEvent(fromRoomId, MudrixTypes.typeAndLegacy(MudrixTypes.VOICE_MOVE)[1], content) }
    }

    fun start(client: WizardClient, calls: CallManager, session: MatrixSession, roomList: RoomListModel) {
        stop()
        val me = client.userId ?: return
        val own = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        scope = own
        subscription = client.watchRoomEvents(MudrixTypes.typeAndLegacy(MudrixTypes.VOICE_MOVE)) { event ->
            own.launch { handle(client, calls, session, roomList, me, event) }
        }
    }

    fun stop() {
        subscription?.cancel()
        subscription = null
        scope?.cancel()
        scope = null
        seen.clear()
    }

    private suspend fun handle(client: WizardClient, calls: CallManager, session: MatrixSession, roomList: RoomListModel, me: String, event: RoomEvent) {
        val request = event.content as? JsonObject ?: return
        // One move arrives under both type names; it is acted on once
        val key = (request["move_id"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { "m:$it" } ?: event.eventId
        if (!seen.add(key)) return
        if (seen.size > MAX_REMEMBERED) seen.remove(seen.first())
        val to = (request["to_room_id"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return
        if ((request["user_id"] as? JsonPrimitive)?.takeIf { it.isString }?.content != me) return
        if (!isFresh(event.originServerTs, System.currentTimeMillis())) return
        if (!WizardApplication.instance.prefs.allowVoiceMoves || !calls.isInCall(event.roomId)) return

        val target = roomList.room(to) ?: return
        if (target.isInvite || !(target.isVoice || isFlaggedVoice(client, to))) return
        if (!mayMoveBetween(client, roomList.graph, event.sender, event.roomId, to)) return
        // Still in the same call after the checks
        if (!calls.isInCall(event.roomId)) return
        val by = runCatching { client.members(event.roomId) }.getOrNull()?.firstOrNull { it.userId == event.sender }?.displayName ?: event.sender
        CopyToast.show(L10n.format("voice.movedBy", target.displayName, by))
        Sounds.play(SoundKind.Moved)
        calls.launchJoin(target, session, intent = "audio")
    }

    /** Neither stale nor dated in the future: a forged far-future timestamp would otherwise outlive the freshness window */
    fun isFresh(originServerTs: Long, now: Long): Boolean {
        if (originServerTs == 0L) return false
        val age = now - originServerTs
        return age <= MAX_AGE_MS && age >= -MAX_CLOCK_SKEW_MS
    }

    private suspend fun isFlaggedVoice(client: WizardClient, roomId: String): Boolean =
        runCatching {
            SpaceModern.isVoiceChannelFlagged(
                MudrixRoomState.from(client.stateEventsOfTypes(roomId, MudrixTypes.typeAndLegacy(MudrixTypes.VOICE_CHANNEL))),
            )
        }.getOrDefault(false)

    /**
     * Whether [roomId] agrees that [spaceId] is its parent. A child link alone is one-sided: any admin of a space can list
     * somebody else's room, so the room has to name the space back with an `m.space.parent`, which only people with power
     * in the room can send. A room that predates that still counts when the sender could have set it.
     */
    private suspend fun confirmsParent(client: WizardClient, roomId: String, spaceId: String, senderId: String): Boolean {
        val parent = client.stateEvent(roomId, "m.space.parent", spaceId) as? JsonObject
        if ((parent?.get("via") as? JsonArray)?.isNotEmpty() == true) return true
        val settings = client.localRoomSettings(roomId)
        return SpaceModern.canSendState(settings.powerLevels as? JsonObject, settings.creators.toSet(), senderId, "m.space.parent")
    }

    /** The spaces above [roomId], following only links both sides agree on and only through spaces we are in */
    private suspend fun ancestorSpaces(client: WizardClient, graph: List<SpaceNode>, roomId: String, senderId: String): Set<String> {
        val found = mutableSetOf<String>()
        val queue = ArrayDeque(listOf(roomId))
        while (queue.isNotEmpty()) {
            val child = queue.removeLast()
            for (space in graph) {
                if (space.spaceId in found || space.children.none { it.roomId == child }) continue
                if (runCatching { confirmsParent(client, child, space.spaceId, senderId) }.getOrDefault(false)) {
                    found += space.spaceId
                    queue.addLast(space.spaceId)
                }
            }
        }
        return found
    }

    /** Whether [userId] is in, and manages (can edit the children of), a space that contains both channels */
    suspend fun mayMoveBetween(client: WizardClient, graph: List<SpaceNode>, userId: String, fromRoomId: String, toRoomId: String): Boolean {
        if (fromRoomId == toRoomId) return false
        val above = ancestorSpaces(client, graph, toRoomId, userId)
        for (spaceId in ancestorSpaces(client, graph, fromRoomId, userId)) {
            if (spaceId !in above) continue
            val settings = runCatching { client.localRoomSettings(spaceId) }.getOrNull() ?: continue
            if (!SpaceModern.canSendState(settings.powerLevels as? JsonObject, settings.creators.toSet(), userId, "m.space.child")) continue
            // Power levels outlive membership: someone who left the space no longer manages it
            val members = runCatching { client.members(spaceId) }.getOrDefault(emptyList())
            if (members.any { it.userId == userId && !it.isInvite }) return true
        }
        return false
    }
}
