package chat.mudrix.android.matrix

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** [StreamerSignals]: the system's screen recording states */
class StreamerSignalsTest {
    @Test
    fun onlyTheVisibleStateIsRecording() {
        assertTrue(StreamerSignals.recordingFrom(1))
        assertFalse(StreamerSignals.recordingFrom(0))
        assertFalse(StreamerSignals.recordingFrom(2))
    }
}
