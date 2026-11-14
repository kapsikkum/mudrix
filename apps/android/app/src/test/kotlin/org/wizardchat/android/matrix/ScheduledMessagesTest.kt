package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.core.DelayedEvent
import org.wizardchat.core.WizardError

class ScheduledMessagesTest {
    private fun event(
        id: String = "d1",
        room: String = "!r:x",
        type: String = "m.room.message",
        stateKey: String? = null,
        body: String = "hi",
        runningSince: Long = 1_000,
        delayMs: Long = 2_000,
    ) = DelayedEvent(
        delayId = id,
        roomId = room,
        eventType = type,
        stateKey = stateKey,
        content = buildJsonObject { put("body", body) },
        delayMs = delayMs,
        runningSince = runningSince,
    )

    @Test
    fun keepsOnlyThisRoomsTextMessages() {
        val events = listOf(
            event(id = "a"),
            event(id = "b", room = "!other:x"),
            event(id = "c", type = "m.room.topic", stateKey = ""),
            event(id = "d", stateKey = "k"),
        )
        assertEquals(listOf("a"), ScheduledMessages.of(events, "!r:x").map { it.delayId })
    }

    @Test
    fun sortsByWhenTheServerSendsIt() {
        val events = listOf(
            event(id = "later", runningSince = 1_000, delayMs = 9_000),
            event(id = "sooner", runningSince = 5_000, delayMs = 1_000),
        )
        assertEquals(listOf("sooner", "later"), ScheduledMessages.of(events, "!r:x").map { it.delayId })
    }

    @Test
    fun readsTheBody() {
        val scheduled = ScheduledMessages.of(listOf(event(body = "see you")), "!r:x").single()
        assertEquals("see you", scheduled.body)
        assertEquals(3_000L, scheduled.sendAt)
    }

    @Test
    fun needsTheSendDateInTheFuture() {
        val now = 1_000_000L
        assertTrue(ScheduledMessages.isSchedulable(now + ScheduledMessages.MIN_DELAY_MS, now))
        assertFalse(ScheduledMessages.isSchedulable(now + ScheduledMessages.MIN_DELAY_MS - 1, now))
        assertFalse(ScheduledMessages.isSchedulable(now - 1, now))
        assertEquals(-5L, ScheduledMessages.delayFor(now - 5, now))
    }

    @Test
    fun presetsAreAnHourAndTomorrowMorning() {
        val now = 1_700_000_000_000L
        assertEquals(now + 3_600_000L, ScheduledMessages.inOneHour(now))
        val tomorrow = ScheduledMessages.tomorrowMorning(now, java.time.ZoneId.of("UTC"))
        assertTrue(tomorrow > now)
        val at = java.time.Instant.ofEpochMilli(tomorrow).atZone(java.time.ZoneId.of("UTC"))
        assertEquals(9, at.hour)
        assertEquals(0, at.minute)
    }

    @Test
    fun buildsPlainAndFormattedContent() {
        val plain = ScheduledMessages.content("hello")
        assertEquals("m.text", (plain["msgtype"] as JsonPrimitive).content)
        assertEquals("hello", (plain["body"] as JsonPrimitive).content)
        assertNull(plain["format"])

        val reply = ScheduledMessages.content("hello", html = "<b>hello</b>", replyTo = "\$e1")
        assertEquals("org.matrix.custom.html", (reply["format"] as JsonPrimitive).content)
        assertEquals("<b>hello</b>", (reply["formatted_body"] as JsonPrimitive).content)
        assertTrue(reply.toString().contains("\$e1"))
    }

    @Test
    fun mapsRefusalsToNotices() {
        assertEquals(ScheduledMessages.Failure.ServerUnsupported, ScheduledMessages.failureOf(WizardError("unsupportedByServer", "x")))
        assertEquals(ScheduledMessages.Failure.EncryptedRoom, ScheduledMessages.failureOf(WizardError("unsupported", "x")))
        assertEquals(ScheduledMessages.Failure.Other, ScheduledMessages.failureOf(IllegalStateException("boom")))
        assertEquals("composer.schedule.unsupported", ScheduledMessages.noticeKey(ScheduledMessages.Failure.ServerUnsupported))
        assertNull(ScheduledMessages.noticeKey(ScheduledMessages.Failure.Other))
    }
}
