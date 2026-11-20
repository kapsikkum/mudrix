package chat.mudrix.android.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EmbedMarkdownTest {
    // The shape of a real X card from embeds.now
    private val xText = "**[Jesse Cohen (@JesseCohenInv)](https://x.com/JesseCohenInv)**\nWhoever made this is a genius\n-# 12 November 2026\n**49K likes · 452 replies**"

    @Test
    fun authorLineIsBoldAndLinked() {
        val lines = EmbedMarkdown.parse(xText)
        assertEquals(4, lines.size)
        assertEquals(listOf(EmbedSpan("Jesse Cohen (@JesseCohenInv)", bold = true, link = "https://x.com/JesseCohenInv")), lines[0].spans)
        assertEquals(listOf(EmbedSpan("Whoever made this is a genius")), lines[1].spans)
        assertFalse(lines[1].small)
        assertEquals("12 November 2026", lines[2].spans.single().text)
        assertTrue(lines[2].small)
        assertEquals(listOf(EmbedSpan("49K likes · 452 replies", bold = true)), lines[3].spans)
    }

    @Test
    fun backslashEscapesAreUnescaped() {
        val line = EmbedMarkdown.parse("That song \\#lowbudgetamanda \\- really \\(sic\\)").single()
        assertEquals("That song #lowbudgetamanda - really (sic)", line.spans.single().text)
    }

    @Test
    fun escapedMarkupIsNotMarkup() {
        val line = EmbedMarkdown.parse("\\*\\*not bold\\*\\* \\[x\\](https://a.com)").single()
        assertEquals("**not bold** [x](https://a.com)", line.spans.single().text)
        assertNull(line.spans.single().link)
    }

    @Test
    fun linkWithParenthesesAndEscapes() {
        val line = EmbedMarkdown.parse("[wiki](https://en.wikipedia.org/wiki/Rust_(language))").single()
        assertEquals("https://en.wikipedia.org/wiki/Rust_(language)", line.spans.single().link)
        val escaped = EmbedMarkdown.parse("[wiki](https://en.wikipedia.org/wiki/Rust_\\(language\\))").single()
        assertEquals("https://en.wikipedia.org/wiki/Rust_(language)", escaped.spans.single().link)
    }

    @Test
    fun onlyHttpsLinksToPublicNamesAreKept() {
        for (url in listOf("javascript:alert(1)", "http://a.com", "https://127.0.0.1/x", "https://localhost/x", "https://u:p@a.com/", "intent://x", "/relative")) {
            val line = EmbedMarkdown.parse("[label]($url)").single()
            assertEquals("label", line.spans.single().text)
            assertNull(url, line.spans.single().link)
        }
        assertTrue(EmbedMarkdown.isSafeLink("https://embeds.now/go/support"))
        assertFalse(EmbedMarkdown.isSafeLink("https://exa mple.com"))
    }

    @Test
    fun unbalancedMarkupStaysText() {
        assertEquals("**open and [broken](", EmbedMarkdown.parse("**open and [broken](").single().spans.single().text)
        assertEquals("a ** b", EmbedMarkdown.parse("a ** b").single().spans.single().text)
    }

    @Test
    fun smallLinesAndBlankLines() {
        val lines = EmbedMarkdown.parse("first\n\n-# small **bold**\n-#nothing")
        assertEquals(3, lines.size)
        assertTrue(lines[1].small)
        assertEquals(listOf(EmbedSpan("small "), EmbedSpan("bold", bold = true)), lines[1].spans)
        assertFalse(lines[2].small)
        assertEquals("-#nothing", lines[2].spans.single().text)
    }

    @Test
    fun boldAroundALinkKeepsBoth() {
        val span = EmbedMarkdown.parse("**[a](https://a.com)**").single().spans.single()
        assertTrue(span.bold)
        assertEquals("https://a.com", span.link)
    }

    @Test
    fun plainTextForAccessibility() {
        assertEquals("Jesse Cohen (@JesseCohenInv)\nWhoever made this is a genius\n12 November 2026\n49K likes · 452 replies", EmbedMarkdown.plain(xText))
    }
}
