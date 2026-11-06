package org.wizardchat.android.matrix

import android.icu.lang.UCharacter
import android.icu.lang.UProperty
import java.time.LocalDate

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
