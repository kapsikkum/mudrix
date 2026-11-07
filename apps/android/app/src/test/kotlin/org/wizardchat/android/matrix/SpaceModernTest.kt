package org.wizardchat.android.matrix

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.core.SpaceLink
import org.wizardchat.core.SpaceNode

class SpaceModernTest {
    private fun json(text: String) = Json.parseToJsonElement(text) as JsonObject

    private fun state(vararg entries: Triple<String, String, String>) = MudrixRoomState(
        entries.map { (type, key, content) -> MudrixRoomState.Entry(type, key, Json.parseToJsonElement(content)) },
    )

    private fun link(id: String, order: String? = null, timestamp: Long = 0) = SpaceLink(id, order, false, timestamp, emptyList())

    @Test
    fun `state is read under the current name first and the legacy name as a fallback`() {
        val current = MudrixTypes.SPACE_LIST_STYLE
        val legacy = Namespace.legacyMudrixKey("space_list_style")
        assertEquals(RoomListStyle.modern, SpaceModern.styleOf(state(Triple(legacy, "", """{"style":"modern"}"""))))
        assertEquals(RoomListStyle.matrix, SpaceModern.styleOf(state(Triple(current, "", """{"style":"matrix"}"""), Triple(legacy, "", """{"style":"modern"}"""))))
        assertEquals(RoomListStyle.matrix, SpaceModern.styleOf(null))
        assertEquals(RoomListStyle.matrix, SpaceModern.styleOf(state(Triple(current, "", """{"style":"fancy"}"""))))
    }

    @Test
    fun `legacy and current keys count once with the current one winning`() {
        val type = MudrixTypes.SPACE_MEMBER_ROLES
        val s = state(
            Triple(Namespace.legacyMudrixKey("space_member_roles"), "alice:x", """{"roles":["old"]}"""),
            Triple(type, "alice:x", """{"roles":["new"]}"""),
            Triple(Namespace.legacyMudrixKey("space_member_roles"), "bob:x", """{"roles":["b"]}"""),
        )
        val all = s.all(type)
        assertEquals(listOf("alice:x", "bob:x"), all.map { it.first })
        assertEquals("""{"roles":["new"]}""", all[0].second.toString())
    }

    @Test
    fun `banner needs an address or a known preset`() {
        val type = MudrixTypes.SPACE_BANNER
        assertEquals(SpaceModern.Banner("mxc://x/y", null), SpaceModern.bannerOf(state(Triple(type, "", """{"url":"mxc://x/y"}"""))))
        assertEquals(SpaceModern.Banner(null, "teal"), SpaceModern.bannerOf(state(Triple(type, "", """{"color":"teal"}"""))))
        assertNull(SpaceModern.bannerOf(state(Triple(type, "", """{"color":"magenta"}"""))))
        assertNull(SpaceModern.bannerOf(state(Triple(type, "", """{"url":""}"""))))
    }

    @Test
    fun `auto join is only explicit when set`() {
        val type = MudrixTypes.SPACE_AUTO_JOIN
        assertEquals(true, SpaceModern.explicitAutoJoinOf(state(Triple(type, "", """{"enabled":true}"""))))
        assertEquals(false, SpaceModern.explicitAutoJoinOf(state(Triple(type, "", """{"enabled":false}"""))))
        assertNull(SpaceModern.explicitAutoJoinOf(state(Triple(type, "", """{"enabled":"yes"}"""))))
        assertNull(SpaceModern.explicitAutoJoinOf(null))
    }

    @Test
    fun `voice channels are flagged only with enabled true`() {
        val type = MudrixTypes.VOICE_CHANNEL
        assertTrue(SpaceModern.isVoiceChannelFlagged(state(Triple(type, "", """{"enabled":true}"""))))
        assertFalse(SpaceModern.isVoiceChannelFlagged(state(Triple(type, "", """{"enabled":"true"}"""))))
        assertFalse(SpaceModern.isVoiceChannelFlagged(null))
    }

    @Test
    fun `children are ordered by a valid order, then by link age, then by id`() {
        val node = SpaceNode("!s", listOf(link("!late", null, 1), link("!b", "b"), link("!a", "a"), link("!bad", "\u0007x"), link("!early", null, 0), link("!a2", "a", 0)))
        // "a" ties are broken by timestamp then id; links without a valid order come last, oldest first
        assertEquals(listOf("!a", "!a2", "!b", "!bad", "!early", "!late"), SpaceModern.orderedChildren(node).map { it.roomId })
    }

    @Test
    fun `categories are the sub-spaces with the space's own rooms first`() {
        val graph = listOf(
            SpaceNode("!top", listOf(link("!general", "1"), link("!cat1", "2"), link("!cat2", "3"), link("!away", "4"))),
            SpaceNode("!cat1", listOf(link("!c1a", "1"), link("!inner", "2"))),
            SpaceNode("!cat2", emptyList()),
            SpaceNode("!inner", listOf(link("!deep", "1"))),
        )
        val categories = SpaceModern.categories(graph, "!top")
        assertEquals(
            listOf(
                SpaceModern.Category(null, listOf("!general", "!away"), 0),
                SpaceModern.Category("!cat1", listOf("!c1a"), 1),
                SpaceModern.Category("!inner", listOf("!deep"), 2),
                SpaceModern.Category("!cat2", emptyList(), 1),
            ),
            categories,
        )
    }

