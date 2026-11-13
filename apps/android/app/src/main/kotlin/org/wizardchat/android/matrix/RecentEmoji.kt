package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

/**
 * Recently used emoji, kept in the `m.recent_emoji` account data like the web, so they're the
 * same on every device. The picker offers the most used first, and the quick reactions use the same ranking.
 */
class RecentEmoji private constructor() {
    /**
     * Element X writes entries with only `emoji` and a use count; the web adds a label and the
     * image of custom emoji. Either is read, and both fields are written.
     */
    @Serializable
    data class Entry(
        val emoji: String,
        val label: String? = null,
        val url: String? = null,
        val total: Long? = null,
    )

    /** The stored entries, the latest use first */
    var entries by mutableStateOf<List<Entry>>(emptyList())
        private set

    /** The frequently used emoji, the most used first */
    val frequent: List<Entry>
        get() = RecentEmojiRanking.ranked(entries)

    private val scope = MainScope()
    private var client: WizardClient? = null
    private val subscriptions = mutableListOf<Subscription>()
    private var saveJob: Job? = null
    /** Set while a pick is waiting to be written, so an older copy from the server doesn't undo it */
    private var unsaved = false
    /** What the server last had under each key; the two are merged the way the web reads them */
    private var stored = emptyList<Entry>()
    private var legacy = emptyList<Entry>()

    val quickReactions: List<String>
        get() = (frequent.filter { it.url == null }.map { it.emoji } + DEFAULT_REACTIONS).distinct().take(QUICK_COUNT)

    fun start(client: WizardClient) {
        this.client = client
        subscriptions += client.watchAccountData(EVENT_TYPE) { content -> scope.launch { applyStored(content) } }
        subscriptions += client.watchAccountData(LEGACY_EVENT_TYPE) { content -> scope.launch { applyLegacy(content) } }
        scope.launch {
            applyStored(runCatching { client.accountData(EVENT_TYPE) }.getOrNull())
            applyLegacy(runCatching { client.accountData(LEGACY_EVENT_TYPE) }.getOrNull())
        }
    }

    fun stop() {
        subscriptions.forEach { it.cancel() }
        subscriptions.clear()
        saveJob?.cancel()
        unsaved = false
        client = null
        stored = emptyList()
        legacy = emptyList()
        entries = emptyList()
    }

    fun use(emoji: String, label: String, url: String? = null) {
        entries = RecentEmojiRanking.use(entries, emoji, label, url)
        unsaved = true
        // Several picks in a row become one account data write
        saveJob?.cancel()
        saveJob = scope.launch {
            delay(1000)
            var retry = SAVE_RETRY_MIN
            while (true) {
                val client = client ?: return@launch
                val snapshot = entries
                val content = JsonObject(mapOf("recent_emoji" to json.encodeToJsonElement(snapshot)))
                val saved = runCatching { client.setAccountData(EVENT_TYPE, content) }.isSuccess
                val legacyList = snapshot.filter { it.url == null }
                val legacyContent = JsonObject(
                    mapOf(
                        "recent_emoji" to JsonArray(
                            legacyList.map { JsonArray(listOf(JsonPrimitive(it.emoji), JsonPrimitive(RecentEmojiRanking.count(it)))) }
                        )
                    )
                )
                val legacySaved = runCatching { client.setAccountData(LEGACY_EVENT_TYPE, legacyContent) }.isSuccess
                if (saved && legacySaved) {
                    stored = snapshot
                    legacy = legacyList.map { Entry(it.emoji, total = RecentEmojiRanking.count(it)) }
                    unsaved = false
                    return@launch
                }
                // The pick stays pending (not overwritten by the server's copy) and the write is tried again
                delay(retry)
                retry = (retry * 2).coerceAtMost(SAVE_RETRY_MAX)
            }
        }
    }

    private fun applyStored(content: JsonElement?) {
        stored = recentList(content).mapNotNull { item ->
            runCatching { json.decodeFromJsonElement(Entry.serializer(), item) }.getOrNull()
        }.filter { it.emoji.isNotEmpty() }
        refresh()
    }

    private fun applyLegacy(content: JsonElement?) {
        legacy = recentList(content).mapNotNull { parseLegacy(it) }
        refresh()
    }

    private fun refresh() {
        if (!unsaved) entries = RecentEmojiRanking.merge(stored, legacy)
    }

    /** Element's older `[emoji, count]` pairs */
    private fun parseLegacy(item: JsonElement): Entry? {
        val pair = item as? JsonArray ?: return null
        val emoji = (pair.getOrNull(0) as? JsonPrimitive)?.takeIf { it.isString }?.content
        if (emoji.isNullOrEmpty()) return null
        return Entry(emoji, total = (pair.getOrNull(1) as? JsonPrimitive)?.longOrNull)
    }

    private fun recentList(content: JsonElement?): List<JsonElement> =
        (runCatching { content?.jsonObject?.get("recent_emoji") as? JsonArray }.getOrNull()).orEmpty()

    companion object {
        val shared = RecentEmoji()

        private const val EVENT_TYPE = "m.recent_emoji"
        private const val LEGACY_EVENT_TYPE = "io.element.recent_emoji"
        private const val QUICK_COUNT = 6
        private const val SAVE_RETRY_MIN = 5_000L
        private const val SAVE_RETRY_MAX = 60_000L
        private val DEFAULT_REACTIONS = listOf("👍", "❤️", "😂", "😮", "😢", "🎉")
        private val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }
    }
}
