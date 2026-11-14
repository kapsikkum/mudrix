package org.wizardchat.android.matrix

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The four things a cosmetic pack holds, in the order their subscriptions are listed */
enum class CosmeticKind { decoration, effect, nameplate, profile_frame }

/** The cosmetic packs in rooms and spaces, and the profile values that point into them (`cosmeticPacks.ts`) */
object CosmeticPacks {
    val KINDS = listOf(CosmeticKind.decoration, CosmeticKind.effect, CosmeticKind.nameplate, CosmeticKind.profile_frame)

    /** Pack state events: the unstable name is always written, so both are read and merged by state key */
    val ROOM_PACK_TYPES = listOf("im.ponies.room_emotes", "m.room.image_pack")

    /** The subscription lists, read as a union and both written on every change */
    val SUBSCRIPTION_TYPES = listOf("im.ponies.emote_rooms", "m.image_pack.rooms")

    /** The account's own pack (decorations and effects uploaded on the web) */
    const val USER_PACK = "im.ponies.user_emotes"

    /** `info` key of the image an effect plays once before its loop */
    const val EFFECT_INTRO_INFO = "io.github.kapsikkum.mudrix.effect_intro"

    private const val MXC = "mxc://"
    private const val MAX_VALUE_CHARS = 1024
    private const val MAX_PIECES = 8
    private val FRAME_POSITIONS = setOf("top", "bottom", "center")
    private val DEFAULT_USAGE = listOf("emoticon", "sticker")
    private val DECORATION_USAGE = listOf("avatar_decoration", "profile_decoration", "avatar_frame")

    /** One part of a profile frame: where it sits, and whether it is drawn behind the avatar */
    data class FramePiece(val pos: String, val url: String, val layer: String? = null)

    /** One cosmetic in a pack */
    data class Item(
        val shortcode: String,
        val name: String,
        val url: String,
        val kind: CosmeticKind,
        val palette: String? = null,
        val pieces: List<FramePiece> = emptyList(),
        /** The one-shot image a pack effect opens with, as `mxc://` */
        val intro: String? = null,
    )

    /** A pack as found in a room, a space or the account's own uploads (`roomId` is null for those) */
    data class Pack(
        val roomId: String?,
        val stateKey: String,
        val displayName: String,
        val attribution: String?,
        val items: List<Item>,
    )

    /** A stored cosmetic value: the id of shipped art, or media fetched with the viewer's login */
    sealed interface Value {
        data class Id(val id: String) : Value

        data class Media(val url: String, val palette: String? = null, val pieces: List<FramePiece> = emptyList()) : Value
    }

    /** A pack a subscription points at */
    data class Ref(val roomId: String, val stateKey: String)

    /** Which kind a pack usage list asks for; anything else is an emoji or sticker pack */
    fun kindOf(usage: List<String>): CosmeticKind? = when {
        "profile_frame" in usage -> CosmeticKind.profile_frame
        "nameplate" in usage -> CosmeticKind.nameplate
        "profile_effect" in usage -> CosmeticKind.effect
        DECORATION_USAGE.any { it in usage } -> CosmeticKind.decoration
        else -> null
    }

    fun itemsOfKind(pack: Pack, kind: CosmeticKind): List<Item> = pack.items.filter { it.kind == kind }

    /** The pack in one state key, or null when it holds no cosmetic (an emoji pack, or nothing at all) */
    fun parsePack(roomId: String?, stateKey: String, contents: List<JsonObject?>): Pack? {
        if (contents.none(::isMeaningful)) return null
        val info = PackInfo.merge(contents)
        val packUsage = info.usage.orEmpty().takeIf { it.isNotEmpty() } ?: DEFAULT_USAGE
        val items = imageMap(contents).mapNotNull { (shortcode, image) -> itemOf(shortcode, image, packUsage) }
        if (items.isEmpty()) return null
        return Pack(roomId, stateKey, info.displayName ?: stateKey, info.attribution, items)
    }

    /** Every pack a room's state keys hold */
    fun parsePacks(roomId: String, byStateKey: Map<String, List<JsonObject>>): List<Pack> =
        byStateKey.mapNotNull { (stateKey, contents) -> parsePack(roomId, stateKey, contents) }

    /** Groups the `[type, stateKey, content]` triples `stateEventsOfTypes` returns, the unstable event first */
    fun groupByStateKey(events: List<List<JsonElement>>): Map<String, List<JsonObject>> {
        val byStateKey = LinkedHashMap<String, MutableList<Pair<Int, JsonObject>>>()
        for (event in events) {
            val type = event.getOrNull(0).string()
            val stateKey = event.getOrNull(1).string() ?: continue
            val content = event.getOrNull(2) as? JsonObject ?: continue
            val order = type?.let { ROOM_PACK_TYPES.indexOf(it) }?.takeIf { it >= 0 } ?: ROOM_PACK_TYPES.size
            byStateKey.getOrPut(stateKey) { mutableListOf() }.add(order to content)
        }
        return byStateKey.mapValues { (_, contents) -> contents.sortedBy { it.first }.map { it.second } }
    }

