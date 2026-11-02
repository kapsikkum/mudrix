package org.wizardchat.android.ui.room

import android.net.Uri
import android.text.format.DateFormat
import android.text.format.Formatter
import android.util.Patterns
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import org.wizardchat.android.WizardApplication

/** Links and spoilers in message text */
object MessageText {
    private data class Match(val start: Int, val end: Int, val url: String)

    private fun links(text: String): List<Match> {
        val matcher = Patterns.WEB_URL.matcher(text)
        val result = mutableListOf<Match>()
        while (matcher.find()) {
            val raw = matcher.group()
            // Plain words with a dot ("e.g") aren't links; only a scheme or a host-like shape counts
            val url = if (raw.contains("://")) raw else if (raw.contains('.') && !raw.startsWith(".")) "https://$raw" else continue
            if (!raw.contains("://") && text.getOrNull(matcher.start() - 1) == '@') continue
            result += Match(matcher.start(), matcher.end(), url)
        }
        return result
    }

    /**
     * The text with tappable links (shortened to their host when [prettifyLinks] is on) and
     * [spoilers] covered by [cover] (their links removed).
     */
    fun attributed(
        text: String,
        prettifyLinks: Boolean,
        linkColor: Color,
        spoilers: List<String> = emptyList(),
        cover: Color = Color.Unspecified,
    ): AnnotatedString {
        val parts = mutableListOf<Pair<String, String?>>()
        var cursor = 0
        for (match in links(text)) {
            if (match.start > cursor) parts += text.substring(cursor, match.start) to null
            val original = text.substring(match.start, match.end)
            parts += (if (prettifyLinks) prettified(match.url) ?: original else original) to match.url
            cursor = match.end
        }
        if (cursor < text.length) parts += text.substring(cursor) to null
        val shown = parts.joinToString("") { it.first }
        val hidden = spoilerRanges(shown, spoilers)
        return buildAnnotatedString {
            var offset = 0
            for ((part, url) in parts) {
                val range = offset until offset + part.length
                if (url != null && hidden.none { it.first < range.last + 1 && range.first < it.last + 1 }) {
                    pushLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = linkColor))))
                    append(part)
                    pop()
                } else {
                    append(part)
                }
                offset += part.length
            }
            for (range in hidden) {
                addStyle(SpanStyle(color = Color.Transparent, background = cover), range.first, range.last + 1)
            }
        }
    }

    private fun spoilerRanges(text: String, spoilers: List<String>): List<IntRange> {
        val ranges = mutableListOf<IntRange>()
        for (spoiler in spoilers) {
            if (spoiler.isEmpty()) continue
            var start = text.indexOf(spoiler)
            while (start >= 0) {
                ranges += start until start + spoiler.length
                start = text.indexOf(spoiler, start + spoiler.length)
            }
        }
        return ranges
    }

    private fun prettified(url: String): String? {
        val uri = Uri.parse(url)
        if (uri.scheme != "http" && uri.scheme != "https") return null
        return uri.host?.removePrefix("www.")
    }

    /** The first http(s) link that isn't a matrix.to link, for the link preview */
    fun firstPreviewURL(text: String): String? = links(text).map { it.url }.firstOrNull { url ->
        val uri = Uri.parse(url)
        (uri.scheme?.lowercase() == "http" || uri.scheme?.lowercase() == "https") && uri.host?.lowercase() != "matrix.to"
    }

    fun allWebURLs(text: String): List<String> = links(text).map { it.url }.filter {
        val scheme = Uri.parse(it).scheme?.lowercase()
        scheme == "http" || scheme == "https"
    }
}

/** Long-pressing anything inside a message opens its menu; media taps use it so they don't swallow it */
internal val LocalMessageLongPress = compositionLocalOf<(() -> Unit)?> { null }

/** Plays GIFs in previews regardless of the autoplay setting */
internal val LocalAnimatesMedia = compositionLocalOf { false }

internal object Formats {
    private val zone get() = ZoneId.systemDefault()
    private val locale get() = Locale.getDefault()

    fun time(instant: Instant): String =
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(instant.atZone(zone))

    fun abbreviatedDate(instant: Instant): String =
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(instant.atZone(zone))

    fun abbreviatedDateTime(instant: Instant): String =
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale).format(instant.atZone(zone))

    /** "October 31, 2026" */
    fun longDate(instant: Instant): String =
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, "MMMMdy"), locale).format(instant.atZone(zone))

    fun isToday(instant: Instant): Boolean = instant.atZone(zone).toLocalDate() == LocalDate.now(zone)

    fun isYesterday(instant: Instant): Boolean = instant.atZone(zone).toLocalDate() == LocalDate.now(zone).minusDays(1)

    /** "1:05" */
    fun duration(seconds: Double): String {
        val total = seconds.toLong()
        val hours = total / 3600
        val minutes = (total % 3600) / 60
        val secs = total % 60
        return if (hours > 0) String.format(locale, "%d:%02d:%02d", hours, minutes, secs) else String.format(locale, "%d:%02d", minutes, secs)
    }

    fun fileSize(bytes: Long): String = Formatter.formatShortFileSize(WizardApplication.instance, bytes)
}
