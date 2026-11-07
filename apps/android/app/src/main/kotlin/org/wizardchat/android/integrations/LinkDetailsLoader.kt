package org.wizardchat.android.integrations

import java.util.Locale
import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.json.JsonElement

/**
 * Looks a matched link card up on the one host its integration was approved for, with the request discipline of the web app's
 * `details.ts`: a cache (15 minutes, 5 for a failure), one request per URL at a time, a conditional request once an answer is
 * stale, a budget per host and a back-off after a rate limit. The request itself is made by [IntegrationNetwork].
 */
class LinkDetailsLoader(private val transport: IntegrationNetwork.Transport = IntegrationNetwork.connection, private val now: () -> Long = System::currentTimeMillis) {
    sealed interface Result {
        class Ok(val details: IntegrationDetails.Details) : Result

        /** [paused]: nothing was asked because passive requests are off right now (streamer mode) */
        class Error(val error: String, val paused: Boolean = false) : Result
    }

    private class Entry(
        /** The last good answer, or null when there is none */
        val json: JsonElement?,
        val error: String?,
        /** The host's entity tag for [json], used to ask "has it changed?" once it is stale */
        val etag: String?,
        /** When [json] was received or last confirmed unchanged (a 304) */
        val confirmedAt: Long,
        /** Nothing is requested for this URL before this time */
        val freshUntil: Long,
    )

    private class Outcome(val json: JsonElement?, val error: String? = null)

    private val lock = Any()
    private val cache = LinkedHashMap<String, Entry>()
    private val inflight = HashMap<String, CompletableDeferred<Outcome>>()
    private val backoffUntil = HashMap<String, Long>()
    private val recent = HashMap<String, MutableList<Long>>()

    private fun remember(url: String, entry: Entry) {
        synchronized(lock) {
            cache.remove(url)
            if (cache.size >= MAX_CACHE) cache.keys.firstOrNull()?.let { cache.remove(it) }
            cache[url] = entry
        }
    }

    /** The cached answer if it is not too old to show, else null */
    private fun staleJson(entry: Entry?): JsonElement? = if (entry?.json != null && now() - entry.confirmedAt < MAX_STALE_MS) entry.json else null

    /** Takes one request from the host's budget; returns its timestamp, or null when spent */
    private fun takeBudget(host: String): Long? = synchronized(lock) {
        val time = now()
        val list = (recent[host] ?: mutableListOf()).filter { time - it < HOST_WINDOW_MS }.toMutableList()
        recent[host] = list
        if (list.size >= HOST_BUDGET) return@synchronized null
        list += time
        time
    }

    /** Gives a request back (a 304 did not cost the host an answer) */
    private fun refundBudget(host: String, at: Long) {
        synchronized(lock) { recent[host]?.remove(at) }
    }

    private suspend fun refresh(url: String, host: String, allow: List<String>, previous: Entry?, budgetAt: Long, passive: Boolean): Outcome {
        val stale = staleJson(previous)
        val res = IntegrationNetwork.fetch(
            IntegrationNetwork.Request(
                url, allow, IntegrationNetwork.Expect.json,
                maxBytes = MAX_DETAILS_RESPONSE_BYTES,
                passive = passive,
                ifNoneMatch = if (stale != null) previous?.etag else null,
            ),
            transport,
        )
        val time = now()
        if (res is IntegrationNetwork.Failure && res.status == 304 && stale != null && previous != null) {
            refundBudget(host, budgetAt)
            remember(url, Entry(previous.json, null, previous.etag, time, time + CACHE_OK_MS))
            return Outcome(stale)
        }
        if (res is IntegrationNetwork.Success) {
            remember(url, Entry(res.json, null, res.etag, time, time + CACHE_OK_MS))
            return Outcome(res.json)
        }
        res as IntegrationNetwork.Failure
        if (res.status == 403 || res.status == 429) synchronized(lock) { backoffUntil[host] = time + BACKOFF_MS }
        // A slow-down, a server error or no answer at all says nothing about the link itself: keep showing what we had.
        // Anything else (404, 410, ...) means the old answer is no longer true.
        val transient = res.status == null || res.status == 403 || res.status == 429 || res.status >= 500
        if (transient && stale != null && previous != null) {
            remember(url, Entry(previous.json, previous.error, previous.etag, previous.confirmedAt, time + CACHE_FAIL_MS))
            return Outcome(stale)
        }
        remember(url, Entry(null, res.error, null, time, time + CACHE_FAIL_MS))
        return Outcome(null, res.error)
    }

