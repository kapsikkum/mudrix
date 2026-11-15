package chat.mudrix.android.matrix

import android.icu.lang.UCharacter
import android.icu.lang.UProperty
import java.time.LocalDate

/** How a thread list row's time is written: the web's relative labels, or the date after a week */
sealed interface TimeAgo {
    data object Now : TimeAgo
    data class Minutes(val value: Long) : TimeAgo
    data class Hours(val value: Long) : TimeAgo
    data class Days(val value: Long) : TimeAgo

    /** A week old or more: the row shows the date instead */
    data object Old : TimeAgo
}

/** The date, time and emoji display choices of the web's `util/format.ts` and `isRenderedEmojiOnly` */
object DisplayFormats {
    /** `dd/mm/yyyy`, `mm/dd/yyyy` or `yyyy-mm-dd`; null for the long, localised form */
    fun numericDate(date: LocalDate, style: DateFormatStyle): String? {
        val d = "%02d".format(date.dayOfMonth)
        val m = "%02d".format(date.monthValue)
        val y = date.year
        return when (style) {
            DateFormatStyle.long -> null
            DateFormatStyle.dmy -> "$d/$m/$y"
            DateFormatStyle.mdy -> "$m/$d/$y"
            DateFormatStyle.ymd -> "$y-$m-$d"
        }
    }

    /**
     * A thread list row's age, with the web `ThreadListPanel`'s boundaries: under a minute is "now",
     * then minutes, hours and days, and anything a week old or more is shown as a date. Future
     * timestamps (a clock that is off) count as now.
     */
    fun timeAgo(timestamp: Long, now: Long): TimeAgo {
        val diff = (now - timestamp).coerceAtLeast(0L)
        val minutes = diff / 60_000L
        val hours = diff / 3_600_000L
        val days = diff / 86_400_000L
        return when {
            minutes < 1 -> TimeAgo.Now
            minutes < 60 -> TimeAgo.Minutes(minutes)
            hours < 24 -> TimeAgo.Hours(hours)
            days < 7 -> TimeAgo.Days(days)
            else -> TimeAgo.Old
        }
    }

    /**
     * Whether a message is only emoji (and spaces), which are then shown larger. Like the web, every
     * character has to be drawn as an emoji by default, so `❤️` (text by default) does not count.
     */
    fun isOnlyEmoji(text: String): Boolean {
        var hasContent = false
        var index = 0
        while (index < text.length) {
            val codePoint = text.codePointAt(index)
            index += Character.charCount(codePoint)
            if (Character.isWhitespace(codePoint)) continue
            if (!UCharacter.hasBinaryProperty(codePoint, UProperty.EMOJI_PRESENTATION)) return false
            hasContent = true
        }
        return hasContent
    }
}
