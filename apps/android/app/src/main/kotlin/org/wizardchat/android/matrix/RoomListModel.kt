package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import org.wizardchat.core.ListDiff
import org.wizardchat.core.NotificationMode
import org.wizardchat.core.RoomSection
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.SpaceSummary
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

val RoomSummary.displayName: String get() = roomDisplayName(isDirect, dmUserName, name, canonicalAlias, id)

/**
 * A DM is named after the other person: the SDK's own name reads "Empty Room (was X)" once they have left.
 */
internal fun roomDisplayName(isDirect: Boolean, dmUserName: String?, name: String?, canonicalAlias: String?, id: String): String =
    (if (isDirect) dmUserName?.takeIf { it.isNotBlank() } else null) ?: name ?: canonicalAlias ?: id

/** Messages that notify under the room's notification setting (as on the web), or 1 when marked unread */
val RoomSummary.unreadCount: Int get() = if (unreadNotifications > 0) unreadNotifications.toInt() else if (markedUnread) 1 else 0
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

    /** Rooms you asked to join and are waiting on; they are not in [joinedRooms] */
    var knockedIds by mutableStateOf(setOf<String>())
        private set
    var mentionRooms by mutableStateOf(listOf<RoomSummary>())
        private set
    var spaces by mutableStateOf(listOf<SpaceSummary>())
        private set
    var allSpaces by mutableStateOf(listOf<SpaceSummary>())
        private set
    private val allSpaceList = mutableListOf<SpaceSummary>()
    var spaceRooms by mutableStateOf(mapOf<String, Set<String>>())
        private set
    var isLoaded by mutableStateOf(false)
        private set
    var sections by mutableStateOf(listOf<RoomSection>())
        private set
    var roomTags by mutableStateOf(mapOf<String, Set<String>>())
        private set
    var favouriteOrder by mutableStateOf(mapOf<String, Double>())
        private set
    var homeOrder by mutableStateOf(listOf<String>())
        private set

    /** The spaces we are in and what they link to (from local state), refreshed shortly after rooms or spaces change */
    var graph by mutableStateOf(listOf<org.wizardchat.core.SpaceNode>())
        private set

    private var rooms = mutableListOf<RoomSummary>()
    private val spaceList = mutableListOf<SpaceSummary>()
    private var subscriptions = listOf<Subscription>()
    private var graphJob: Job? = null

    /** Unread mentions per room as the server counts them, for messages the local counts haven't loaded (see [refreshNotifications]) */
    private var serverMentions = mapOf<String, Int>()
    /** Rooms with unread thread replies, as the server's notifications show them */
    var threadRoomIds by mutableStateOf(setOf<String>())
        private set
    var notificationsLoaded by mutableStateOf(false)
        private set

    // The WizardChat base kept the order under its own name; it is read until the first save writes the Mudrix one
    private var mudrixHomeOrder: List<String>? = null
    private var wizardchatHomeOrder: List<String>? = null

    fun start() {
        scope.launch { refreshNotifications() }
        subscriptions = listOf(
            client.watchRooms(5000) { diffs -> apply(diffs) },
            client.watchRoomSections { sections = it },
            client.watchRoomAccountData("m.tag") { pairs -> applyTags(pairs) },
            client.watchAccountData(HOME_ORDER_EVENT) { content ->
                mudrixHomeOrder = roomIdsOf(content)
                homeOrder = mudrixHomeOrder ?: wizardchatHomeOrder.orEmpty()
            },
            client.watchAccountData(WIZARDCHAT_HOME_ORDER_EVENT) { content ->
                wizardchatHomeOrder = roomIdsOf(content)
                homeOrder = mudrixHomeOrder ?: wizardchatHomeOrder.orEmpty()
            },
            client.watchSpaces { diffs ->
                diffs.forEach { it.applyTo(spaceList) }
                spaces = spaceList.toList()
                refreshGraph()
            },
            client.watchAllSpaces { diffs ->
                diffs.forEach { it.applyTo(allSpaceList) }
                allSpaces = allSpaceList.toList()
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

    private val notificationOverrides = mutableStateMapOf<String, NotificationMode?>()

    fun notificationMode(room: RoomSummary): NotificationMode? =
        if (room.id in notificationOverrides) notificationOverrides[room.id] else room.notificationMode

    suspend fun setNotificationMode(room: RoomSummary, mode: NotificationMode?) {
        val had = room.id in notificationOverrides
        val previous = notificationOverrides[room.id]
        notificationOverrides[room.id] = mode
        runCatching { client.setRoomNotificationMode(room.id, mode) }.onFailure {
            if (had) notificationOverrides[room.id] = previous else notificationOverrides.remove(room.id)
        }
    }

    suspend fun setRead(room: RoomSummary, read: Boolean) {
        if (read) runCatching { client.timeline(room.id).markAsRead() }
        runCatching { client.setMarkedUnread(room.id, !read) }
    }

    suspend fun leave(room: RoomSummary) {
        runCatching { client.leave(room.id) }
    }

    suspend fun markAsRead(rooms: List<RoomSummary>) {
        rooms.forEach { setRead(it, true) }
        refreshNotifications()
    }

    /** Unread mentions in the room: its own count, or the server's when that is higher */
    fun mentionCountOf(room: RoomSummary): Int = maxOf(room.mentionCount, serverMentions[room.id] ?: 0)

    /**
     * Asks the server for its notifications: the unread mentions, and the rooms with unread thread replies. The room
     * counts only see messages loaded since the app started, so older unread ones are found this way.
     */
    suspend fun refreshNotifications() {
        val highlights = runCatching { client.serverNotifications(true, NOTIFICATION_LIMIT) }.getOrNull()
        val all = runCatching { client.serverNotifications(false, NOTIFICATION_LIMIT) }.getOrNull()
        if (highlights != null) {
            serverMentions = highlights.filter { !it.read }.groupingBy { it.roomId }.eachCount()
        }
        if (all != null) {
            threadRoomIds = all.filter { !it.read && it.threadRootId != null }.mapTo(mutableSetOf()) { it.roomId }
        }
        notificationsLoaded = true
        mentionRooms = joinedRooms.filter { mentionCountOf(it) > 0 }
    }

    fun isJoined(roomId: String) = joinedRooms.any { it.id == roomId } || spaces.any { it.id == roomId }

    fun space(id: String): SpaceSummary? = spaces.firstOrNull { it.id == id }

    /** The header of a Modern category room [id]: its name (joined or not), its canonical alias, else [generic] */
    fun categoryHeaderOf(id: String, generic: String): String = categoryHeader(
        name = space(id)?.name ?: allSpaces.firstOrNull { it.id == id }?.name ?: room(id)?.name,
        canonicalAlias = room(id)?.canonicalAlias,
        generic = generic,
    )

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

    fun groups(selection: SidebarSelection): List<RoomGroup> {
        val rooms = rooms(selection)
        if (selection == SidebarSelection.Dms) return listOf(RoomGroup(RoomGroup.Kind.Rooms, rooms))
        val context = sectionContext(selection)
        val favourites = rooms.filter { it.isFavourite }.sortedWith(
            compareBy<RoomSummary, Double?>(nullsLast()) { favouriteOrder[it.id] }.thenBy { it.displayName.lowercase() },
        )
        val bySection = mutableMapOf<String, MutableList<RoomSummary>>()
        var rest = mutableListOf<RoomSummary>()
        val lowPriority = mutableListOf<RoomSummary>()
        for (room in rooms) {
            if (room.isFavourite) continue
            val tag = sectionTag(room.id)
            if (tag != null) bySection.getOrPut(tag) { mutableListOf() }.add(room)
            else if (room.isLowPriority) lowPriority.add(room)
            else rest.add(room)
        }
        if (selection == SidebarSelection.Home && homeOrder.isNotEmpty()) {
            val position = homeOrder.withIndex().associate { it.value to it.index }
            rest = rest.withIndex().sortedWith(
                compareBy<IndexedValue<RoomSummary>, Int?>(nullsLast()) { position[it.value.id] }.thenBy { it.index },
            ).map { it.value }.toMutableList()
        }
        val visible = sections.filter { it.tag in bySection || it.spaceId == context }
        fun block(above: Boolean) = visible.filter { it.aboveRooms == above }
            .map { RoomGroup(RoomGroup.Kind.Section(it), bySection[it.tag].orEmpty()) }
        return buildList {
            if (favourites.isNotEmpty()) add(RoomGroup(RoomGroup.Kind.Favourites, favourites))
            addAll(block(above = true))
            add(RoomGroup(RoomGroup.Kind.Rooms, rest))
            addAll(block(above = false))
            if (lowPriority.isNotEmpty()) add(RoomGroup(RoomGroup.Kind.LowPriority, lowPriority))
        }
    }

    fun sectionContext(selection: SidebarSelection) = (selection as? SidebarSelection.Space)?.id ?: HOME_SPACE

    fun sectionTag(roomId: String): String? {
        val tags = roomTags[roomId] ?: return null
        return sections.firstOrNull { it.tag in tags }?.tag
    }

    suspend fun moveGroup(anchor: String, offset: Int, groups: List<RoomGroup>) {
        val anchors = groups.filter { it.isMovable }.map { it.id }.toMutableList()
        val index = anchors.indexOf(anchor)
        if (index < 0 || index + offset !in anchors.indices) return
        java.util.Collections.swap(anchors, index, index + offset)
        client.setRoomSectionOrder(anchors)
    }

    suspend fun saveFavouriteOrder(roomIds: List<String>) {
        val count = roomIds.size.toDouble()
        val next = favouriteOrder.toMutableMap()
        roomIds.forEachIndexed { index, roomId ->
            val order = (index + 1) / (count + 1)
            if (next[roomId] == order) return@forEachIndexed
            next[roomId] = order
            favouriteOrder = next.toMap()
            runCatching { client.setFavouriteOrder(roomId, order) }
        }
    }

    suspend fun saveHomeOrder(roomIds: List<String>) {
        mudrixHomeOrder = roomIds
        homeOrder = roomIds
        runCatching { client.setAccountData(HOME_ORDER_EVENT, JsonObject(mapOf("rooms" to JsonArray(roomIds.map { JsonPrimitive(it) })))) }
    }

    private fun applyTags(pairs: List<List<JsonElement>>) {
        val tags = mutableMapOf<String, Set<String>>()
        val orders = mutableMapOf<String, Double>()
        for (pair in pairs) {
            val roomId = (pair.getOrNull(0) as? JsonPrimitive)?.content ?: continue
            val names = ((pair.getOrNull(1) as? JsonObject)?.get("tags") as? JsonObject) ?: continue
            tags[roomId] = names.keys
            ((names["m.favourite"] as? JsonObject)?.get("order") as? JsonPrimitive)?.doubleOrNull?.let { orders[roomId] = it }
        }
        roomTags = tags
        favouriteOrder = orders
    }

    private fun apply(diffs: List<ListDiff<RoomSummary>>) {
        diffs.forEach { it.applyTo(rooms) }
        joinedRooms = rooms.filter { !it.isInvite && !it.isKnocked }
        knockedIds = rooms.filter { it.isKnocked && !it.isInvite }.mapTo(mutableSetOf()) { it.id }
        joinedRooms.forEach { room ->
            if (room.id in notificationOverrides && notificationOverrides[room.id] == room.notificationMode) {
                notificationOverrides.remove(room.id)
            }
        }
        invites = rooms.filter { it.isInvite }
        mentionRooms = joinedRooms.filter { mentionCountOf(it) > 0 }
        isLoaded = true
        refreshGraph()
    }

    /** The space graph comes from local state; refresh it shortly after rooms or spaces change */
    fun refreshGraph() {
        graphJob?.cancel()
        graphJob = scope.launch {
            delay(150)
            val graph = runCatching { client.spaceGraph() }.getOrNull() ?: return@launch
            this@RoomListModel.graph = graph
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

data class RoomGroup(val kind: Kind, val rooms: List<RoomSummary>) {
    sealed interface Kind {
        data object Favourites : Kind
        data class Section(val section: RoomSection) : Kind
        data object Rooms : Kind

        /** Rooms tagged `m.lowpriority` that are in no section; always last, not movable */
        data object LowPriority : Kind
    }

    /** Sections and the room list itself can be moved up and down; favourites and low priority stay put */
    val isMovable: Boolean get() = kind != Kind.Favourites && kind != Kind.LowPriority

    val id: String
        get() = when (kind) {
            Kind.Favourites -> "favourites"
            Kind.LowPriority -> "low-priority"
            is Kind.Section -> kind.section.tag
            Kind.Rooms -> ROOMS_ANCHOR
        }
}

const val ROOMS_ANCHOR = "chats"
const val HOME_SPACE = "home-space"
private const val NOTIFICATION_LIMIT = 100L
private val HOME_ORDER_EVENT = Namespace.mudrixKey("home_order")
private val WIZARDCHAT_HOME_ORDER_EVENT = Namespace.wizardchatKey("home_order")

/** The room ids of a home order event; null when there is no such event */
private fun roomIdsOf(content: JsonElement?): List<String>? =
    (content as? JsonObject)?.let { event ->
        (event["rooms"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }.orEmpty()
    }
