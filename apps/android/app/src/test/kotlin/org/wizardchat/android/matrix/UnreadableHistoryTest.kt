package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UnreadableHistoryTest {
    @Test
    fun aPageOfMostlyUnreadableMessagesCounts() {
        assertTrue(UnreadableHistory.isUnreadablePage(10, 9))
        assertTrue(UnreadableHistory.isUnreadablePage(10, 10))
        assertFalse(UnreadableHistory.isUnreadablePage(10, 8))
    }

    @Test
    fun anEmptyPageNeverCounts() {
        assertFalse(UnreadableHistory.isUnreadablePage(0, 0))
    }

    @Test
    fun twoUnreadablePagesPause() {
        val history = UnreadableHistory()
        history.record(80, 80)
        assertFalse(history.paused)
        history.record(80, 79)
        assertTrue(history.paused)
        assertEquals(2, UnreadableHistory.PAGES_BEFORE_PAUSE)
    }

    @Test
    fun aReadablePageResumes() {
        val history = UnreadableHistory()
        history.record(80, 80)
        history.record(80, 80)
        history.record(80, 5)
        assertFalse(history.paused)
        history.record(80, 80)
        assertFalse(history.paused)
    }

    @Test
    fun anEmptyPageChangesNothing() {
        val history = UnreadableHistory()
        history.record(80, 80)
        history.record(0, 0)
        history.record(80, 80)
        assertTrue(history.paused)
    }

    @Test
    fun resetClearsThePause() {
        val history = UnreadableHistory()
        history.record(80, 80)
        history.record(80, 80)
        history.reset()
        assertFalse(history.paused)
    }
}
