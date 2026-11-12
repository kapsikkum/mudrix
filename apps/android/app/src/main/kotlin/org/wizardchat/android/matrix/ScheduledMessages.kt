package org.wizardchat.android.matrix

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.core.DelayedEvent
import org.wizardchat.core.WizardError

/** A text message the homeserver will send later (MSC4140), as the "Send later" list shows it */
data class ScheduledMessage(
    val delayId: String,
    val roomId: String,
    val body: String,
    /** Epoch milliseconds at which the server sends it */
    val sendAt: Long,
)

/** The rules of "Send later": which delayed events are messages of a room, when they go, and why a request was refused */
object ScheduledMessages {
    /** Nearer than this is not "later"; the server may also drop such a delay */
    const val MIN_DELAY_MS = 5_000L

    private const val MESSAGE_TYPE = "m.room.message"

    /** The room's scheduled text messages, soonest first; state events and other event types are not shown */
    fun of(events: List<DelayedEvent>, roomId: String): List<ScheduledMessage> =
        events
            .filter { it.roomId == roomId && it.eventType == MESSAGE_TYPE && it.stateKey == null }
            .map { event ->
                val body = ((event.content as? JsonObject)?.get("body") as? JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty()
                ScheduledMessage(event.delayId, event.roomId, body, event.runningSince + event.delayMs)
            }
            .sortedBy { it.sendAt }

    /** How long to wait from [now] for [sendAt] (negative when that is past) */
    fun delayFor(sendAt: Long, now: Long): Long = sendAt - now

    fun isSchedulable(sendAt: Long, now: Long) = delayFor(sendAt, now) >= MIN_DELAY_MS

    /** An hour from now, the first preset */
    fun inOneHour(now: Long): Long = now + 60 * 60 * 1000L

    /** Tomorrow at 9:00 in [zone] */
    fun tomorrowMorning(now: Long, zone: ZoneId = ZoneId.systemDefault()): Long {
        val today: ZonedDateTime = Instant.ofEpochMilli(now).atZone(zone)
        return today.toLocalDate().plusDays(1).atTime(9, 0).atZone(zone).toInstant().toEpochMilli()
    }

    /** The message as an `m.room.message` content, the way a normal send would build it */
    fun content(
        body: String,
        html: String? = null,
        mentionedUserIds: List<String> = emptyList(),
        replyTo: String? = null,
        threadRoot: String? = null,
    ): JsonObject {
        val content = linkedMapOf<String, kotlinx.serialization.json.JsonElement>(
            "msgtype" to JsonPrimitive("m.text"),
            "body" to JsonPrimitive(body),
        )
        if (html != null && html != body) {
            content["format"] = JsonPrimitive("org.matrix.custom.html")
            content["formatted_body"] = JsonPrimitive(html)
        }
        if (mentionedUserIds.isNotEmpty()) {
            content["m.mentions"] = JsonObject(mapOf("user_ids" to JsonArray(mentionedUserIds.distinct().map { JsonPrimitive(it) })))
        }
        val relation = when {
            threadRoot != null -> JsonObject(
                buildMap {
                    put("rel_type", JsonPrimitive("m.thread"))
                    put("event_id", JsonPrimitive(threadRoot))
                    put("is_falling_back", JsonPrimitive(replyTo == null))
                    put("m.in_reply_to", JsonObject(mapOf("event_id" to JsonPrimitive(replyTo ?: threadRoot))))
                },
            )
            replyTo != null -> JsonObject(mapOf("m.in_reply_to" to JsonObject(mapOf("event_id" to JsonPrimitive(replyTo)))))
            else -> null
        }
        if (relation != null) content["m.relates_to"] = relation
        return JsonObject(content)
    }

    /** Why a request was refused, to pick the notice */
    enum class Failure { ServerUnsupported, EncryptedRoom, Other }

    fun failureOf(error: Throwable): Failure = when ((error as? WizardError)?.code) {
        "unsupportedByServer" -> Failure.ServerUnsupported
        "unsupported" -> Failure.EncryptedRoom
        else -> Failure.Other
    }

    /** The notice (locale key) for a failure, null for "Other" which shows the error text */
    fun noticeKey(failure: Failure): String? = when (failure) {
        Failure.ServerUnsupported -> "composer.schedule.unsupported"
        Failure.EncryptedRoom -> "composer.schedule.encrypted"
        Failure.Other -> null
    }
}
