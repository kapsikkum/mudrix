package chat.mudrix.android.media

import java.net.URI
import java.net.URLEncoder
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * The GIF providers' requests and answers (`gifProviders/giphy.ts`, `klipy.ts`, `gifRecentData.ts` on the web):
 * the URLs to ask, the items in the reply, the KLIPY download rules and the Recent tab's list. No Android code here,
 * so the rules can be tested on their own.
 */
object GifApi {
    const val GIPHY_API = "https://api.giphy.com/v1/gifs"
    const val KLIPY_API = "https://api.klipy.com/api/v1"
    const val GIPHY_LIMIT = 30
    const val KLIPY_PER_PAGE = 24

    /** A KLIPY download larger than this is refused, like on the web */
    const val KLIPY_MAX_BYTES = 25 * 1024 * 1024

    /** How many sent GIFs the Recent tab keeps */
    const val RECENT_CAP = 60

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val recentSerializer = ListSerializer(GifItem.serializer())

    /**
     * A query value encoded the way the web client's `encodeURIComponent` sends it: spaces become `%20`, not the
     * `+` that form encoding uses. The web is the reference for these URLs, so the two must agree.
     */
    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    // --- URLs ---------------------------------------------------------------------------------------

    /** Trending (empty [query]) or search on GIPHY */
    fun giphyUrl(apiKey: String, query: String, offset: Int = 0, limit: Int = GIPHY_LIMIT): String {
        val encoded = encode(apiKey)
        return if (query.isEmpty()) {
            "$GIPHY_API/trending?api_key=$encoded&limit=$limit&offset=$offset"
        } else {
            "$GIPHY_API/search?api_key=$encoded&q=${encode(query)}&limit=$limit&offset=$offset"
        }
    }

    /** Trending (empty [query]) or search on KLIPY; [page] is one-based */
    fun klipyUrl(apiKey: String, query: String, page: Int = 1, perPage: Int = KLIPY_PER_PAGE): String {
        val base = "$KLIPY_API/${encode(apiKey)}/gifs"
        val params = if (query.isEmpty()) {
            "per_page=$perPage&page=$page"
        } else {
            "q=${encode(query)}&per_page=$perPage&page=$page"
        }
        return if (query.isEmpty()) "$base/trending?$params" else "$base/search?$params"
    }

    /** The KLIPY item behind a klipy.com/gifs/<slug> link */
    fun klipyItemUrl(apiKey: String, slug: String): String =
        "$KLIPY_API/${encode(apiKey)}/gifs/items?slugs=${encode(slug)}"

    // --- KLIPY download safety ----------------------------------------------------------------------

    /** Only https URLs on klipy.com or its subdomains are fetched or shown */
    fun isAllowedKlipyUrl(raw: String?): Boolean {
        if (raw.isNullOrEmpty() || raw.length > 2048) return false
        val uri = runCatching { URI(raw) }.getOrNull() ?: return false
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        if (uri.userInfo != null) return false
        val host = uri.host?.lowercase() ?: return false
        return host == "klipy.com" || host.endsWith(".klipy.com")
    }

    /** A downloaded file must really be a GIF (its first bytes say so) */
    fun isGif(bytes: ByteArray): Boolean {
        if (bytes.size < 6) return false
        val head = String(bytes, 0, 6, Charsets.US_ASCII)
        return head == "GIF87a" || head == "GIF89a"
    }

    // --- replies ------------------------------------------------------------------------------------

    private fun JsonObject.text(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

    private fun JsonObject.int(key: String): Int =
        (this[key] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()?.toInt() ?: 0

    /** The GIFs in a GIPHY trending or search reply */
    fun parseGiphy(body: String): List<GifItem> {
        val root = runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull() ?: return emptyList()
        val items = root["data"] as? JsonArray ?: return emptyList()
        return items.mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            val id = item.text("id") ?: return@mapNotNull null
            val images = item["images"] as? JsonObject ?: return@mapNotNull null
            val full = (images["downsized"] ?: images["original"]) as? JsonObject ?: return@mapNotNull null
            val preview = (images["fixed_width"] as? JsonObject) ?: full
            val url = full.text("url") ?: return@mapNotNull null
            GifItem(
                id = id,
                title = item.text("title").orEmpty(),
                url = url,
                previewUrl = preview.text("url") ?: url,
                width = full.int("width").takeIf { it > 0 } ?: 200,
                height = full.int("height").takeIf { it > 0 } ?: 200,
                provider = GifItem.GIPHY,
            )
        }
    }

    private class Rendition(val url: String, val width: Int, val height: Int, val size: Int)

    private fun rendition(file: JsonObject, sizes: List<String>): Rendition? {
        for (size in sizes) {
            val gif = (file[size] as? JsonObject)?.get("gif") as? JsonObject ?: continue
            val url = gif.text("url") ?: continue
            if (!isAllowedKlipyUrl(url)) continue
            return Rendition(url, gif.int("width"), gif.int("height"), gif.int("size"))
        }
        return null
    }

    private fun klipyItem(raw: kotlinx.serialization.json.JsonElement): GifItem? {
        val entry = raw as? JsonObject ?: return null
        entry.text("type")?.let { if (it != "gif") return null }
        val id = (entry["id"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotEmpty() } ?: return null
        val file = entry["file"] as? JsonObject ?: return null
        val send = rendition(file, SEND_ORDER) ?: return null
        val thumb = rendition(file, THUMB_ORDER) ?: return null
        if (send.size > KLIPY_MAX_BYTES) return null
        return GifItem(
            id = id,
            title = entry.text("title").orEmpty(),
            url = send.url,
            previewUrl = thumb.url,
            width = thumb.width.takeIf { it > 0 } ?: send.width,
            height = thumb.height.takeIf { it > 0 } ?: send.height,
            provider = GifItem.KLIPY,
        )
    }

    /** The GIFs in a KLIPY trending, search or items reply */
    fun parseKlipy(body: String): List<GifItem> {
        val root = runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull() ?: return emptyList()
        if ((root["result"] as? JsonPrimitive)?.booleanOrNull == false) return emptyList()
        val list = ((root["data"] as? JsonObject)?.get("data") as? JsonArray) ?: return emptyList()
        val seen = mutableSetOf<String>()
        val items = mutableListOf<GifItem>()
        for (raw in list) {
            val item = klipyItem(raw) ?: continue
            if (seen.add(item.id)) items += item
        }
        return items
    }

    // --- Recent tab ---------------------------------------------------------------------------------

    /** [item] moved to the front of [list], capped; the same GIF is only listed once */
    fun withRecent(list: List<GifItem>, item: GifItem, cap: Int = RECENT_CAP): List<GifItem> =
        (listOf(item) + list.filter { it.url != item.url }).take(cap)

    /** The Recent tab's stored list; unusable entries are dropped, not a reason to lose the rest */
    fun parseRecent(raw: String?): List<GifItem> {
        if (raw.isNullOrEmpty()) return emptyList()
        val decoded = runCatching { json.decodeFromString(recentSerializer, raw) }.getOrNull() ?: return emptyList()
        return decoded.filter { it.url.isNotEmpty() }.distinctBy { it.url }.take(RECENT_CAP)
    }

    fun encodeRecent(list: List<GifItem>): String = json.encodeToString(recentSerializer, list)

    private val SEND_ORDER = listOf("md", "hd", "sm")
    private val THUMB_ORDER = listOf("sm", "xs", "md")
}
