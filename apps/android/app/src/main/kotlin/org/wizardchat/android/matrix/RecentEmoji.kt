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
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

/**
 * Recently used emoji, kept in the `m.recent_emoji` account data like the web, so they're the
 * same on every device. They also fill the quick reactions, like the keyboard's recent emoji.
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

    var entries by mutableStateOf<List<Entry>>(emptyList())
        private set

    private val scope = MainScope()
    private var client: WizardClient? = null
    private var subscription: Subscription? = null
    private var saveJob: Job? = null
    /** Set while a pick is waiting to be written, so an older copy from the server doesn't undo it */
    private var unsaved = false

    val quickReactions: List<String>
        get() = (entries.filter { it.url == null }.map { it.emoji } + DEFAULT_REACTIONS).distinct().take(QUICK_COUNT)

    fun start(client: WizardClient) {
        this.client = client
        subscription = client.watchAccountData(EVENT_TYPE) { content -> scope.launch { apply(content) } }
        scope.launch { apply(runCatching { client.accountData(EVENT_TYPE) }.getOrNull()) }
    }

    fun stop() {
        subscription?.cancel()
        subscription = null
        saveJob?.cancel()
        unsaved = false
        client = null
        entries = emptyList()
    }

    fun use(emoji: String, label: String, url: String? = null) {
        val total = (entries.firstOrNull { it.emoji == emoji }?.total ?: 0) + 1
        entries = (listOf(Entry(emoji, label, url, total)) + entries.filter { it.emoji != emoji }).take(LIMIT)
        unsaved = true
        // Several picks in a row become one account data write
        saveJob?.cancel()
        saveJob = scope.launch {
            delay(1000)
            val client = client ?: return@launch
            val content = JsonObject(mapOf("recent_emoji" to json.encodeToJsonElement(entries)))
            runCatching { client.setAccountData(EVENT_TYPE, content) }
            unsaved = false
        }
    }

    private fun apply(content: JsonElement?) {
        if (unsaved) return
        val list = runCatching { content?.jsonObject?.get("recent_emoji") as? JsonArray }.getOrNull() ?: return
        entries = list.mapNotNull { runCatching { json.decodeFromJsonElement(Entry.serializer(), it) }.getOrNull() }
    }

    companion object {
        val shared = RecentEmoji()

        private const val EVENT_TYPE = "m.recent_emoji"
        private const val LIMIT = 30
        private const val QUICK_COUNT = 6
        private val DEFAULT_REACTIONS = listOf("👍", "❤️", "😂", "😮", "😢", "🎉")
        private val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }
    }
}
