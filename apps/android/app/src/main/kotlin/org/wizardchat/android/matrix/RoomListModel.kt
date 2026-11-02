package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.core.ListDiff
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.SpaceSummary
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

val RoomSummary.displayName: String get() = name ?: canonicalAlias ?: id
val RoomSummary.unreadCount: Int get() = if (markedUnread) maxOf(unreadMessages.toInt(), 1) else unreadMessages.toInt()
val RoomSummary.mentionCount: Int get() = unreadMentions.toInt()

sealed interface SidebarSelection {
    data object Home : SidebarSelection
    data object Dms : SidebarSelection
    data class Space(val id: String) : SidebarSelection
}

data class UnreadState(val unread: Boolean = false, val mention: Boolean = false)

class RoomListModel(val client: WizardClient, private val scope: CoroutineScope) {
    var joinedRooms by mutableStateOf(listOf<RoomSummary>())
        private set
    var invites by mutableStateOf(listOf<RoomSummary>())
        private set
    var mentionRooms by mutableStateOf(listOf<RoomSummary>())
        private set
    var spaces by mutableStateOf(listOf<SpaceSummary>())
        private set
    var spaceRooms by mutableStateOf(mapOf<String, Set<String>>())
        private set
    var isLoaded by mutableStateOf(false)
        private set

    private var rooms = mutableListOf<RoomSummary>()
    private val spaceList = mutableListOf<SpaceSummary>()
    private var subscriptions = listOf<Subscription>()
    private var graphJob: Job? = null

    fun start() {
        subscriptions = listOf(
            client.watchRooms(5000) { diffs -> apply(diffs) },
            client.watchSpaces { diffs ->
                diffs.forEach { it.applyTo(spaceList) }
                spaces = spaceList.toList()
                refreshGraph()
            },
        )
    }

    fun stop() {
        subscriptions.forEach { it.cancel() }
        subscriptions = emptyList()
        graphJob?.cancel()
    }

    fun room(id: String): RoomSummary? = joinedRooms.firstOrNull { it.id == id }

    suspend fun accept(invite: RoomSummary) = client.acceptInvite(invite.id)

    suspend fun decline(invite: RoomSummary) = client.declineInvite(invite.id)

    suspend fun setRead(room: RoomSummary, read: Boolean) {
        if (read) runCatching { client.timeline(room.id).markAsRead() }
        runCatching { client.setMarkedUnread(room.id, !read) }
    }

    suspend fun leave(room: RoomSummary) {
        runCatching { client.leave(room.id) }
    }

    suspend fun markAsRead(rooms: List<RoomSummary>) {
        rooms.forEach { setRead(it, true) }
    }

    fun isJoined(roomId: String) = joinedRooms.any { it.id == roomId } || spaces.any { it.id == roomId }

    fun space(id: String): SpaceSummary? = spaces.firstOrNull { it.id == id }

    fun spaceContaining(roomId: String): SpaceSummary? = spaces.firstOrNull { spaceRooms[it.id]?.contains(roomId) == true }

    fun unreadState(selection: SidebarSelection): UnreadState {
        var state = UnreadState()
        for (room in rooms(selection)) {
            if (room.mentionCount > 0) state = state.copy(mention = true)
            if (room.unreadCount > 0 || room.mentionCount > 0) state = state.copy(unread = true)
        }
        return state
    }

    fun rooms(selection: SidebarSelection): List<RoomSummary> = when (selection) {
        SidebarSelection.Home -> {
            val inSpaces = spaceRooms.values.flatten().toSet()
            joinedRooms.filter { !it.isDirect && it.id !in inSpaces }
        }
        SidebarSelection.Dms -> joinedRooms.filter { it.isDirect }
        is SidebarSelection.Space -> {
            val ids = spaceRooms[selection.id] ?: emptySet()
            joinedRooms.filter { it.id in ids }
        }
    }

    private fun apply(diffs: List<ListDiff<RoomSummary>>) {
        diffs.forEach { it.applyTo(rooms) }
        joinedRooms = rooms.filter { !it.isInvite }
        invites = rooms.filter { it.isInvite }
        mentionRooms = joinedRooms.filter { it.mentionCount > 0 }
        isLoaded = true
        refreshGraph()
    }

    /** The space graph comes from local state; refresh it shortly after rooms or spaces change */
    private fun refreshGraph() {
        graphJob?.cancel()
        graphJob = scope.launch {
            delay(150)
            val graph = runCatching { client.spaceGraph() }.getOrNull() ?: return@launch
            val children = graph.associate { node -> node.spaceId to node.children.map { it.roomId } }
            fun descendants(id: String, seen: MutableSet<String>) {
                for (child in children[id].orEmpty()) if (seen.add(child)) descendants(child, seen)
            }
            spaceRooms = spaces.associate { space ->
                space.id to mutableSetOf<String>().also { descendants(space.id, it) }
            }
        }
    }
}
