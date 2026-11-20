package chat.mudrix.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import chat.mudrix.core.MudrixClient
import chat.mudrix.core.Subscription
import chat.mudrix.android.media.GifApi

/**
 * The GIFs starred in the picker, kept in Matrix account data like the web (`useGifFavourites.ts`):
 * `{ "urls": [...] }` under `io.github.kapsikkum.mudrix.gif_favourites`, newest first and at most 50.
 *
 * The picker kept them on this device only until now; [start] folds that list into the account's once.
 * The upstream base's event (`org.wizardchat.gif_favourites`) is read until the first save writes the
 * Mudrix one, as the web and iOS do.
 */
class GifFavourites private constructor() {
    /** The starred URLs, newest first */
    var urls by mutableStateOf<List<String>>(emptyList())
        private set

    private val scope = MainScope()
    private val subscriptions = mutableListOf<Subscription>()
    private val contents = HashMap<String, JsonElement?>()

    /**
     * Follows the account's list; call when a session starts. [legacyRaw] is the picker's old
     * device-only list (the composer's `gifFavourites` JSON), which is added to the account's once
     * and then cleared with [clearLegacy].
     */
    fun start(client: MudrixClient, legacyRaw: String? = null, clearLegacy: () -> Unit = {}) {
        stop()
        for (type in READ_TYPES) {
            subscriptions += client.watchAccountData(type) { content ->
                scope.launch {
                    contents[type] = content
                    urls = parse(READ_TYPES.firstNotNullOfOrNull { contents[it] })
                }
            }
        }
        if (legacyRaw != null) scope.launch { if (migrateLegacy(client, legacyRaw)) clearLegacy() }
    }

    fun stop() {
        subscriptions.forEach { it.cancel() }
        subscriptions.clear()
        contents.clear()
        urls = emptyList()
    }

    fun isFavourite(url: String): Boolean = url in urls

    /** Stars or unstars a GIF, like the web's `toggleFavourite`; puts the list back when it cannot be saved */
    suspend fun toggle(client: MudrixClient, url: String) {
        val before = urls
        val next = toggled(before, url)
        if (next == before) return
        urls = next
        if (runCatching { client.setAccountData(TYPE, content(next, contents[TYPE])) }.isFailure) {
            urls = before
        }
    }

    /** True when the old list needs no more work (moved, nothing to move, or already there) */
    private suspend fun migrateLegacy(client: MudrixClient, raw: String): Boolean {
        val legacy = legacyUrls(raw)
        if (legacy.isEmpty()) return true
        val current = runCatching { client.firstAccountData(READ_TYPES) }.getOrNull()
        val before = parse(current)
        val merged = sanitize(before + legacy)
        if (merged == before) return true
        if (runCatching { client.setAccountData(TYPE, content(merged, current)) }.isFailure) return false
        contents[TYPE] = content(merged, current)
        urls = merged
        return true
    }

    companion object {
        val shared = GifFavourites()

        /** The web's `GIF_FAVOURITES_CAP` */
        const val CAP = 50

        val TYPE = Namespace.mudrixKey("gif_favourites")

        /** Where the upstream base kept them: read until the first change writes [TYPE], never written */
        val UPSTREAM_TYPE = Namespace.upstreamKey("gif_favourites")

        /** Every event the list is read from, best source first */
        val READ_TYPES = listOf(TYPE, UPSTREAM_TYPE)

        /** Whether a URL may be stored: the web keeps `https://` and `mxc://` only */
        fun isStorable(url: String): Boolean = url.startsWith("https://") || url.startsWith("mxc://")

        /** The URLs of a list, without duplicates, storables only, newest first and capped */
        fun sanitize(raw: List<String>): List<String> {
            val seen = HashSet<String>()
            val out = ArrayList<String>()
            for (url in raw) {
                if (!isStorable(url)) continue
                if (!seen.add(url)) continue
                out += url
                if (out.size == CAP) break
            }
            return out
        }

        /** The list after starring or unstarring [url] */
        fun toggled(urls: List<String>, url: String): List<String> {
            if (!isStorable(url)) return urls
            if (url in urls) return urls.filter { it != url }
            return sanitize(listOf(url) + urls)
        }

        /**
         * The stored event for a list. Fields this app does not know (the web keeps the encrypted file
         * descriptor of an encrypted GIF under `files`) are copied through, with `files` pruned to the
         * URLs that are still starred, so a toggle here does not drop them.
         */
        fun content(urls: List<String>, previous: JsonElement? = null): JsonObject {
            val kept = sanitize(urls)
            val base = previous as? JsonObject ?: JsonObject(emptyMap())
            val files = (base["files"] as? JsonObject)?.filterKeys { it in kept }
            return buildJsonObject {
                for ((key, value) in base) {
                    if (key != "urls" && key != "files") put(key, value)
                }
                put("urls", JsonArray(kept.map(::JsonPrimitive)))
                if (!files.isNullOrEmpty()) put("files", JsonObject(files))
            }
        }

        /** The list in a stored event */
        fun parse(value: JsonElement?): List<String> {
            val list = (value as? JsonObject)?.get("urls") as? JsonArray ?: return emptyList()
            return sanitize(list.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.contentOrNull })
        }

        /** The URLs of the picker's old device-only list: encoded GIFs, or plain strings */
        fun legacyUrls(raw: String?): List<String> {
            if (raw.isNullOrEmpty()) return emptyList()
            val gifs = GifApi.parseRecent(raw).map { it.url }
            if (gifs.isNotEmpty()) return sanitize(gifs)
            val plain = runCatching {
                val array = Json.parseToJsonElement(raw) as? JsonArray ?: return@runCatching emptyList<String>()
                array.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.contentOrNull }
            }.getOrDefault(emptyList())
            return sanitize(plain)
        }
    }
}
