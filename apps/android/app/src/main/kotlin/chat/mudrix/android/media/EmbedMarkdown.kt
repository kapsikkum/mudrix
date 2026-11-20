package chat.mudrix.android.media

import chat.mudrix.android.integrations.IntegrationNetwork
import java.net.URI

/** A run of text with one style; [link] is only ever a safe https address */
data class EmbedSpan(val text: String, val bold: Boolean = false, val link: String? = null)

/** One line of a card; [small] lines (`-# ...`) are drawn small and muted */
data class EmbedLine(val spans: List<EmbedSpan>, val small: Boolean)

/**
 * The Discord markdown subset embeds.now cards use: `**bold**`, `[label](url)`, `-# small line`,
 * newlines and backslash escapes (`\-`, `\(`, `\#`). The text is untrusted: nothing else is
 * interpreted, and a link that is not https to a public name is shown as its plain label.
 */
object EmbedMarkdown {
    fun parse(markdown: String): List<EmbedLine> = markdown.replace("\r\n", "\n").split('\n').mapNotNull { raw ->
        val small = raw.startsWith("-# ")
        val spans = inline(if (small) raw.removePrefix("-# ") else raw, bold = false, depth = 0)
        if (spans.isEmpty()) null else EmbedLine(spans, small)
    }

    /** A link worth opening: https, a public DNS name, no credentials or port */
    fun isSafeLink(raw: String): Boolean {
        val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return false
        if (uri.scheme?.lowercase() != "https" || uri.rawUserInfo != null || uri.port != -1) return false
        val host = uri.host?.lowercase() ?: return false
        return !IntegrationNetwork.isForbiddenHost(host)
    }

    /** The text without any markup, for accessibility labels */
    fun plain(markdown: String): String = parse(markdown).joinToString("\n") { line -> line.spans.joinToString("") { it.text } }

    private const val MAX_DEPTH = 4

    private fun isPunctuation(c: Char) = c in "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"

    private fun unescape(text: String): String {
        val out = StringBuilder()
        var i = 0
        while (i < text.length) {
            if (text[i] == '\\' && i + 1 < text.length && isPunctuation(text[i + 1])) {
                out.append(text[i + 1])
                i += 2
            } else {
                out.append(text[i])
                i++
            }
        }
        return out.toString()
    }

    /** Index of the [close] that ends a group opened just before [from], skipping escapes and nested [open]s; -1 if none */
    private fun matching(text: String, from: Int, open: Char, close: Char): Int {
        var depth = 1
        var i = from
        while (i < text.length) {
            val c = text[i]
            when {
                c == '\\' -> i++
                c == open -> depth++
                c == close -> if (--depth == 0) return i
            }
            i++
        }
        return -1
    }

    private fun closingBold(text: String, from: Int): Int {
        var i = from
        while (i < text.length - 1) {
            if (text[i] == '\\') {
                i += 2
                continue
            }
            if (text[i] == '*' && text[i + 1] == '*') return i
            i++
        }
        return -1
    }

    private fun inline(text: String, bold: Boolean, depth: Int): List<EmbedSpan> {
        val spans = ArrayList<EmbedSpan>()
        val buffer = StringBuilder()
        fun flush() {
            if (buffer.isNotEmpty()) {
                spans += EmbedSpan(buffer.toString(), bold)
                buffer.clear()
            }
        }
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (c == '\\' && i + 1 < text.length && isPunctuation(text[i + 1])) {
                buffer.append(text[i + 1])
                i += 2
                continue
            }
            if (c == '*' && text.startsWith("**", i) && depth < MAX_DEPTH) {
                val end = closingBold(text, i + 2)
                if (end > i + 2) {
                    flush()
                    spans += inline(text.substring(i + 2, end), bold = true, depth = depth + 1)
                    i = end + 2
                    continue
                }
            }
            if (c == '[' && depth < MAX_DEPTH) {
                val labelEnd = matching(text, i + 1, '[', ']')
                if (labelEnd > 0 && text.getOrNull(labelEnd + 1) == '(') {
                    val urlEnd = matching(text, labelEnd + 2, '(', ')')
                    if (urlEnd > 0) {
                        val url = unescape(text.substring(labelEnd + 2, urlEnd)).trim()
                        val label = inline(text.substring(i + 1, labelEnd), bold, depth + 1)
                        flush()
                        val link = url.takeIf(::isSafeLink)
                        spans += label.map { if (link != null) it.copy(link = link) else it }
                        i = urlEnd + 1
                        continue
                    }
                }
            }
            buffer.append(c)
            i++
        }
        flush()
        return merge(spans)
    }

    private fun merge(spans: List<EmbedSpan>): List<EmbedSpan> {
        val out = ArrayList<EmbedSpan>()
        for (span in spans) {
            if (span.text.isEmpty()) continue
            val last = out.lastOrNull()
            if (last != null && last.bold == span.bold && last.link == span.link) out[out.size - 1] = last.copy(text = last.text + span.text) else out += span
        }
        return out
    }
}
