package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import org.wizardchat.core.SpaceLink
import org.wizardchat.core.SpaceNode

/** How a space's rooms are listed: 'matrix' (an avatar on every room) or 'modern' (plain channel rows, categories, voice channels) */
enum class RoomListStyle { matrix, modern }

/** The pure rules behind the Modern room list: `spaceListStyle.ts`, `spaceBanner.ts`, `spaceAutoJoin.ts`, `voiceChannel.ts`, `modernRoomList.ts` and `spaceOrder.ts` of the web */
object SpaceModern {
    fun styleOf(state: MudrixRoomState?): RoomListStyle =
        if ((state?.get(MudrixTypes.SPACE_LIST_STYLE)?.get("style") as? JsonPrimitive)?.contentOrNull() == "modern") RoomListStyle.modern else RoomListStyle.matrix

    /** The top space [spaceId] is in (itself when it has no parent), following the first parent */
    fun rootSpaceOf(graph: List<SpaceNode>, spaceId: String): String {
        val seen = mutableSetOf(spaceId)
        var current = spaceId
        while (true) {
            val at = current
            val parent = graph.firstOrNull { it.spaceId !in seen && it.children.any { child -> child.roomId == at } } ?: return current
            seen += parent.spaceId
            current = parent.spaceId
        }
    }

    fun parentOf(graph: List<SpaceNode>, roomId: String): String? =
        graph.firstOrNull { node -> node.children.any { it.roomId == roomId } }?.spaceId

    // --- banner ---------------------------------------------------------------------------------

    /** An uploaded image (an mxc:// URL) or one of [BANNER_PRESETS] */
    data class Banner(val url: String? = null, val color: String? = null)

    /** Preset id to the two colours of its gradient, as the web's `SPACE_BANNER_PRESETS` */
    val BANNER_PRESETS: List<Triple<String, Long, Long>> = listOf(
        Triple("pink", 0xFFFF3D9A, 0xFFFF8CC6),
        Triple("red", 0xFFE5231F, 0xFFFF6A5C),
        Triple("orange", 0xFFE8741A, 0xFFFFB066),
        Triple("yellow", 0xFFE6B81F, 0xFFFFF07A),
        Triple("purple", 0xFF6A2A96, 0xFFC37FE0),
        Triple("blue", 0xFF0A84FF, 0xFF66C8FF),
        Triple("teal", 0xFF2FC9AC, 0xFFA3FFF0),
        Triple("green", 0xFF2F5D0A, 0xFF6AA82A),
        Triple("graphite", 0xFF1B1B1F, 0xFF4A4A52),
    )

