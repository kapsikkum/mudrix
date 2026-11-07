package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

data class Reminder(val id: String, val roomId: String, val eventId: String, val at: Long)

enum class ReminderPreset(val labelKey: String) {
    In20m("timeline.remind.in20m"),
    In1h("timeline.remind.in1h"),
    In3h("timeline.remind.in3h"),
    Tomorrow("timeline.remind.tomorrow"),
}

/**
 * "Remind me" reminders in the `io.github.kapsikkum.mudrix.reminders` account data like the web
 * (`util/reminders.ts`): only room and event ids. There is no server-side scheduling; an open app
 * delivers a reminder when it falls due, and whoever removes it from the list first delivers it, so
 * two devices do not both show it.
 */
class Reminders private constructor() {
    var items by mutableStateOf<List<Reminder>>(emptyList())
        private set

    private val scope = MainScope()
    private val subscriptions = mutableListOf<Subscription>()
    private val contents = HashMap<String, JsonElement?>()
    private val timers = HashMap<String, Job>()
    private val delivering = HashSet<String>()
    private var client: WizardClient? = null

    fun start(client: WizardClient) {
        stop()
        this.client = client
        for (type in TYPES) {
            subscriptions += client.watchAccountData(type) { content ->
                scope.launch {
                    contents[type] = content
                    items = parse(TYPES.firstNotNullOfOrNull { contents[it] })
                    schedule()
                }
            }
        }
    }

    fun stop() {
        subscriptions.forEach { it.cancel() }
        subscriptions.clear()
        timers.values.forEach { it.cancel() }
        timers.clear()
        contents.clear()
        items = emptyList()
        client = null
    }

    suspend fun add(client: WizardClient, roomId: String, eventId: String, at: Long): Reminder {
        val reminder = Reminder(newId(), roomId, eventId, at)
        client.setAccountData(TYPE, toContent(parse(client.firstAccountData(TYPES)) + reminder))
        return reminder
    }

    /** Removes a reminder; false when it was already gone (another device delivered or cancelled it) */
    suspend fun remove(client: WizardClient, id: String): Boolean {
        val current = parse(client.firstAccountData(TYPES))
        if (current.none { it.id == id }) return false
        client.setAccountData(TYPE, toContent(current.filter { it.id != id }))
        return true
    }

    private fun schedule() {
        val live = items.map { it.id }.toSet()
        timers.keys.filter { it !in live }.forEach { timers.remove(it)?.cancel() }
        for (reminder in items) {
            if (reminder.id in timers) continue
            timers[reminder.id] = scope.launch {
                // A very distant reminder is waited for in steps: a delay can't be longer than an Int
                while (true) {
                    val wait = reminder.at - System.currentTimeMillis()
                    if (wait <= 0) break
                    delay(minOf(wait, MAX_STEP_MS))
                }
                deliver(reminder)
            }
        }
    }

    private suspend fun deliver(reminder: Reminder) {
        val client = client ?: return
        if (!delivering.add(reminder.id)) return
        try {
            // Whoever removes it first delivers it; a device that finds it gone stays quiet
            if (!remove(client, reminder.id)) return
        } catch (_: Exception) {
            // Offline: tried again on the next change or start-up
            delivering.remove(reminder.id)
            return
        }
        val body = SavedMessages.resolve(client, SavedMessage(reminder.roomId, reminder.eventId, 0))?.body.orEmpty()
        val roomName = org.wizardchat.android.WizardApplication.instance.session.roomList?.room(reminder.roomId)?.displayName
        val title = L10n.format("reminders.title") + roomName?.let { " · $it" }.orEmpty()
        CopyToast.show(listOf(title, body.lineSequence().firstOrNull().orEmpty()).filter { it.isNotEmpty() }.joinToString(": "))
        MessageNotifier.shared.notifyReminder(reminder.roomId, reminder.eventId, title, body.lineSequence().firstOrNull().orEmpty())
        delivering.remove(reminder.id)
    }

    companion object {
        val shared = Reminders()

        val TYPE = Namespace.mudrixKey("reminders")
        val TYPES = listOf(TYPE, Namespace.legacyMudrixKey("reminders"))

        private const val MAX_STEP_MS = 6L * 60 * 60 * 1000

        private fun newId(): String =
            java.lang.Long.toString(System.currentTimeMillis(), 36) + java.lang.Long.toString((Math.random() * 2.1e9).toLong(), 36)

        /** The pending reminders, soonest first; entries without all four fields are dropped */
        fun parse(content: JsonElement?): List<Reminder> {
            val list = (content as? JsonObject)?.get("items") as? JsonArray ?: return emptyList()
            return list.mapNotNull { item ->
                val obj = item as? JsonObject ?: return@mapNotNull null
                fun text(key: String) = (obj[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
                val at = (obj["at"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.toLong()
                Reminder(text("id") ?: return@mapNotNull null, text("roomId") ?: return@mapNotNull null, text("eventId") ?: return@mapNotNull null, at ?: return@mapNotNull null)
            }.sortedBy { it.at }
        }

        fun toContent(items: List<Reminder>): JsonObject = buildJsonObject {
            put(
                "items",
                JsonArray(
                    items.map {
                        buildJsonObject {
                            put("id", it.id)
                            put("roomId", it.roomId)
                            put("eventId", it.eventId)
                            put("at", it.at)
                        }
                    },
                ),
            )
        }

        /** When a preset falls due; "tomorrow" is 9:00 the next morning, local time */
        fun time(preset: ReminderPreset, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): Long = when (preset) {
            ReminderPreset.In20m -> now + 20 * 60_000
            ReminderPreset.In1h -> now + 60 * 60_000
            ReminderPreset.In3h -> now + 3 * 60 * 60_000
            ReminderPreset.Tomorrow ->
                Instant.ofEpochMilli(now).atZone(zone).toLocalDate().plusDays(1).atTime(9, 0).atZone(zone).toInstant().toEpochMilli()
        }
    }
}
