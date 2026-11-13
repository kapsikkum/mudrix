package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import org.wizardchat.core.EntryContent
import org.wizardchat.core.StateEventView
import org.wizardchat.core.TimelineEntry

/** One line of a room's audit log: who did what, and the values the action's text needs */
data class AuditEntry(
    val id: String,
    val ts: Long,
    val category: Category,
    val actor: String,
    /** Key below `room.settings.auditLog.action.` */
    val action: String,
    val values: Map<String, String> = emptyMap(),
) {
    enum class Category { members, permissions, settings, rooms, roles }
}

/** Turns the membership and state changes of a timeline (and a room's role state) into the web's audit log lines */
object AuditLog {
    /** A change the timeline hands over, as the audit log needs it */
    data class Change(val id: String, val ts: Long, val sender: String, val senderName: String?, val content: EntryContent)

    private class Part(val category: AuditEntry.Category, val action: String, val values: Map<String, String> = emptyMap())

    /** The membership change codes of the core, as audit actions */
    private val MEMBERSHIP_ACTIONS = mapOf(
        "Joined" to "joined",
        "InvitationAccepted" to "joined",
        "Left" to "left",
        "Invited" to "invited",
        "KnockAccepted" to "invited",
        "Banned" to "banned",
        "KickedAndBanned" to "banned",
        "Unbanned" to "unbanned",
        "Kicked" to "kicked",
        "InvitationRejected" to "inviteDeclined",
        "InvitationRevoked" to "inviteRevoked",
        "Knocked" to "knocked",
        "KnockRetracted" to "knockCancelled",
        "KnockDenied" to "knockDenied",
    )

    private val ROLES_TYPES = MudrixTypes.typeAndLegacy(MudrixTypes.SPACE_ROLES).toSet()
    private val MEMBER_ROLES_TYPES = MudrixTypes.typeAndLegacy(MudrixTypes.SPACE_MEMBER_ROLES).toSet()

    /** The changes in [items] worth an audit line, in timeline order */
    fun changes(items: List<TimelineEntry>): List<Change> = items.mapNotNull { item ->
        val event = item as? TimelineEntry.Event ?: return@mapNotNull null
        when (event.content) {
            is EntryContent.Membership, is EntryContent.State ->
                Change(event.id, event.timestamp, event.sender, event.senderName, event.content)
            else -> null
        }
    }

    /** Every audit line of the room, newest first */
    fun entries(changes: List<Change>, roomName: (String) -> String): List<AuditEntry> =
        changes
            .flatMap { change -> parts(change, roomName).mapIndexed { index, part -> entry(change, part, index) } }
            .sortedByDescending { it.ts }

    /** The lines the room's role state events stand for: the list of roles, or one person's roles */
    fun roleEntries(events: List<StateEventView>): List<AuditEntry> = events.mapNotNull { event ->
        val action = when (event.type) {
            in ROLES_TYPES -> "rolesChanged"
            in MEMBER_ROLES_TYPES -> "memberRolesChanged"
            else -> return@mapNotNull null
        }
        val values = if (action == "memberRolesChanged") mapOf("target" to nameOf(event.stateKey)) else emptyMap()
        AuditEntry(event.eventId ?: "${event.type}:${event.stateKey}", event.originServerTs, AuditEntry.Category.roles, nameOf(event.sender), action, values)
    }

    /** The `room.settings.members.` key of a power level, or null for a number with no name */
    fun levelKey(level: Double): String? = when {
        level >= 100 -> "admin"
        level >= 50 -> "moderator"
        level <= 0 -> "member"
        else -> null
    }

    /** The user ID as they are named in the log (`@alice:example.org` to `alice`) */
    fun nameOf(userId: String): String {
        val bare = userId.removePrefix("@")
        val at = bare.indexOf(':')
        return (if (at < 0) bare else bare.substring(0, at)).ifEmpty { userId }
    }

    private fun actorOf(change: Change): String =
        change.senderName?.takeIf { it.isNotBlank() } ?: nameOf(change.sender)

    private fun entry(change: Change, part: Part, index: Int) =
        AuditEntry("${change.id}:$index", change.ts, part.category, actorOf(change), part.action, part.values)

