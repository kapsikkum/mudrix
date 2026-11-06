package org.wizardchat.android.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.wizardchat.android.media.VideoPlan.Choice
import org.wizardchat.android.media.VideoPlan.Mode
import org.wizardchat.android.media.VideoPlan.UploadPrefs

/** [VideoPlan] against values computed by the web planner (`apps/web/src/util/videoPlan.ts`) in node */
class VideoPlanTest {
    private class Expected(val height: Int, val videoBitrate: Long, val estimatedBytes: Double)
    private class Case(val meta: VideoMeta, val target: CompressTarget, val expected: Expected?)

    private val mb = 1024L * 1024

    @Test
    fun plansMatchTheWeb() {
        for (case in CASES) {
            val plan = VideoPlan.planCompression(case.meta, case.target)
            val expected = case.expected
            if (expected == null) {
                assertNull("${case.meta} ${case.target}", plan)
            } else {
                assertEquals("${case.meta} ${case.target}", expected.height, plan?.height)
                assertEquals("${case.meta} ${case.target}", expected.videoBitrate, plan?.videoBitrate)
                assertEquals("${case.meta} ${case.target}", expected.estimatedBytes, plan?.estimatedBytes ?: Double.NaN, 1e-6)
            }
        }
    }

    private val prefs = UploadPrefs(Mode.smart, 720, 50 * mb, 25 * mb)

    @Test
    fun serverLimitCapsTheTarget() {
        assertEquals(14942208L, VideoPlan.smartMaxBytes(prefs, 15 * mb))
        assertEquals(19922944L, VideoPlan.smartMaxBytes(UploadPrefs(Mode.smart, 720, 100 * mb, 25 * mb), 20 * mb))
    }

    @Test
    fun defaultQualityMatchesTheWeb() {
        val original = VideoQuality.Original
        assertEquals(original, VideoPlan.defaultQuality(prefs, 10 * mb, 100 * mb, true))
        assertEquals(VideoQuality.Smart, VideoPlan.defaultQuality(prefs, 30 * mb, 100 * mb, true))
        assertEquals(original, VideoPlan.defaultQuality(UploadPrefs(Mode.original, 720, 50 * mb, 25 * mb), 30 * mb, 100 * mb, true))
        assertEquals(VideoQuality.Smart, VideoPlan.defaultQuality(UploadPrefs(Mode.original, 720, 50 * mb, 25 * mb), 130 * mb, 100 * mb, true))
        assertEquals(VideoQuality.Fixed(720), VideoPlan.defaultQuality(UploadPrefs(Mode.fixed, 720, 50 * mb, 25 * mb), 130 * mb, 100 * mb, true))
        assertEquals(original, VideoPlan.defaultQuality(prefs, 130 * mb, 100 * mb, false))
    }

    @Test
    fun choicesMatchTheWeb() {
        val phone = VideoMeta(600.0, 1920, 1080, 8_000_000.0)
        assertEquals(
            listOf(
                Choice(VideoQuality.Original, 600_000_000),
                Choice(VideoQuality.Smart, 47_185_950),
                Choice(VideoQuality.Fixed(720), 219_600_000),
                Choice(VideoQuality.Fixed(480), 114_600_000),
            ),
            VideoPlan.choices(phone, 600_000_000, prefs, 100 * mb),
        )
        assertEquals(
            listOf(
                Choice(VideoQuality.Original, 100 * mb),
                Choice(VideoQuality.Smart, null),
                Choice(VideoQuality.Fixed(1080), null),
                Choice(VideoQuality.Fixed(720), null),
                Choice(VideoQuality.Fixed(480), null),
            ),
            VideoPlan.choices(null, 100 * mb, UploadPrefs(Mode.fixed, 1080, 50 * mb, 25 * mb), 100 * mb),
        )
        // A clip that already fits has no smart entry
        assertEquals(
            listOf(
                Choice(VideoQuality.Original, 20_000_000),
                Choice(VideoQuality.Fixed(720), 7_320_000),
                Choice(VideoQuality.Fixed(480), 3_820_000),
            ),
            VideoPlan.choices(VideoMeta(20.0, 1920, 1080, 8_000_000.0), 20_000_000, prefs, 100 * mb),
        )
    }

