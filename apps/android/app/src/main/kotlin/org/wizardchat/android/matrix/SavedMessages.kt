package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import org.wizardchat.core.EventSource
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

/** The content of the first of these account data types that exists, like the web's `readFirstAccountData` */
suspend fun WizardClient.firstAccountData(types: List<String>): JsonElement? {
    for (type in types) runCatching { accountData(type) }.getOrNull()?.let { return it }
    return null
}

data class SavedMessage(val roomId: String, val eventId: String, val savedAt: Long)

/** A message's sender, first text and time, from the stored event */
data class EventPreview(val sender: String, val body: String, val timestamp: Long, val redacted: Boolean)

/**
 * Saved messages, kept in the `io.github.kapsikkum.mudrix.saved_messages` account data like the web
 * (`util/savedMessages.ts`): only room and event ids, so the server never sees the text.
 */
class SavedMessages private constructor() {
    var items by mutableStateOf<List<SavedMessage>>(emptyList())
        private set

    val ids: Set<String> get() = items.mapTo(HashSet()) { it.eventId }

    private val scope = MainScope()
    private val subscriptions = mutableListOf<Subscription>()
    private val contents = HashMap<String, JsonElement?>()

    fun start(client: WizardClient) {
        stop()
        for (type in TYPES) {
            subscriptions += client.watchAccountData(type) { content ->
                scope.launch {
                    contents[type] = content
                    items = parse(TYPES.firstNotNullOfOrNull { contents[it] })
                }
            }
        }
    }

    fun stop() {
        subscriptions.forEach { it.cancel() }
        subscriptions.clear()
        contents.clear()
        items = emptyList()
    }

    /** Saves the message, or removes it when it already is saved; true when it is saved now */
    suspend fun toggle(client: WizardClient, roomId: String, eventId: String): Boolean {
        val current = parse(client.firstAccountData(TYPES))
        val (next, saved) = toggled(current, roomId, eventId, System.currentTimeMillis())
        client.setAccountData(TYPE, toContent(next))
        items = next
        return saved
    }

    companion object {
        val shared = SavedMessages()

        val TYPE = Namespace.mudrixKey("saved_messages")

        /** Earlier versions kept the list under other names; they are read until the current one is written */
        val TYPES = listOf(TYPE, Namespace.legacyMudrixKey("saved_messages"), "io.mudrix.saved_messages")

        fun parse(content: JsonElement?): List<SavedMessage> {
            val list = (content as? JsonObject)?.get("items") as? JsonArray ?: return emptyList()
            return list.mapNotNull { item ->
                val obj = item as? JsonObject ?: return@mapNotNull null
                val roomId = (obj["roomId"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return@mapNotNull null
                val eventId = (obj["eventId"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return@mapNotNull null
                val savedAt = (obj["savedAt"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.toLong() ?: 0L
                SavedMessage(roomId, eventId, savedAt)
            }
        }

        fun toContent(items: List<SavedMessage>): JsonObject = buildJsonObject {
            put(
                "items",
                JsonArray(
                    items.map {
                        buildJsonObject {
                            put("roomId", it.roomId)
                            put("eventId", it.eventId)
                            put("savedAt", it.savedAt)
                        }
                    },
                ),
            )
        }

        /** The list after saving or unsaving, newest first, and whether the message is saved in it */
        fun toggled(current: List<SavedMessage>, roomId: String, eventId: String, now: Long): Pair<List<SavedMessage>, Boolean> {
            val saved = current.any { it.eventId == eventId }
            return if (saved) {
                current.filter { it.eventId != eventId } to false
            } else {
                (listOf(SavedMessage(roomId, eventId, now)) + current) to true
            }
        }

        /** What a stored event looks like to a person: decrypted when the core could */
        fun preview(source: EventSource): EventPreview {
            val clear = (source.decrypted ?: source.original) as? JsonObject
            val content = clear?.get("content") as? JsonObject ?: JsonObject(emptyMap())
            val edited = content["m.new_content"] as? JsonObject
            val body = ((edited ?: content)["body"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            return EventPreview(
                sender = (clear?.get("sender") as? JsonPrimitive)?.contentOrNull.orEmpty(),
                body = body,
                timestamp = (clear?.get("origin_server_ts") as? JsonPrimitive)?.doubleOrNull?.toLong() ?: 0L,
                redacted = content.isEmpty(),
            )
        }

        /** Looks a saved message up from the core (it decrypts); null when it cannot be fetched */
        suspend fun resolve(client: WizardClient, saved: SavedMessage): EventPreview? =
            runCatching { preview(client.eventSource(saved.roomId, saved.eventId)) }.getOrNull()
    }
}
