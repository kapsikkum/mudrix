package org.wizardchat.android.matrix

import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test
import org.wizardchat.core.SearchDirection
import org.wizardchat.core.TimestampEvent
import org.wizardchat.core.WizardError

class JumpToDateTest {
    private val utc: ZoneId = ZoneId.of("UTC")

    @Test
    fun startOfDayIsLocalMidnight() {
        val day = LocalDate.of(2026, 11, 12)
        val at = java.time.Instant.ofEpochMilli(JumpToDate.startOfDay(day, utc)).atZone(utc)
        assertEquals(day, at.toLocalDate())
        assertEquals(0, at.hour)
        assertEquals(0, at.minute)
        assertEquals(0, at.second)
    }

    @Test
    fun dayOfRoundTrips() {
        val day = LocalDate.of(2026, 2, 28)
        assertEquals(day, JumpToDate.dayOf(JumpToDate.startOfDay(day, utc), utc))
    }

    @Test
    fun takesTheFirstMessageOnOrAfterTheDate() = runBlocking {
        val asked = mutableListOf<Pair<Long, SearchDirection>>()
        val found = JumpToDate.eventNear(1000) { at, direction ->
            asked += at to direction
            TimestampEvent("\$a", at)
        }
        assertEquals("\$a", found)
        assertEquals(listOf(1000L to SearchDirection.forward), asked)
    }

    @Test
    fun fallsBackToTheClosestEarlierMessage() = runBlocking {
        val asked = mutableListOf<SearchDirection>()
        val found = JumpToDate.eventNear(1000) { _, direction ->
            asked += direction
            if (direction == SearchDirection.backward) TimestampEvent("\$old", 900) else null
        }
        assertEquals("\$old", found)
        assertEquals(listOf(SearchDirection.forward, SearchDirection.backward), asked)
    }

    @Test
    fun anEmptyRoomFindsNothing() = runBlocking {
        assertNull(JumpToDate.eventNear(1000) { _, _ -> null })
    }

    @Test
    fun aRefusedJumpCarriesItsNotice() = runBlocking {
        try {
            JumpToDate.find(LocalDate.of(2026, 11, 12), utc) { _, _ ->
                throw WizardError("unsupportedByServer", "nope")
            }
            fail("expected a refusal")
        } catch (e: JumpToDate.JumpRefused) {
            assertEquals("room.jumpToDate.unsupported", e.noticeKey)
        }
    }

    @Test
    fun anyOtherErrorUsesTheGenericNotice() = runBlocking {
        try {
            JumpToDate.find(LocalDate.of(2026, 11, 12), utc) { _, _ -> throw IllegalStateException("boom") }
            fail("expected a refusal")
        } catch (e: JumpToDate.JumpRefused) {
            assertEquals("room.jumpToDate.failed", e.noticeKey)
        }
    }

    @Test
    fun aCancellationIsNotReportedAsAFailure() = runBlocking {
        try {
            JumpToDate.find(LocalDate.of(2026, 11, 12), utc) { _, _ ->
                withTimeout(1) { delay(1000) }
                null
            }
            fail("expected a cancellation")
        } catch (e: TimeoutCancellationException) {
            // A cancelled jump is silent, not "couldn't jump"
        }
    }
}
