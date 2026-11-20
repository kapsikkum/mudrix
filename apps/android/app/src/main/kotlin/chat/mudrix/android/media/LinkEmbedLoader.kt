package chat.mudrix.android.media

import chat.mudrix.core.LinkEmbedCard
import chat.mudrix.core.MudrixClient
import java.util.LinkedHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async

/**
 * Asks embeds.now (through the core, no account needed) for a link's card. Answers are kept in
 * memory per address: a card, or "there is none" (null). A failure is thrown and never kept, so the
 * next look tries again. Several views of one link share a single request, and the request
 * outlives any one of them (a message scrolled away does not cancel what another still waits for).
 */
class LinkEmbedLoader(
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val capacity: Int = 128,
    private val fetch: suspend (String) -> LinkEmbedCard? = { MudrixClient.linkEmbed(it) },
) {
    private val lock = Any()
    private val cache = object : LinkedHashMap<String, LinkEmbedCard?>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, LinkEmbedCard?>?) = size > capacity
    }
    private val inFlight = HashMap<String, Deferred<LinkEmbedCard?>>()

    /** The card for [url], null when there is none; throws when embeds.now could not be reached */
    suspend fun load(url: String): LinkEmbedCard? {
        var started: Deferred<LinkEmbedCard?>? = null
        val request = synchronized(lock) {
            if (cache.containsKey(url)) return cache[url]
            inFlight[url] ?: scope.async(start = CoroutineStart.LAZY) {
                try {
                    fetch(url).also { card -> synchronized(lock) { cache[url] = card } }
                } finally {
                    synchronized(lock) { inFlight.remove(url) }
                }
            }.also {
                inFlight[url] = it
                started = it
            }
        }
        started?.start()
        return request.await()
    }

    /** The answer already known for [url]: `false` when none, else whether a card exists */
    fun cached(url: String): Pair<Boolean, LinkEmbedCard?> = synchronized(lock) {
        if (cache.containsKey(url)) true to cache[url] else false to null
    }

    companion object {
        val shared = LinkEmbedLoader()
    }
}

