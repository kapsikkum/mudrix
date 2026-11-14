package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.core.EventVersion

class EditHistoryTest {
    private fun version(id: String, original: Boolean = false, body: String = id) = EventVersion(
        eventId = id,
        sender = "@a:x",
        timestamp = 1_000,
        isOriginal = original,
        body = body,
    )

    @Test
    fun newestVersionLeads() {
        val ordered = EditHistory.newestFirst(listOf(version("original", true), version("e1"), version("e2")))
        assertEquals(listOf("e2", "e1", "original"), ordered.map { it.eventId })
    }

    @Test
    fun theFirstRowIsTheCurrentText() {
        val versions = EditHistory.newestFirst(listOf(version("original", true), version("e1")))
        assertEquals(listOf("timeline.editHistory.current"), EditHistory.badges(versions[0], 0))
        assertEquals(listOf("timeline.editHistory.original"), EditHistory.badges(versions[1], 1))
    }

    @Test
    fun anUneditedMessageMarksItsOnlyVersionAsBoth() {
        val versions = EditHistory.newestFirst(listOf(version("original", true)))
        assertEquals(
            listOf("timeline.editHistory.current", "timeline.editHistory.original"),
            EditHistory.badges(versions[0], 0),
        )
    }

    @Test
    fun nothingToShowWithNoVersionsOrOnlyTheOriginal() {
        assertTrue(EditHistory.isEmpty(emptyList()))
        assertTrue(EditHistory.isEmpty(listOf(version("original", true))))
        assertFalse(EditHistory.isEmpty(listOf(version("original", true), version("e1"))))
    }
}
