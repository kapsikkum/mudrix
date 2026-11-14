package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AloneTrackerTest {
    private val ringing = CallManager.RingState.ringing

    @Test
    fun nothingHappensWhileTheOtherPersonIsThere() {
        val t = AloneTracker()
        t.update(true, true, 1, null, 0)
        assertEquals(AloneTracker.Phase.Idle, t.phase)
    }

    @Test
    fun aloneAfterSomeoneLeftWaitsThenCountsDownThenEnds() {
        val t = AloneTracker(graceMs = 10, countdownMs = 60)
        t.update(true, true, 1, null, 0)
        t.update(true, true, 0, null, 100)
        assertEquals(AloneTracker.Phase.Waiting(110), t.phase)
        assertFalse(t.tick(105))
        assertFalse(t.tick(110))
        assertEquals(AloneTracker.Phase.Counting(170), t.phase)
        assertFalse(t.tick(169))
        assertTrue(t.tick(170))
        assertEquals(AloneTracker.Phase.Idle, t.phase)
    }

    @Test
    fun neverHavingHadCompanyAndStillRingingIsFine() {
        val t = AloneTracker()
        t.update(true, true, 0, ringing, 0)
        assertEquals(AloneTracker.Phase.Idle, t.phase)
        t.update(true, true, 0, null, 5)
        assertEquals(AloneTracker.Phase.Idle, t.phase)
    }

    @Test
    fun anUnansweredCallCountsAsAlone() {
        val t = AloneTracker()
        t.update(true, true, 0, CallManager.RingState.unanswered, 0)
        assertTrue(t.phase is AloneTracker.Phase.Waiting)
    }

    @Test
    fun stayingSilencesUntilSomeoneJoins() {
        val t = AloneTracker(graceMs = 10, countdownMs = 60)
        t.update(true, true, 1, null, 0)
        t.update(true, true, 0, null, 1)
        t.tick(20)
        t.stay()
        t.update(true, true, 0, null, 30)
        assertEquals(AloneTracker.Phase.Idle, t.phase)
        t.update(true, true, 1, null, 40)
        t.update(true, true, 0, null, 50)
        assertTrue(t.phase is AloneTracker.Phase.Waiting)
    }

    @Test
    fun groupCallsAndUnjoinedCallsNeverNotify() {
        val t = AloneTracker()
        t.update(false, true, 0, null, 0)
        assertEquals(AloneTracker.Phase.Idle, t.phase)
        t.update(true, false, 0, null, 0)
        assertEquals(AloneTracker.Phase.Idle, t.phase)
    }

    @Test
    fun secondsLeftRoundsUp() {
        val t = AloneTracker(graceMs = 0, countdownMs = 60_000)
        t.update(true, true, 1, null, 0)
        t.update(true, true, 0, null, 0)
        t.tick(0)
        assertEquals(60, t.secondsLeft(0))
        assertEquals(1, t.secondsLeft(59_500))
    }
}