    /** The profile value of a pack item, in the shape the profile parsers read back */
    fun valueOf(item: Item): JsonElement = when {
        item.kind == CosmeticKind.nameplate && item.palette != null ->
            JsonObject(mapOf("url" to JsonPrimitive(item.url), "palette" to JsonPrimitive(item.palette)))
        item.kind == CosmeticKind.profile_frame && item.pieces.isNotEmpty() -> JsonObject(
            mapOf(
                "url" to JsonPrimitive(item.url),
                "pieces" to JsonArray(
                    item.pieces.map { piece ->
                        JsonObject(
                            buildMap {
                                put("pos", JsonPrimitive(piece.pos))
                                put("url", JsonPrimitive(piece.url))
                                piece.layer?.let { put("layer", JsonPrimitive(it)) }
                            },
                        )
                    },
                ),
            ),
        )
        else -> JsonPrimitive(item.url)
    }

    /** Whether a stored cosmetic comes from a pack (media) rather than the shipped art */
    fun isPackCosmetic(value: JsonElement?): Boolean {
        if (value.isMxc()) return true
        val obj = value as? JsonObject ?: return false
        if (obj["url"].isMxc()) return true
        return (obj["pieces"] as? JsonArray).orEmpty().any { (it as? JsonObject)?.get("url").isMxc() }
    }

    /** What to draw for a stored cosmetic: nothing for a pack item while packs are switched off */
    fun resolve(value: JsonElement?, showPacks: Boolean): JsonElement? {
        if (value == null || value is JsonNull) return null
        return if (!showPacks && isPackCosmetic(value)) null else value
    }

    /** The same gate for a value already read from a profile: shipped ids always stay, pack media does not */
    fun resolve(value: Value?, showPacks: Boolean): Value? = when {
        value == null -> null
        !showPacks && value is Value.Media -> null
        else -> value
    }

    /** The one gate every drawing of a cosmetic goes through, read as a drawable value */
    fun resolveValue(value: JsonElement?, showPacks: Boolean): Value? = parseValue(resolve(value, showPacks))

    /** A profile value as a drawable value; a string is a shipped id or `mxc://`, an object holds media */
    fun parseValue(value: JsonElement?): Value? {
        val primitive = value as? JsonPrimitive
        if (primitive != null && primitive.isString) {
            val text = primitive.content.trim()
            // A client may have stored the object as JSON text; the web reads that shape too
            if (text.startsWith("{")) {
                (runCatching { Json.parseToJsonElement(text) }.getOrNull() as? JsonObject)?.let { return parseObject(it) }
            }
            return parseId(text)
        }
        val obj = value as? JsonObject ?: return null
        return parseObject(obj)
    }

    private fun parseObject(obj: JsonObject): Value? {
        val url = obj["url"].string()?.takeIf { it.startsWith(MXC) }
        val palette = obj["palette"].string()
        val pieces = parsePieces(obj["pieces"])
        if (url == null && pieces.isEmpty()) return null
        return Value.Media(url.orEmpty(), palette, pieces)
    }

    private fun parseId(raw: String): Value? {
        val text = raw.trim()
        if (text.isEmpty() || text.length > MAX_VALUE_CHARS) return null
        if (text.startsWith(MXC)) return Value.Media(text)
        // Nothing but shipped art ids are plain strings; a URL of any other kind is never drawn
        return text.takeIf { "://" !in it }?.let(Value::Id)
    }

    /** A decoration or effect as the web stores them: a shipped id or an `mxc://` string */
    fun parseString(value: JsonElement?): Value? = (value as? JsonPrimitive)?.takeIf { it.isString }?.let { parseId(it.content) }

