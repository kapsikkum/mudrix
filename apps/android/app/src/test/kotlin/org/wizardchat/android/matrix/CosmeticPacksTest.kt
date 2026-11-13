package org.wizardchat.android.matrix

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CosmeticPacksTest {
    private fun json(text: String) = Json.parseToJsonElement(text) as JsonObject

    private fun mxc(id: String) = "mxc://example.org/$id"

    private fun nameplatePack() =
        """{"pack":{"display_name":"Plates","usage":["nameplate"]},
            "images":{"sunset":{"url":"${mxc("sunset")}","body":"Sunset","info":{"palette":"berry"}},
                      "aurora":{"url":"${mxc("aurora")}"}}}"""

    @Test
    fun anEmojiPackHasNoCosmeticItems() {
        val pack = CosmeticPacks.parsePack(
            "!r:example.org",
            "p",
            listOf(json("""{"pack":{"display_name":"Emoji","usage":["emoticon","sticker"]},"images":{"a":{"url":"${mxc("a")}"}}}""")),
        )
        assertNull(pack)
    }

    @Test
    fun itemsTakeTheirUsageFromTheImageElseFromThePack() {
        val pack = CosmeticPacks.parsePack(
            "!r:example.org",
            "p",
            listOf(
                json(
                    """{"pack":{"display_name":"Mixed","usage":["nameplate"]},"images":{
                        "plate":{"url":"${mxc("plate")}"},
                        "deco":{"url":"${mxc("deco")}","usage":["avatar_decoration"],"body":"Halo"},
                        "emote":{"url":"${mxc("emote")}","usage":["emoticon"]}}}""",
                ),
            ),
        )
        assertTrue(pack != null)
        assertEquals("Mixed", pack!!.displayName)
        assertEquals(listOf("deco:decoration", "plate:nameplate"), pack.items.map { "${it.shortcode}:${it.kind.name}" }.sorted())
        assertEquals(listOf("Halo"), CosmeticPacks.itemsOfKind(pack, CosmeticKind.decoration).map { it.name })
    }

    @Test
    fun nameplatePalettesAndFramePiecesAreKeptAndUnknownPositionsDropped() {
        val pack = CosmeticPacks.parsePack(
            null,
            "p",
            listOf(
                json(
                    """{"pack":{"display_name":"Frames","usage":["profile_frame"]},"images":{"frame":{"url":"${mxc("frame")}",
                        "info":{"pieces":[{"pos":"top","url":"${mxc("top")}","layer":"back"},
                                           {"pos":"side","url":"${mxc("side")}"},
                                           {"pos":"bottom","url":"https://example.org/x.png"}]}}}}""",
                ),
            ),
        )
        assertTrue(pack != null)
        val frame = pack!!.items.single()
        assertEquals(CosmeticKind.profile_frame, frame.kind)
        assertEquals(listOf(CosmeticPacks.FramePiece("top", mxc("top"), "back")), frame.pieces)
    }

    @Test
    fun onlyMxcImagesBecomeItems() {
        val pack = CosmeticPacks.parsePack(
            null,
            "p",
            listOf(
                json(
                    """{"pack":{"display_name":"Bad","usage":["nameplate"]},"images":{
                        "remote":{"url":"https://example.org/a.png"},"local":{"url":"${mxc("local")}"}}}""",
                ),
            ),
        )
        assertTrue(pack != null)
        assertEquals(listOf("local"), pack!!.items.map { it.shortcode })
    }

    @Test
    fun packsAreParsedPerStateKeyAndEmptyOnesSkipped() {
        val packs = CosmeticPacks.parsePacks(
            "!r:example.org",
            mapOf(
                "plate" to listOf(json(nameplatePack())),
                "empty" to listOf(json("""{"pack":{"usage":["nameplate"]},"images":{}}""")),
            ),
        )
        assertEquals(1, packs.size)
        assertEquals("!r:example.org", packs[0].roomId)
        assertEquals(2, packs[0].items.size)
    }

    @Test
    fun packUsagesMapOntoTheFourKinds() {
        assertEquals(CosmeticKind.decoration, CosmeticPacks.kindOf(listOf("avatar_decoration")))
        assertEquals(CosmeticKind.decoration, CosmeticPacks.kindOf(listOf("avatar_frame")))
        assertEquals(CosmeticKind.effect, CosmeticPacks.kindOf(listOf("profile_effect")))
        assertEquals(CosmeticKind.nameplate, CosmeticPacks.kindOf(listOf("nameplate")))
        assertEquals(CosmeticKind.profile_frame, CosmeticPacks.kindOf(listOf("profile_frame")))
        assertNull(CosmeticPacks.kindOf(listOf("emoticon", "sticker")))
        assertEquals(
            listOf(CosmeticKind.decoration, CosmeticKind.effect, CosmeticKind.nameplate, CosmeticKind.profile_frame),
            CosmeticPacks.KINDS,
        )
    }

    @Test
    fun theStoredValueOfAnItemMatchesWhatTheProfileParsersRead() {
        val item = CosmeticPacks.Item("x", "X", mxc("x"), CosmeticKind.decoration)
        fun text(value: String) = Json.parseToJsonElement("\"$value\"")
        assertEquals(text(mxc("x")), CosmeticPacks.valueOf(item))
        assertEquals(
            json("""{"url":"${mxc("x")}","palette":"berry"}"""),
            CosmeticPacks.valueOf(item.copy(kind = CosmeticKind.nameplate, palette = "berry")),
        )
        assertEquals(text(mxc("x")), CosmeticPacks.valueOf(item.copy(kind = CosmeticKind.nameplate)))
        val pieces = listOf(CosmeticPacks.FramePiece("top", mxc("top")))
        assertEquals(
            json("""{"url":"${mxc("x")}","pieces":[{"pos":"top","url":"${mxc("top")}"}]}"""),
            CosmeticPacks.valueOf(item.copy(kind = CosmeticKind.profile_frame, pieces = pieces)),
        )
    }

    @Test
    fun packCosmeticsAreRecognisedInEveryStoredShape() {
        assertTrue(CosmeticPacks.isPackCosmetic(Json.parseToJsonElement(""""${mxc("a")}"""")))
        assertTrue(CosmeticPacks.isPackCosmetic(json("""{"url":"${mxc("a")}","palette":"sky"}""")))
        assertTrue(CosmeticPacks.isPackCosmetic(json("""{"url":"","pieces":[{"pos":"top","url":"${mxc("a")}"}]}""")))
        assertFalse(CosmeticPacks.isPackCosmetic(Json.parseToJsonElement(""""crown"""")))
        assertFalse(CosmeticPacks.isPackCosmetic(json("""{"url":"","pieces":[]}""")))
        assertFalse(CosmeticPacks.isPackCosmetic(null))
    }

    @Test
    fun builtInCosmeticsStayDrawnWithPacksOffAndPackItemsDoNot() {
        val plate = json("""{"url":"${mxc("plate")}","palette":"berry"}""")
        fun resolve(text: String?) = CosmeticPacks.resolve(text?.let(Json::parseToJsonElement), false)
        assertEquals("crown", (resolve("\"crown\"") as JsonElement).toString().trim('"'))
        assertNull(resolve("\"${mxc("deco")}\""))
        assertNull(CosmeticPacks.resolve(plate, false))
        assertNull(CosmeticPacks.resolve(json("""{"url":"","pieces":[{"pos":"top","url":"${mxc("a")}"}]}"""), false))
        assertNull(CosmeticPacks.resolve(null as JsonElement?, false))
        assertEquals(Json.parseToJsonElement(""""${mxc("deco")}""""), CosmeticPacks.resolve(Json.parseToJsonElement(""""${mxc("deco")}""""), true))
        assertEquals(plate, CosmeticPacks.resolve(plate, true))
        assertEquals(Json.parseToJsonElement(""""crown""""), CosmeticPacks.resolve(Json.parseToJsonElement(""""crown""""), true))
    }

    @Test
    fun subscriptionsMergeTheStableAndUnstableAccountData() {
        val merged = CosmeticPacks.mergeSubscriptions(
            listOf(
                json("""{"rooms":{"!a:example.org":{"one":{}}}}"""),
                json("""{"rooms":{"!a:example.org":{"two":{}},"!b:example.org":{"three":{}}}}"""),
            ),
        )
        assertEquals(setOf("!a:example.org", "!b:example.org"), merged.keys)
        assertEquals(setOf("one", "two"), merged["!a:example.org"]!!.keys)
        assertEquals(setOf("three"), merged["!b:example.org"]!!.keys)
        assertEquals(emptyMap<String, Map<String, JsonElement>>(), CosmeticPacks.mergeSubscriptions(listOf(null, null)))
    }

    @Test
    fun onePackCanBeSubscribedAndUnsubscribed() {
        var rooms = CosmeticPacks.withSubscription(emptyMap(), "!a:example.org", "pack", true)
        assertTrue(CosmeticPacks.isSubscribed(rooms, "!a:example.org", "pack"))
        rooms = CosmeticPacks.withSubscription(rooms, "!a:example.org", "pack", false)
        assertFalse(CosmeticPacks.isSubscribed(rooms, "!a:example.org", "pack"))
        assertEquals(emptyMap<String, Map<String, JsonElement>>(), rooms)
    }

    @Test
    fun savingKeepsPacksOfRoomsThisClientCannotRead() {
        val existing = mapOf(
            "!gone:example.org" to mapOf<String, JsonElement>("pack" to JsonObject(emptyMap())),
            "!here:example.org" to mapOf<String, JsonElement>("old" to JsonObject(emptyMap()), "keep" to JsonObject(emptyMap())),
        )
        val rooms = CosmeticPacks.subscriptionRooms(existing, listOf(CosmeticPacks.Ref("!here:example.org", "new"))) {
            it == "!gone:example.org"
        }
        assertEquals(setOf("!gone:example.org", "!here:example.org"), rooms.keys)
        assertEquals(setOf("new"), rooms["!here:example.org"]!!.keys)
        assertEquals(setOf("pack"), rooms["!gone:example.org"]!!.keys)
        assertNull(CosmeticPacks.subscriptionRooms(emptyMap(), emptyList()) { true }["!gone:example.org"])
    }

    @Test
    fun everySubscribedPackCanBeListedBack() {
        val refs = CosmeticPacks.subscribedRefs(
            mapOf(
                "!a:example.org" to mapOf<String, JsonElement>("one" to JsonObject(emptyMap()), "two" to JsonObject(emptyMap())),
                "!b:example.org" to mapOf<String, JsonElement>("three" to JsonObject(emptyMap())),
            ),
        )
        assertEquals(
            listOf("!a:example.org/one", "!a:example.org/two", "!b:example.org/three"),
            refs.map { "${it.roomId}/${it.stateKey}" }.sorted(),
        )
    }
}
