package org.wizardchat.android.matrix

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.core.EntryContent
import org.wizardchat.core.StateEventView

class AuditLogTest {
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)

    private fun state(eventType: String, content: String, previous: String? = null, key: String = "") =
        AuditLog.Change("e1", 1_000, "@alice:example.org", null, EntryContent.State(eventType, key, json(content), previous?.let(::json)))

    private fun roomName(id: String) = "room $id"

    @Test
    fun `membership changes become member lines`() {
        val changes = listOf(
            AuditLog.Change("e1", 10, "@alice:example.org", "Alice", EntryContent.Membership("@bob:example.org", "Bob", "Invited")),
            AuditLog.Change("e2", 20, "@bob:example.org", null, EntryContent.Membership("@bob:example.org", null, "Joined")),
            AuditLog.Change("e3", 30, "@alice:example.org", null, EntryContent.Membership("@bob:example.org", null, "Ignored")),
        )
        val entries = AuditLog.entries(changes, ::roomName)
        assertEquals(listOf("joined", "invited"), entries.map { it.action })
        assertEquals(listOf("bob", "Alice"), entries.map { it.actor })
        assertEquals("Bob", entries.last().values["target"])
        assertEquals(AuditEntry.Category.members, entries.first().category)
    }

    @Test
    fun `name, topic and picture changes become settings lines`() {
        val entries = AuditLog.entries(
            listOf(
                state("m.room.name", """{"name":"New"}"""),
                state("m.room.name", """{}"""),
                state("m.room.topic", """{"topic":"Hi"}"""),
                state("m.room.avatar", """{"url":"mxc://x/y"}"""),
                state("m.room.avatar", """{}"""),
            ),
            ::roomName,
        )
        assertEquals(listOf("renamed", "nameRemoved", "topicChanged", "avatarChanged", "avatarRemoved"), entries.map { it.action })
        assertEquals("New", entries.first().values["name"])
        assertEquals(AuditEntry.Category.settings, entries.first().category)
    }

    @Test
    fun `unchanged join rules and history visibility are left out, changed ones are not`() {
        val entries = AuditLog.entries(
            listOf(
                state("m.room.join_rules", """{"join_rule":"public"}""", """{"join_rule":"public"}"""),
                state("m.room.join_rules", """{"join_rule":"knock"}""", """{"join_rule":"public"}"""),
                state("m.room.history_visibility", """{"history_visibility":"shared"}""", """{"history_visibility":"shared"}"""),
                state("m.room.history_visibility", """{"history_visibility":"invited"}""", """{"history_visibility":"shared"}"""),
            ),
            ::roomName,
        )
        assertEquals(listOf("joinRulesChanged", "historyChanged"), entries.map { it.action })
        assertEquals("knock", entries.first().values["rule"])
    }

    @Test
    fun `a space child is a room line only when it is added or removed`() {
        val entries = AuditLog.entries(
            listOf(
                state("m.space.child", """{"via":["example.org"],"order":"0010"}""", key = "!one:x"),
                state("m.space.child", """{"via":["example.org"],"order":"0020"}""", """{"via":["example.org"],"order":"0010"}""", key = "!one:x"),
                state("m.space.child", """{}""", """{"via":["example.org"]}""", key = "!two:x"),
            ),
            ::roomName,
        )
        assertEquals(listOf("roomAdded", "roomRemoved"), entries.map { it.action })
        assertEquals("room !one:x", entries.first().values["room"])
        assertEquals(AuditEntry.Category.rooms, entries.first().category)
    }

    @Test
    fun `power level changes name each person whose level moved and what they may now do`() {
        val entries = AuditLog.entries(
            listOf(
                state(
                    "m.room.power_levels",
                    """{"users":{"@bob:x":50,"@carl:x":0},"events":{"m.room.name":50}}""",
                    """{"users":{"@bob:x":0,"@carl:x":0},"events":{"m.room.name":50}}""",
                ),
            ),
            ::roomName,
        )
        assertEquals(listOf("powerChanged"), entries.map { it.action })
        assertEquals(mapOf("target" to "bob", "from" to "0", "to" to "50"), entries.single().values)
        assertEquals(AuditEntry.Category.permissions, entries.single().category)
    }

    @Test
    fun `a change to what a level may do is a permissions line`() {
        val entries = AuditLog.entries(
            listOf(
                state(
                    "m.room.power_levels",
                    """{"users":{},"events":{"m.room.name":50}}""",
                    """{"users":{},"events":{"m.room.name":100}}""",
                ),
            ),
            ::roomName,
        )
        assertEquals(listOf("permissionsChanged"), entries.map { it.action })
    }

    @Test
    fun `role state events become role lines`() {
        val roles = StateEventView("!a:x", MudrixTypes.SPACE_ROLES, "", "@alice:x", json("{}"), "ev1", 5)
        val memberRoles = StateEventView(
            "!a:x",
            Namespace.legacyMudrixKey("space_member_roles"),
            "@bob:x",
            "@alice:x",
            json("{}"),
            "ev2",
            6,
        )
        val entries = AuditLog.roleEntries(listOf(roles, memberRoles))
        assertEquals(listOf("rolesChanged", "memberRolesChanged"), entries.map { it.action })
        assertEquals("bob", entries.last().values["target"])
        assertEquals("alice", entries.last().actor)
        assertEquals(AuditEntry.Category.roles, entries.last().category)
    }

    @Test
    fun `lines are newest first`() {
        val entries = AuditLog.entries(
            listOf(
                state("m.room.topic", """{"topic":"a"}""").copy(ts = 1),
                state("m.room.topic", """{"topic":"b"}""").copy(ts = 9),
            ),
            ::roomName,
        )
        assertEquals(listOf(9L, 1L), entries.map { it.ts })
    }

    @Test
    fun `power levels have a name only where one is known`() {
        assertEquals("admin", AuditLog.levelKey(100.0))
        assertEquals("moderator", AuditLog.levelKey(50.0))
        assertEquals("member", AuditLog.levelKey(0.0))
        assertNull(AuditLog.levelKey(25.0))
        assertTrue(AuditLog.nameOf("@bob:example.org") == "bob")
    }
}