    /** True when a lookup for this URL is already cached (no request would be made) */
    fun isCached(url: String): Boolean = synchronized(lock) { cache[url]?.let { now() < it.freshUntil } == true }

    /**
     * Looks the link up. [allow] is the list of hosts the person approved for this integration (see
     * [IntegrationMatching.allowedHosts]). [passive] is true when nobody asked (a card appeared on screen), false when the
     * person pressed the card's button. Never throws; failures are only ever "no details".
     */
    suspend fun load(
        host: String,
        lookup: LinkLookup,
        captures: Map<String, String>,
        allow: List<String>,
        locale: Locale = Locale.getDefault(),
        settings: SettingValues = IntegrationSettings.NONE,
        passive: Boolean = true,
    ): Result {
        try {
            // Every field it could show is switched off: nothing to ask for
            if (!IntegrationSettings.lookupShowsAnything(lookup, settings)) return Result.Ok(IntegrationDetails.Details.EMPTY)
            val built = IntegrationDetails.buildLookupUrl(host, lookup, captures)
            if (built !is IntegrationDetails.LookupUrl.Ok) return Result.Error((built as IntegrationDetails.LookupUrl.Error).error)
            val url = built.url
            fun finish(o: Outcome): Result =
                if (o.json == null) Result.Error(o.error ?: "No details") else Result.Ok(IntegrationDetails.extract(o.json, lookup, locale, settings))

            var entry: Entry? = null
            var pending: CompletableDeferred<Outcome>? = null
            var mine: CompletableDeferred<Outcome>? = null
            var budgetAt: Long? = null
            var early: Result? = null
            synchronized(lock) {
                entry = cache[url]
                val cached = entry
                if (cached != null && now() < cached.freshUntil) {
                    early = finish(Outcome(cached.json, cached.error))
                    return@synchronized
                }
                pending = inflight[url]
                if (pending != null) return@synchronized
                // When the host can not be asked right now, a recent enough answer is better than none
                val stale = staleJson(cached)
                // Streamer mode: nothing leaves the device on its own, and nothing is remembered as a failure
                if (passive && IntegrationNetwork.passiveBlocked()) {
                    early = if (stale != null) finish(Outcome(stale)) else Result.Error("paused", paused = true)
                    return@synchronized
                }
                if ((backoffUntil[host] ?: 0) > now()) {
                    early = if (stale != null) finish(Outcome(stale)) else Result.Error("$host asked to slow down")
                    return@synchronized
                }
            }
            early?.let { return it }
            pending?.let { return finish(it.await()) }
            budgetAt = takeBudget(host)
            if (budgetAt == null) {
                val stale = staleJson(entry)
                return if (stale != null) finish(Outcome(stale)) else Result.Error("Too many lookups on $host just now")
            }
            synchronized(lock) {
                val raced = inflight[url]
                if (raced != null) {
                    pending = raced
                } else {
                    mine = CompletableDeferred<Outcome>().also { inflight[url] = it }
                }
            }
            pending?.let {
                refundBudget(host, budgetAt)
                return finish(it.await())
            }
            var result = Outcome(null, "No details")
            try {
                result = refresh(url, host, allow, entry, budgetAt, passive)
            } finally {
                synchronized(lock) { inflight.remove(url) }
                mine?.complete(result)
            }
            return finish(result)
        } catch (_: Exception) {
            return Result.Error("No details")
        }
    }

    /** Forgets every cached answer, budget and back-off (tests) */
    fun reset() {
        synchronized(lock) {
            cache.clear()
            inflight.clear()
            backoffUntil.clear()
            recent.clear()
        }
    }

    companion object {
        const val MAX_DETAILS_RESPONSE_BYTES = 64 * 1024
        private const val CACHE_OK_MS = 15 * 60 * 1000L
        private const val CACHE_FAIL_MS = 5 * 60 * 1000L

        /** An answer older than this is never shown, even when the host can not be asked again */
        private const val MAX_STALE_MS = 24 * 60 * 60 * 1000L
        private const val MAX_CACHE = 200

        /** After a 403 or 429 (rate limited) the host is left alone for a while */
        private const val BACKOFF_MS = 15 * 60 * 1000L

        /** At most this many requests per host in any 10 minutes, whatever is on screen */
        private const val HOST_BUDGET = 30
        private const val HOST_WINDOW_MS = 10 * 60 * 1000L

        val shared = LinkDetailsLoader()
    }
}