    private fun parts(change: Change, roomName: (String) -> String): List<Part> = when (val content = change.content) {
        is EntryContent.Membership -> {
            val action = content.change?.let { MEMBERSHIP_ACTIONS[it] } ?: return emptyList()
            val target = content.displayName?.takeIf { it.isNotBlank() } ?: nameOf(content.userId)
            listOf(Part(AuditEntry.Category.members, action, mapOf("target" to target)))
        }
        is EntryContent.State -> stateParts(content, roomName)
        else -> emptyList()
    }

    private fun objectOf(value: JsonElement?): JsonObject? = value as? JsonObject

    private fun stateParts(content: EntryContent.State, roomName: (String) -> String): List<Part> {
        val body = objectOf(content.content) ?: JsonObject(emptyMap())
        val previous = objectOf(content.prevContent)
        fun single(category: AuditEntry.Category, action: String, values: Map<String, String> = emptyMap()) =
            listOf(Part(category, action, values))
        fun string(key: String, from: JsonObject? = body): String? =
            (from?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
        return when (content.eventType) {
            "m.room.power_levels" -> powerParts(body, previous)
            "m.room.name" -> if (string("name").isNullOrEmpty()) single(AuditEntry.Category.settings, "nameRemoved")
                else single(AuditEntry.Category.settings, "renamed", mapOf("name" to string("name").orEmpty()))
            "m.room.topic" -> single(AuditEntry.Category.settings, "topicChanged")
            "m.room.avatar" -> single(
                AuditEntry.Category.settings,
                if (string("url").isNullOrEmpty()) "avatarRemoved" else "avatarChanged",
            )
            "m.room.join_rules" -> if (string("join_rule") == string("join_rule", previous)) emptyList()
                else single(AuditEntry.Category.settings, "joinRulesChanged", mapOf("rule" to string("join_rule").orEmpty()))
            "m.room.history_visibility" ->
                if (string("history_visibility") == string("history_visibility", previous)) emptyList()
                else single(AuditEntry.Category.settings, "historyChanged")
            "m.room.encryption" -> single(AuditEntry.Category.settings, "encryptionOn")
            "m.room.canonical_alias" -> single(AuditEntry.Category.settings, "aliasChanged")
            "m.room.tombstone" -> single(AuditEntry.Category.settings, "upgraded")
            "m.space.child" -> {
                val added = ((body["via"] as? kotlinx.serialization.json.JsonArray)?.isNotEmpty() == true)
                val wasThere = previous?.let { (it["via"] as? kotlinx.serialization.json.JsonArray)?.isNotEmpty() }
                // A suggested or order tweak is not worth a line
                if (wasThere == added) emptyList()
                else single(
                    AuditEntry.Category.rooms,
                    if (added) "roomAdded" else "roomRemoved",
                    mapOf("room" to roomName(content.stateKey)),
                )
            }
            else -> emptyList()
        }
    }

    private fun usersOf(content: JsonObject?): Map<String, Double> =
        objectOf(content?.get("users"))?.mapNotNull { (userId, value) ->
            ((value as? JsonPrimitive)?.doubleOrNull)?.let { userId to it }
        }?.toMap().orEmpty()

    private fun powerParts(content: JsonObject, previous: JsonObject?): List<Part> {
        if (previous == null) return listOf(Part(AuditEntry.Category.permissions, "permissionsChanged"))
        val out = mutableListOf<Part>()
        val now = usersOf(content)
        val before = usersOf(previous)
        for (userId in now.keys + before.keys) {
            val from = before[userId] ?: 0.0
            val to = now[userId] ?: 0.0
            if (from == to) continue
            out += Part(
                AuditEntry.Category.permissions,
                "powerChanged",
                mapOf("target" to nameOf(userId), "from" to levelText(from), "to" to levelText(to)),
            )
        }
        // Something other than a person's level changed (who may do what)
        if (JsonObject(content - "users").toString() != JsonObject(previous - "users").toString()) {
            out += Part(AuditEntry.Category.permissions, "permissionsChanged")
        }
        return out
    }

    private fun levelText(level: Double) = if (level == level.toLong().toDouble()) level.toLong().toString() else level.toString()
}