    fun bannerOf(state: MudrixRoomState?): Banner? {
        val content = state?.get(MudrixTypes.SPACE_BANNER) ?: return null
        val url = (content["url"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
        val color = (content["color"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { id -> BANNER_PRESETS.any { it.first == id } }
        return if (url != null || color != null) Banner(url, color) else null
    }

    // --- auto-join and voice flag ----------------------------------------------------------------

    /** The space's own auto-join setting, or null when it has none and the list style decides */
    fun explicitAutoJoinOf(state: MudrixRoomState?): Boolean? =
        strictBoolean(state?.get(MudrixTypes.SPACE_AUTO_JOIN)?.get("enabled"))

    fun isVoiceChannelFlagged(state: MudrixRoomState?): Boolean =
        strictBoolean(state?.get(MudrixTypes.VOICE_CHANNEL)?.get("enabled")) == true

    // --- ordering and categories ---------------------------------------------------------------

    private fun validOrder(order: String?): String? =
        order?.takeIf { it.length <= 50 && it.all { c -> c.code in 0x20..0x7E } }

    /** A space's children in the order Matrix defines: a valid `order` first (as text), then older links first, then by room id */
    fun orderedChildren(node: SpaceNode): List<SpaceLink> =
        node.children.sortedWith(
            compareBy<SpaceLink, String?>(nullsLast()) { validOrder(it.order) }.thenBy { it.timestamp }.thenBy { it.roomId },
        )

    /** The rooms a Modern space lists under [spaceId] itself (`spaceId` null) or under one of its categories */
    data class Category(val spaceId: String?, val roomIds: List<String>, val depth: Int)

    /**
     * The categories of [spaceId]: its own rooms first (no header), then each sub-space with its rooms, deeper ones after
     * their parent. Only spaces we are in are in the graph, so a sub-space we are not in does not show.
     */
    fun categories(graph: List<SpaceNode>, spaceId: String): List<Category> {
        val byId = graph.associateBy { it.spaceId }
        val top = byId[spaceId] ?: return listOf(Category(null, emptyList(), 0))
        val result = mutableListOf<Category>()
        val seen = mutableSetOf(spaceId)
        fun walk(node: SpaceNode, header: String?, depth: Int) {
            val children = orderedChildren(node)
            result += Category(header, children.filter { it.roomId !in byId }.map { it.roomId }, depth)
            for (child in children) {
                val sub = byId[child.roomId] ?: continue
                if (depth < 3 && seen.add(sub.spaceId)) walk(sub, sub.spaceId, depth + 1)
            }
        }
        walk(top, null, 0)
        return result
    }

    /** Text channels first, voice channels below them; each kind keeps its own order */
    fun <T> arrange(rooms: List<T>, isVoice: (T) -> Boolean): List<T> = rooms.filterNot(isVoice) + rooms.filter(isVoice)

    // --- roles -----------------------------------------------------------------------------------

    const val MAX_ROLES = 50
    const val MAX_ROLES_PER_MEMBER = 20
    const val MAX_ROLE_NAME = 32

    /** Roles only count when they take at least this much power to set, whatever the room allows */
    private const val MIN_WRITER_LEVEL = 50.0

    data class Role(val id: String, val name: String, val color: String? = null, val hoist: Boolean = false)

    /** The roles every Matrix room already has, by power level */
    enum class Builtin(val key: String) { Founder("founder"), Admin("100"), Moderator("50"), Member("0") }

    data class BuiltinLook(val name: String? = null, val color: String? = null)

    data class Roles(
        val builtin: Map<Builtin, BuiltinLook> = emptyMap(),
        val roles: List<Role> = emptyList(),
        /** Roles per person, in the order of [roles] */
        val byUser: Map<String, List<Role>> = emptyMap(),
    ) {
        val isEmpty: Boolean get() = roles.isEmpty() && builtin.isEmpty()
    }

    val NO_ROLES = Roles()

    private val idPattern = Regex("^[a-z0-9_-]{1,24}$")
    private val colorPattern = Regex("^#[0-9a-fA-F]{6}$")
    private val unsafeChars = Regex("[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]")

    fun cleanRoleName(value: String?): String =
        value?.replace(unsafeChars, "")?.replace(Regex("\\s+"), " ")?.trim()?.take(MAX_ROLE_NAME).orEmpty()

    fun isValidRoleColor(value: String?) = value != null && colorPattern.matches(value)

    /** The power level it takes to send this kind of state in the space */
    private fun levelNeeded(powerLevels: JsonObject?, type: String): Double =
        ((powerLevels?.get("events") as? JsonObject)?.get(type) as? JsonPrimitive)?.doubleOrNull
            ?: (powerLevels?.get("state_default") as? JsonPrimitive)?.doubleOrNull
            ?: 50.0

    /** Whether roles of this type can be trusted: only people with real power could have set them */
    fun trusted(powerLevels: JsonObject?, type: String) = powerLevels != null && levelNeeded(powerLevels, type) >= MIN_WRITER_LEVEL

    private fun sanitizeRole(raw: kotlinx.serialization.json.JsonElement): Role? {
        val obj = raw as? JsonObject ?: return null
        val id = (obj["id"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { idPattern.matches(it) } ?: return null
        val name = cleanRoleName((obj["name"] as? JsonPrimitive)?.takeIf { it.isString }?.content).ifEmpty { return null }
        val color = (obj["color"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { isValidRoleColor(it) }?.lowercase()
        val hoist = strictBoolean(obj["hoist"]) == true
        return Role(id, name, color, hoist)
    }

    /** The roles a space's state holds, checked against the space's power levels (null power levels: nothing counts) */
    fun readRoles(state: MudrixRoomState, powerLevels: JsonObject?): Roles {
        if (!trusted(powerLevels, MudrixTypes.SPACE_ROLES)) return NO_ROLES
        val content = state.get(MudrixTypes.SPACE_ROLES)
        val roles = mutableListOf<Role>()
        val seen = mutableSetOf<String>()
        (content?.get("roles") as? JsonArray)?.forEach { raw ->
            if (roles.size >= MAX_ROLES) return@forEach
            val role = sanitizeRole(raw) ?: return@forEach
            if (seen.add(role.id)) roles += role
        }
        val builtin = mutableMapOf<Builtin, BuiltinLook>()
        (content?.get("builtin") as? JsonObject)?.let { raw ->
            for (key in Builtin.entries) {
                val entry = raw[key.key] as? JsonObject ?: continue
                val name = cleanRoleName((entry["name"] as? JsonPrimitive)?.takeIf { it.isString }?.content).ifEmpty { null }
                val color = (entry["color"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { isValidRoleColor(it) }?.lowercase()
                if (name != null || color != null) builtin[key] = BuiltinLook(name, color)
            }
        }
        val byUser = mutableMapOf<String, List<Role>>()
        if (roles.isNotEmpty() && trusted(powerLevels, MudrixTypes.SPACE_MEMBER_ROLES)) {
            val order = roles.withIndex().associate { it.value.id to it.index }
            for ((key, assigned) in state.all(MudrixTypes.SPACE_MEMBER_ROLES)) {
                if (key.isEmpty()) continue
                val ids = assigned["roles"] as? JsonArray ?: continue
                val held = ids.take(MAX_ROLES_PER_MEMBER).mapNotNull { id ->
                    (id as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { order[it] }
                }.toSortedSet()
                if (held.isNotEmpty()) byUser["@$key"] = held.map { roles[it] }
            }
        }
        return Roles(builtin, roles, byUser)
    }

    /** Whether [userId] may send [type] state: room creators always, otherwise by power level (`events[type]`, else `state_default`, else 50) */
    fun canSendState(powerLevels: JsonObject?, creators: Set<String>, userId: String, type: String): Boolean =
        userId in creators || powerLevelOf(powerLevels, userId) >= levelNeeded(powerLevels, type)

    /** A person's assignment is stored under their user id without the leading `@` */
    fun memberStateKey(userId: String) = userId.removePrefix("@")

    /** The spaces from [roomId] upward (itself when it is a space), nearest first; at most six deep */
    fun rolesChainOf(graph: List<SpaceNode>, roomId: String?): List<String> {
        if (roomId == null) return emptyList()
        val chain = mutableListOf<String>()
        var at: String? = if (graph.any { it.spaceId == roomId }) roomId else parentOf(graph, roomId)
        while (at != null && chain.size < 6 && at !in chain) {
            chain += at
            at = parentOf(graph, at)
        }
        return chain
    }

    /** Which built-in role someone is in a room, from their power level */
    fun builtinOf(creators: Set<String>, userId: String, powerLevel: Double): Builtin = when {
        userId in creators -> Builtin.Founder
        powerLevel >= 100 -> Builtin.Admin
        powerLevel >= 50 -> Builtin.Moderator
        else -> Builtin.Member
    }

    /** The power level of [userId] in a room's `m.room.power_levels` content */
    fun powerLevelOf(powerLevels: JsonObject?, userId: String): Double =
        ((powerLevels?.get("users") as? JsonObject)?.get(userId) as? JsonPrimitive)?.doubleOrNull
            ?: (powerLevels?.get("users_default") as? JsonPrimitive)?.doubleOrNull
            ?: 0.0

    /**
     * The colour to show for someone: their Admin or Moderator look first, then their own roles from the top of the
     * list, then the plain Member look. Founders fall back to the Admin look.
     */
    fun roleColorOf(roles: Roles, userId: String, builtin: Builtin = Builtin.Member): String? {
        val high = when (builtin) {
            Builtin.Founder -> roles.builtin[Builtin.Founder]?.color ?: roles.builtin[Builtin.Admin]?.color
            Builtin.Member -> null
            else -> roles.builtin[builtin]?.color
        }
        return high ?: roles.byUser[userId]?.firstOrNull { it.color != null }?.color ?: roles.builtin[Builtin.Member]?.color
    }

    private fun JsonPrimitive.contentOrNull(): String? = if (isString) content else null

    /** A real JSON boolean; the text "true" is not one (the web checks `=== true`) */
    private fun strictBoolean(value: kotlinx.serialization.json.JsonElement?): Boolean? = (value as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
}