    private companion object {
        val CASES = listOf(
        Case(VideoMeta(60.0, 1920, 1080, 8000000.0), CompressTarget.Smart(26214400L), Expected(720, 3000000L, 23460000.0)),
        Case(VideoMeta(60.0, 1920, 1080, 8000000.0), CompressTarget.Smart(52428800L), Expected(1080, 6000000L, 45960000.0)),
        Case(VideoMeta(60.0, 1920, 1080, 8000000.0), CompressTarget.Smart(104857600L), null),
        Case(VideoMeta(60.0, 1920, 1080, 8000000.0), CompressTarget.Smart(14942208L), Expected(480, 1500000L, 12210000.0)),
        Case(VideoMeta(60.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(1080), Expected(1080, 5000000L, 38460000.0)),
        Case(VideoMeta(60.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(720), Expected(720, 2800000L, 21960000.0)),
        Case(VideoMeta(60.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 11460000.0)),
        Case(VideoMeta(300.0, 1920, 1080, 8000000.0), CompressTarget.Smart(26214400L), Expected(360, 501146L, 23592975.0)),
        Case(VideoMeta(300.0, 1920, 1080, 8000000.0), CompressTarget.Smart(52428800L), Expected(480, 1130291L, 47185912.5)),
        Case(VideoMeta(300.0, 1920, 1080, 8000000.0), CompressTarget.Smart(104857600L), Expected(720, 2388582L, 94371825.0)),
        Case(VideoMeta(300.0, 1920, 1080, 8000000.0), CompressTarget.Smart(14942208L), Expected(360, 230613L, 13447987.5)),
        Case(VideoMeta(300.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(1080), Expected(1080, 5000000L, 192300000.0)),
        Case(VideoMeta(300.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(720), Expected(720, 2800000L, 109800000.0)),
        Case(VideoMeta(300.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 57300000.0)),
        Case(VideoMeta(1200.0, 1920, 1080, 8000000.0), CompressTarget.Smart(26214400L), Expected(360, 150000L, 41700000.0)),
        Case(VideoMeta(1200.0, 1920, 1080, 8000000.0), CompressTarget.Smart(52428800L), Expected(360, 186573L, 47185950.0)),
        Case(VideoMeta(1200.0, 1920, 1080, 8000000.0), CompressTarget.Smart(104857600L), Expected(360, 501146L, 94371900.0)),
        Case(VideoMeta(1200.0, 1920, 1080, 8000000.0), CompressTarget.Smart(14942208L), Expected(360, 150000L, 41700000.0)),
        Case(VideoMeta(1200.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(1080), Expected(1080, 5000000L, 769200000.0)),
        Case(VideoMeta(1200.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(720), Expected(720, 2800000L, 439200000.0)),
        Case(VideoMeta(1200.0, 1920, 1080, 8000000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 229200000.0)),
        Case(VideoMeta(120.0, 1080, 1920, 8000000.0), CompressTarget.Smart(26214400L), Expected(480, 1444864L, 23592960.0)),
        Case(VideoMeta(120.0, 1080, 1920, 8000000.0), CompressTarget.Smart(52428800L), Expected(720, 3000000L, 46920000.0)),
        Case(VideoMeta(120.0, 1080, 1920, 8000000.0), CompressTarget.Smart(104857600L), Expected(1080, 6000000L, 91920000.0)),
        Case(VideoMeta(120.0, 1080, 1920, 8000000.0), CompressTarget.Smart(14942208L), Expected(360, 768532L, 13447980.0)),
        Case(VideoMeta(120.0, 1080, 1920, 8000000.0), CompressTarget.Fixed(1080), Expected(1080, 5000000L, 76920000.0)),
        Case(VideoMeta(120.0, 1080, 1920, 8000000.0), CompressTarget.Fixed(720), Expected(720, 2800000L, 43920000.0)),
        Case(VideoMeta(120.0, 1080, 1920, 8000000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 22920000.0)),
        Case(VideoMeta(600.0, 640, 360, 1000000.0), CompressTarget.Smart(26214400L), Expected(360, 186573L, 23592975.0)),
        Case(VideoMeta(600.0, 640, 360, 1000000.0), CompressTarget.Smart(52428800L), Expected(360, 501146L, 47185950.0)),
        Case(VideoMeta(600.0, 640, 360, 1000000.0), CompressTarget.Smart(104857600L), null),
        Case(VideoMeta(600.0, 640, 360, 1000000.0), CompressTarget.Smart(14942208L), Expected(360, 150000L, 20850000.0)),
        Case(VideoMeta(600.0, 640, 360, 1000000.0), CompressTarget.Fixed(1080), null),
        Case(VideoMeta(600.0, 640, 360, 1000000.0), CompressTarget.Fixed(720), null),
        Case(VideoMeta(600.0, 640, 360, 1000000.0), CompressTarget.Fixed(480), null),
        Case(VideoMeta(30.0, 3840, 2160, 40000000.0), CompressTarget.Smart(26214400L), Expected(1080, 6000000L, 22980000.0)),
        Case(VideoMeta(30.0, 3840, 2160, 40000000.0), CompressTarget.Smart(52428800L), Expected(1080, 6000000L, 22980000.0)),
        Case(VideoMeta(30.0, 3840, 2160, 40000000.0), CompressTarget.Smart(104857600L), Expected(1080, 6000000L, 22980000.0)),
        Case(VideoMeta(30.0, 3840, 2160, 40000000.0), CompressTarget.Smart(14942208L), Expected(720, 3000000L, 11730000.0)),
        Case(VideoMeta(30.0, 3840, 2160, 40000000.0), CompressTarget.Fixed(1080), Expected(1080, 5000000L, 19230000.0)),
        Case(VideoMeta(30.0, 3840, 2160, 40000000.0), CompressTarget.Fixed(720), Expected(720, 2800000L, 10980000.0)),
        Case(VideoMeta(30.0, 3840, 2160, 40000000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 5730000.0)),
        Case(VideoMeta(3600.0, 1280, 720, 2000000.0), CompressTarget.Smart(26214400L), Expected(360, 150000L, 125100000.0)),
        Case(VideoMeta(3600.0, 1280, 720, 2000000.0), CompressTarget.Smart(52428800L), Expected(360, 150000L, 125100000.0)),
        Case(VideoMeta(3600.0, 1280, 720, 2000000.0), CompressTarget.Smart(104857600L), Expected(360, 150000L, 125100000.0)),
        Case(VideoMeta(3600.0, 1280, 720, 2000000.0), CompressTarget.Smart(14942208L), Expected(360, 150000L, 125100000.0)),
        Case(VideoMeta(3600.0, 1280, 720, 2000000.0), CompressTarget.Fixed(1080), null),
        Case(VideoMeta(3600.0, 1280, 720, 2000000.0), CompressTarget.Fixed(720), null),
        Case(VideoMeta(3600.0, 1280, 720, 2000000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 687600000.0)),
        Case(VideoMeta(5400.0, 1920, 1080, 3000000.0), CompressTarget.Smart(26214400L), Expected(360, 150000L, 187650000.0)),
        Case(VideoMeta(5400.0, 1920, 1080, 3000000.0), CompressTarget.Smart(52428800L), Expected(360, 150000L, 187650000.0)),
        Case(VideoMeta(5400.0, 1920, 1080, 3000000.0), CompressTarget.Smart(104857600L), Expected(360, 150000L, 187650000.0)),
        Case(VideoMeta(5400.0, 1920, 1080, 3000000.0), CompressTarget.Smart(14942208L), Expected(360, 150000L, 187650000.0)),
        Case(VideoMeta(5400.0, 1920, 1080, 3000000.0), CompressTarget.Fixed(1080), null),
        Case(VideoMeta(5400.0, 1920, 1080, 3000000.0), CompressTarget.Fixed(720), Expected(720, 2800000L, 1976400000.0)),
        Case(VideoMeta(5400.0, 1920, 1080, 3000000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 1031400000.0)),
        Case(VideoMeta(45.0, 1280, 720, 3500000.0), CompressTarget.Smart(26214400L), null),
        Case(VideoMeta(45.0, 1280, 720, 3500000.0), CompressTarget.Smart(52428800L), null),
        Case(VideoMeta(45.0, 1280, 720, 3500000.0), CompressTarget.Smart(104857600L), null),
        Case(VideoMeta(45.0, 1280, 720, 3500000.0), CompressTarget.Smart(14942208L), Expected(720, 2262753L, 13447985.625)),
        Case(VideoMeta(45.0, 1280, 720, 3500000.0), CompressTarget.Fixed(1080), null),
        Case(VideoMeta(45.0, 1280, 720, 3500000.0), CompressTarget.Fixed(720), null),
        Case(VideoMeta(45.0, 1280, 720, 3500000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 8595000.0)),
        Case(VideoMeta(90.0, 854, 480, 100000.0), CompressTarget.Smart(26214400L), null),
        Case(VideoMeta(90.0, 854, 480, 100000.0), CompressTarget.Smart(52428800L), null),
        Case(VideoMeta(90.0, 854, 480, 100000.0), CompressTarget.Smart(104857600L), null),
        Case(VideoMeta(90.0, 854, 480, 100000.0), CompressTarget.Smart(14942208L), null),
        Case(VideoMeta(90.0, 854, 480, 100000.0), CompressTarget.Fixed(1080), null),
        Case(VideoMeta(90.0, 854, 480, 100000.0), CompressTarget.Fixed(720), null),
        Case(VideoMeta(90.0, 854, 480, 100000.0), CompressTarget.Fixed(480), null),
        Case(VideoMeta(10.0, 1920, 1080, 0.0), CompressTarget.Smart(26214400L), null),
        Case(VideoMeta(10.0, 1920, 1080, 0.0), CompressTarget.Smart(52428800L), null),
        Case(VideoMeta(10.0, 1920, 1080, 0.0), CompressTarget.Smart(104857600L), null),
        Case(VideoMeta(10.0, 1920, 1080, 0.0), CompressTarget.Smart(14942208L), null),
        Case(VideoMeta(10.0, 1920, 1080, 0.0), CompressTarget.Fixed(1080), null),
        Case(VideoMeta(10.0, 1920, 1080, 0.0), CompressTarget.Fixed(720), Expected(720, 2800000L, 3660000.0)),
        Case(VideoMeta(10.0, 1920, 1080, 0.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 1910000.0)),
        Case(VideoMeta(600.0, 320, 240, 600000.0), CompressTarget.Smart(26214400L), Expected(240, 186573L, 23592975.0)),
        Case(VideoMeta(600.0, 320, 240, 600000.0), CompressTarget.Smart(52428800L), null),
        Case(VideoMeta(600.0, 320, 240, 600000.0), CompressTarget.Smart(104857600L), null),
        Case(VideoMeta(600.0, 320, 240, 600000.0), CompressTarget.Smart(14942208L), Expected(240, 150000L, 20850000.0)),
        Case(VideoMeta(600.0, 320, 240, 600000.0), CompressTarget.Fixed(1080), null),
        Case(VideoMeta(600.0, 320, 240, 600000.0), CompressTarget.Fixed(720), null),
        Case(VideoMeta(600.0, 320, 240, 600000.0), CompressTarget.Fixed(480), null),
        Case(VideoMeta(7200.0, 1920, 1080, 12345678.9), CompressTarget.Smart(26214400L), Expected(360, 150000L, 250200000.0)),
        Case(VideoMeta(7200.0, 1920, 1080, 12345678.9), CompressTarget.Smart(52428800L), Expected(360, 150000L, 250200000.0)),
        Case(VideoMeta(7200.0, 1920, 1080, 12345678.9), CompressTarget.Smart(104857600L), Expected(360, 150000L, 250200000.0)),
        Case(VideoMeta(7200.0, 1920, 1080, 12345678.9), CompressTarget.Smart(14942208L), Expected(360, 150000L, 250200000.0)),
        Case(VideoMeta(7200.0, 1920, 1080, 12345678.9), CompressTarget.Fixed(1080), Expected(1080, 5000000L, 4615200000.0)),
        Case(VideoMeta(7200.0, 1920, 1080, 12345678.9), CompressTarget.Fixed(720), Expected(720, 2800000L, 2635200000.0)),
        Case(VideoMeta(7200.0, 1920, 1080, 12345678.9), CompressTarget.Fixed(480), Expected(480, 1400000L, 1375200000.0)),
        Case(VideoMeta(37.3, 2560, 1440, 20000000.0), CompressTarget.Smart(26214400L), Expected(1080, 4932152L, 23592958.7)),
        Case(VideoMeta(37.3, 2560, 1440, 20000000.0), CompressTarget.Smart(52428800L), Expected(1080, 6000000L, 28571799.999999996)),
        Case(VideoMeta(37.3, 2560, 1440, 20000000.0), CompressTarget.Smart(104857600L), null),
        Case(VideoMeta(37.3, 2560, 1440, 20000000.0), CompressTarget.Smart(14942208L), Expected(720, 2756287L, 13447988.1375)),
        Case(VideoMeta(37.3, 2560, 1440, 20000000.0), CompressTarget.Fixed(1080), Expected(1080, 5000000L, 23909300.0)),
        Case(VideoMeta(37.3, 2560, 1440, 20000000.0), CompressTarget.Fixed(720), Expected(720, 2800000L, 13651799.999999998)),
        Case(VideoMeta(37.3, 2560, 1440, 20000000.0), CompressTarget.Fixed(480), Expected(480, 1400000L, 7124299.999999999)),

        )
    }
}
