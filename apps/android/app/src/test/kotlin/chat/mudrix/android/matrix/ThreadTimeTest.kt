package chat.mudrix.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Test

/** The thread list's time labels, with the web `ThreadListPanel`'s boundaries */
class ThreadTimeTest {
    private val now = 1_800_000_000_000L

    @Test
    fun underAMinuteIsNow() {
        assertEquals(TimeAgo.Now, DisplayFormats.timeAgo(now, now))
        assertEquals(TimeAgo.Now, DisplayFormats.timeAgo(now - 59_999, now))
    }

    @Test
    fun thenMinutesUpToAnHour() {
        assertEquals(TimeAgo.Minutes(1), DisplayFormats.timeAgo(now - 60_000, now))
        assertEquals(TimeAgo.Minutes(59), DisplayFormats.timeAgo(now - 59 * 60_000L, now))
    }

    @Test
    fun thenHoursUpToADay() {
        assertEquals(TimeAgo.Hours(1), DisplayFormats.timeAgo(now - 3_600_000, now))
        assertEquals(TimeAgo.Hours(23), DisplayFormats.timeAgo(now - 23 * 3_600_000L, now))
    }

    @Test
    fun thenDaysUpToAWeek() {
        assertEquals(TimeAgo.Days(1), DisplayFormats.timeAgo(now - 86_400_000, now))
        assertEquals(TimeAgo.Days(6), DisplayFormats.timeAgo(now - 6 * 86_400_000L, now))
    }

    @Test
    fun aWeekOrMoreIsADate() {
        assertEquals(TimeAgo.Old, DisplayFormats.timeAgo(now - 7 * 86_400_000L, now))
        assertEquals(TimeAgo.Old, DisplayFormats.timeAgo(now - 400 * 86_400_000L, now))
    }

    @Test
    fun aClockThatIsAheadCountsAsNow() {
        assertEquals(TimeAgo.Now, DisplayFormats.timeAgo(now + 60_000, now))
    }
}