    private fun parsePieces(raw: JsonElement?): List<FramePiece> {
        val array = raw as? JsonArray ?: return emptyList()
        return array.take(MAX_PIECES).mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val url = obj["url"].string()?.takeIf { it.startsWith(MXC) } ?: return@mapNotNull null
            val pos = obj["pos"].string()?.takeIf { it in FRAME_POSITIONS } ?: return@mapNotNull null
            FramePiece(pos, url, obj["layer"].string()?.takeIf { it == "back" || it == "front" })
        }
    }

    private fun itemOf(shortcode: String, image: JsonObject, packUsage: List<String>): Item? {
        val url = image["url"].string()?.takeIf { it.startsWith(MXC) } ?: return null
        val usage = (image["usage"] as? JsonArray).orEmpty().mapNotNull { it.string() }.ifEmpty { packUsage }
        val kind = kindOf(usage) ?: return null
        val info = image["info"] as? JsonObject ?: JsonObject(emptyMap())
        return Item(
            shortcode = shortcode,
            name = image["body"].string()?.takeIf { it.isNotEmpty() } ?: shortcode,
            url = url,
            kind = kind,
            palette = info["palette"].string(),
            pieces = parsePieces(info["pieces"]),
            intro = info[EFFECT_INTRO_INFO].string()?.takeIf { it.startsWith(MXC) },
        )
    }

    private fun isMeaningful(content: JsonObject?): Boolean {
        if (content == null) return false
        if ((content["pack"] as? JsonObject).orEmpty().isNotEmpty()) return true
        return (content["images"] as? JsonObject).orEmpty().isNotEmpty()
    }

    /** The first `pack` object field that is set, across the stable and unstable events */
    private class PackInfo(
        val displayName: String?,
        val usage: List<String>?,
        val attribution: String?,
    ) {
        companion object {
            fun merge(contents: List<JsonObject?>): PackInfo {
                var displayName: String? = null
                var usage: List<String>? = null
                var attribution: String? = null
                for (content in contents) {
                    val pack = content?.get("pack") as? JsonObject ?: continue
                    displayName = displayName ?: pack["display_name"].string()
                    usage = usage ?: (pack["usage"] as? JsonArray)?.mapNotNull { it.string() }?.takeIf { it.isNotEmpty() }
                    attribution = attribution ?: pack["attribution"].string()
                }
                return PackInfo(displayName, usage, attribution)
            }
        }
    }

    /** The images of both events by shortcode, the first event that has one winning */
    private fun imageMap(contents: List<JsonObject?>): Map<String, JsonObject> {
        val merged = LinkedHashMap<String, JsonObject>()
        for (content in contents) {
            val images = content?.get("images") as? JsonObject ?: continue
            for ((shortcode, image) in images) {
                if (shortcode in merged) continue
                val obj = image as? JsonObject ?: continue
                if (obj["url"].string().isNullOrEmpty()) continue
                merged[shortcode] = obj
            }
        }
        return merged
    }

    // --- Subscriptions ---

    /** The subscriptions of both events, as room -> state key -> the event's extra content */
    fun mergeSubscriptions(contents: List<JsonObject?>): Map<String, Map<String, JsonElement>> {
        val merged = LinkedHashMap<String, MutableMap<String, JsonElement>>()
        for (content in contents) {
            val rooms = content?.get("rooms") as? JsonObject ?: continue
            for ((roomId, keys) in rooms) {
                val obj = keys as? JsonObject ?: continue
                val stateKeys = merged.getOrPut(roomId) { LinkedHashMap() }
                for ((stateKey, extra) in obj) stateKeys.putIfAbsent(stateKey, extra)
            }
        }
        return merged
    }

    fun isSubscribed(rooms: Map<String, Map<String, JsonElement>>, roomId: String, stateKey: String): Boolean =
        rooms[roomId]?.containsKey(stateKey) == true

    /** `rooms` with one pack subscribed or unsubscribed; rooms left without packs are dropped */
    fun withSubscription(
        rooms: Map<String, Map<String, JsonElement>>,
        roomId: String,
        stateKey: String,
        subscribed: Boolean,
    ): Map<String, Map<String, JsonElement>> {
        val next = LinkedHashMap(rooms)
        val keys = LinkedHashMap(next[roomId].orEmpty())
        if (subscribed) keys.putIfAbsent(stateKey, JsonObject(emptyMap())) else keys.remove(stateKey)
        if (keys.isEmpty()) next.remove(roomId) else next[roomId] = keys
        return next
    }

    /** The subscription content for exactly `refs`, keeping the rooms this client cannot read */
    fun subscriptionRooms(
        existing: Map<String, Map<String, JsonElement>>,
        refs: List<Ref>,
        keepRoom: (String) -> Boolean = { false },
    ): Map<String, Map<String, JsonElement>> {
        val rooms = LinkedHashMap<String, MutableMap<String, JsonElement>>()
        for ((roomId, keys) in existing) if (keepRoom(roomId)) rooms[roomId] = LinkedHashMap(keys)
        for (ref in refs) rooms.getOrPut(ref.roomId) { LinkedHashMap() }.putIfAbsent(ref.stateKey, JsonObject(emptyMap()))
        return rooms
    }

    fun subscribedRefs(rooms: Map<String, Map<String, JsonElement>>): List<Ref> =
        rooms.flatMap { (roomId, keys) -> keys.keys.map { Ref(roomId, it) } }

    /** The account data content of a subscription map, as both event types store it */
    fun subscriptionsJson(rooms: Map<String, Map<String, JsonElement>>): JsonObject = JsonObject(
        mapOf(
            "rooms" to JsonObject(
                rooms.mapValues { (_, keys) -> JsonObject(keys as Map<String, JsonElement>) },
            ),
        ),
    )

    private fun JsonElement?.isMxc(): Boolean = this.string()?.startsWith(MXC) == true

    private fun JsonElement?.string(): String? =
        (this as? JsonPrimitive)?.takeIf { it.isString }?.content
}
