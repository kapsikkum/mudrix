package org.wizardchat.android.matrix

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EmoticonsTest {
    @Test
    fun replacesWholeEmoticons() {
        assertEquals("hi 🙂", Emoticons.replaceInText("hi :)"))
        assertEquals("❤️ you!", Emoticons.replaceInText("<3 you!"))
        assertEquals("💔.", Emoticons.replaceInText("</3."))
    }

    @Test
    fun leavesEmoticonsInsideWordsAndLinksAlone() {
        assertEquals("http://x and a:D", Emoticons.replaceInText("http://x and a:D"))
    }

    @Test
    fun skipsInlineCodeAndFences() {
        assertEquals("`:)` 🙂", Emoticons.replaceInText("`:)` :)"))
        assertEquals("```\n:)\n```\n🙂", Emoticons.replaceInMessage("```\n:)\n```\n:)"))
    }

    @Test
    fun numericDatesFollowTheSetting() {
        val date = LocalDate.of(2026, 3, 7)
        assertEquals("07/03/2026", DisplayFormats.numericDate(date, DateFormatStyle.dmy))
        assertEquals("03/07/2026", DisplayFormats.numericDate(date, DateFormatStyle.mdy))
        assertEquals("2026-03-07", DisplayFormats.numericDate(date, DateFormatStyle.ymd))
        assertNull(DisplayFormats.numericDate(date, DateFormatStyle.long))
    }
}