    @Test
    fun `the root space follows the first parent upward`() {
        val graph = listOf(SpaceNode("!top", listOf(link("!mid"))), SpaceNode("!mid", listOf(link("!leaf"))), SpaceNode("!leaf", emptyList()))
        assertEquals("!top", SpaceModern.rootSpaceOf(graph, "!leaf"))
        assertEquals("!top", SpaceModern.rootSpaceOf(graph, "!top"))
        assertEquals(listOf("!mid", "!top"), SpaceModern.rolesChainOf(graph, "!mid"))
    }

    @Test
    fun `voice channels sit below text channels`() {
        assertEquals(listOf("a", "c", "b", "d"), SpaceModern.arrange(listOf("a", "b", "c", "d")) { it == "b" || it == "d" })
    }

    private val powerLevels = json("""{"state_default":50,"events":{"${MudrixTypes.SPACE_ROLES}":50}}""")

    private fun rolesState() = state(
        Triple(
            MudrixTypes.SPACE_ROLES,
            "",
            """{"roles":[{"id":"mod","name":"  Mods  ","color":"#FF0000","hoist":true},{"id":"BAD ID","name":"x"},{"id":"nocolor","name":"Plain","color":"red"},{"id":"mod","name":"duplicate"}],"builtin":{"100":{"name":"Boss","color":"#00FF00"},"7":{"name":"unknown"},"0":{"color":"nope"}}}""",
        ),
        Triple(MudrixTypes.SPACE_MEMBER_ROLES, "alice:x", """{"roles":["nocolor","mod","gone"]}"""),
    )

    @Test
    fun `roles are validated and ordered`() {
        val roles = SpaceModern.readRoles(rolesState(), powerLevels)
        assertEquals(listOf(SpaceModern.Role("mod", "Mods", "#ff0000", true), SpaceModern.Role("nocolor", "Plain", null, false)), roles.roles)
        assertEquals(mapOf(SpaceModern.Builtin.Admin to SpaceModern.BuiltinLook("Boss", "#00ff00")), roles.builtin)
        assertEquals(listOf("mod", "nocolor"), roles.byUser["@alice:x"]?.map { it.id })
    }

    @Test
    fun `roles are ignored when setting them takes less than level 50`() {
        assertTrue(SpaceModern.readRoles(rolesState(), json("""{"state_default":0}""")).isEmpty)
        assertTrue(SpaceModern.readRoles(rolesState(), null).isEmpty)
        // Roles are trusted, assignments are not
        val onlyRoles = SpaceModern.readRoles(rolesState(), json("""{"state_default":50,"events":{"${MudrixTypes.SPACE_MEMBER_ROLES}":10}}"""))
        assertEquals(2, onlyRoles.roles.size)
        assertTrue(onlyRoles.byUser.isEmpty())
    }

    @Test
    fun `a person's colour is the admin look, then their own roles, then the member look`() {
        val roles = SpaceModern.readRoles(rolesState(), powerLevels)
        assertEquals("#00ff00", SpaceModern.roleColorOf(roles, "@bob:x", SpaceModern.Builtin.Admin))
        assertEquals("#00ff00", SpaceModern.roleColorOf(roles, "@bob:x", SpaceModern.Builtin.Founder))
        assertEquals("#ff0000", SpaceModern.roleColorOf(roles, "@alice:x", SpaceModern.Builtin.Member))
        assertNull(SpaceModern.roleColorOf(roles, "@bob:x", SpaceModern.Builtin.Member))
        assertEquals(SpaceModern.Builtin.Founder, SpaceModern.builtinOf(setOf("@f:x"), "@f:x", 100.0))
        assertEquals(SpaceModern.Builtin.Moderator, SpaceModern.builtinOf(emptySet(), "@m:x", 50.0))
        assertEquals(60.0, SpaceModern.powerLevelOf(json("""{"users":{"@m:x":60},"users_default":5}"""), "@m:x"), 0.0)
        assertEquals(5.0, SpaceModern.powerLevelOf(json("""{"users":{"@m:x":60},"users_default":5}"""), "@n:x"), 0.0)
    }

    @Test
    fun `state rows from the core are read as type, key and content`() {
        val row = listOf<JsonElement>(JsonPrimitive(MudrixTypes.VOICE_CHANNEL), JsonPrimitive(""), json("""{"enabled":true}"""))
        assertTrue(SpaceModern.isVoiceChannelFlagged(MudrixRoomState.from(listOf(row, emptyList<JsonElement>()))))
    }
}
