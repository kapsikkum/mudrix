package org.wizardchat.android.matrix

import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.core.EventSource

class RemindersTest {
    private fun json(text: String) = Json.parseToJsonElement(text)

    @Test
    fun parsesSortedAndDropsIncompleteEntries() {
        val items = Reminders.parse(
            json(
                """{"items":[{"id":"b","roomId":"!r","eventId":"${'$'}e2","at":2000},
                   {"id":"a","roomId":"!r","eventId":"${'$'}e1","at":1000},
                   {"id":"c","roomId":"!r","eventId":"${'$'}e3"},{"roomId":"!r"}]}""",
            ),
        )
        assertEquals(listOf("a", "b"), items.map { it.id })
        assertEquals(emptyList<Reminder>(), Reminders.parse(null))
        assertEquals(items, Reminders.parse(Reminders.toContent(items)))
    }

    @Test
    fun presetsFallDueRelativeToNow() {
        val zone = ZoneId.of("Europe/Berlin")
        val now = ZonedDateTime.of(2026, 3, 28, 22, 30, 0, 0, zone).toInstant().toEpochMilli()
        assertEquals(now + 20 * 60_000, Reminders.time(ReminderPreset.In20m, now, zone))
        assertEquals(now + 3 * 3_600_000, Reminders.time(ReminderPreset.In3h, now, zone))
        // The clocks go forward that night; "tomorrow" is still 9:00 on the wall
        val tomorrow = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(Reminders.time(ReminderPreset.Tomorrow, now, zone)), zone)
        assertEquals(29, tomorrow.dayOfMonth)
        assertEquals(9, tomorrow.hour)
        assertEquals(0, tomorrow.minute)
    }

    @Test
    fun savedMessagesToggleAndRoundTrip() {
        val (saved, isSaved) = SavedMessages.toggled(emptyList(), "!r", "${'$'}e", 5)
        assertTrue(isSaved)
        assertEquals(listOf(SavedMessage("!r", "${'$'}e", 5)), saved)
        val (again, stillSaved) = SavedMessages.toggled(saved, "!r", "${'$'}e", 9)
        assertEquals(false, stillSaved)
        assertEquals(emptyList<SavedMessage>(), again)
        assertEquals(saved, SavedMessages.parse(SavedMessages.toContent(saved)))
        val newest = SavedMessages.toggled(saved, "!r", "${'$'}f", 10).first
        assertEquals(listOf("${'$'}f", "${'$'}e"), newest.map { it.eventId })
    }

    @Test
    fun previewReadsTheDecryptedEvent() {
        val source = EventSource(
            "!r",
            "${'$'}e",
            json("""{"type":"m.room.encrypted","content":{"algorithm":"x"}}"""),
            json("""{"sender":"@a:b","origin_server_ts":42,"content":{"body":"old","m.new_content":{"body":"edited"}}}"""),
        )
        val preview = SavedMessages.preview(source)
        assertEquals("@a:b", preview.sender)
        assertEquals("edited", preview.body)
        assertEquals(42L, preview.timestamp)
        assertEquals(false, preview.redacted)
        assertTrue(SavedMessages.preview(EventSource("!r", "${'$'}e", json("""{"content":{}}"""))).redacted)
    }
}
