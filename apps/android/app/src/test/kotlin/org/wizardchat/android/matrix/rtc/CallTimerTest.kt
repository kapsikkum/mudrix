package org.wizardchat.android.matrix.rtc

import org.junit.Assert.assertEquals
import org.junit.Test

class CallTimerTest {
    @Test
    fun formatsLikeTheWeb() {
        assertEquals("0:00", CallTimer.format(0))
        assertEquals("0:00", CallTimer.format(-5000))
        assertEquals("0:59", CallTimer.format(59_999))
        assertEquals("1:05", CallTimer.format(65_000))
        assertEquals("59:59", CallTimer.format(3_599_000))
        assertEquals("1:00:00", CallTimer.format(3_600_000))
        assertEquals("12:03:07", CallTimer.format(12 * 3_600_000L + 3 * 60_000 + 7_000))
    }
}
