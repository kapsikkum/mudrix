package org.wizardchat.android.ui.space

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import kotlinx.serialization.json.JsonObject
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MudrixRoomStates
import org.wizardchat.android.matrix.RoomListStyle
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.core.SpaceNode

/** The graph of the spaces we are in, for screens that do not have the room list */
val LocalSpaceGraph = compositionLocalOf { emptyList<SpaceNode>() }

/** `#rrggbb` as a colour, null when it is not one */
fun parseHexColor(value: String?): Color? {
    if (!SpaceModern.isValidRoleColor(value)) return null
    return Color(0xFF000000L or value!!.substring(1).toLong(16))
}

/** What the roles of the spaces around a room say about the people in it (a name colour, a heading) */
class RoomRoles(
    val roles: SpaceModern.Roles,
    private val powerLevels: JsonObject?,
    private val creators: Set<String>,
) {
    fun builtinOf(userId: String) = SpaceModern.builtinOf(creators, userId, SpaceModern.powerLevelOf(powerLevels, userId))

    /** The colour of [userId]'s name here, or null for the normal one */
    fun colorOf(userId: String): Color? = parseHexColor(SpaceModern.roleColorOf(roles, userId, builtinOf(userId)))

    companion object {
        val NONE = RoomRoles(SpaceModern.NO_ROLES, null, emptySet())
    }
}

/** Provided around a room's timeline, like the web's `RoomRolesProvider` */
val LocalRoomRoles = compositionLocalOf { RoomRoles.NONE }

/**
 * The roles in effect for a room: the nearest space around it (itself, its category, the space above that) that has
 * roles set up. A space that is not Modern has none. Reads the Mudrix state of those spaces and their power levels.
 */
@Composable
fun rememberRoomRoles(roomId: String?): RoomRoles {
    val session = LocalSession.current
    val graph = LocalSpaceGraph.current
    val stores = MudrixRoomStates.shared
    val chain = remember(graph, roomId) { SpaceModern.rolesChainOf(graph, roomId) }
    val root = chain.firstOrNull()?.let { SpaceModern.rootSpaceOf(graph, it) }
    LaunchedEffect(root, chain, session.client) {
        root?.let { stores.ensure(it) }
        chain.forEach { stores.ensure(it) }
    }
    var spaceLevels by remember(chain) { mutableStateOf<Map<String, JsonObject?>>(emptyMap()) }
    LaunchedEffect(chain, session.client) {
        val client = session.client ?: return@LaunchedEffect
        spaceLevels = chain.associateWith { id ->
            (runCatching { client.localRoomSettings(id) }.getOrNull()?.powerLevels as? JsonObject)
        }
    }
    var own by remember(roomId) { mutableStateOf<Pair<JsonObject?, Set<String>>>(null to emptySet()) }
    LaunchedEffect(roomId, session.client, chain.isEmpty()) {
        val client = session.client ?: return@LaunchedEffect
        if (roomId == null || chain.isEmpty()) return@LaunchedEffect
        val settings = runCatching { client.localRoomSettings(roomId) }.getOrNull()
        own = (settings?.powerLevels as? JsonObject) to settings?.creators.orEmpty().toSet()
    }
    val states = stores.states
    return remember(states, chain, root, spaceLevels, own) {
        val modern = root != null && SpaceModern.styleOf(states[root]) == RoomListStyle.modern
        val found = if (!modern) null else chain.firstNotNullOfOrNull { id ->
            states[id]?.let { SpaceModern.readRoles(it, spaceLevels[id]) }?.takeIf { !it.isEmpty }
        }
        if (found == null) RoomRoles.NONE else RoomRoles(found, own.first, own.second)
    }
}
