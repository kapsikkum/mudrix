package org.wizardchat.android.ui.home

import org.junit.Assert.assertEquals
import org.junit.Test

class HomeWelcomeTest {
    @Test
    fun highlightsTakeOnlyTheFirstSectionAndStripMarkup() {
        val notes = """
            ## New
            - **Bold** thing with a [link](https://example.com)
            * `code` item
            ## Fixes
            - not shown
        """.trimIndent()
        assertEquals(listOf("Bold thing with a link", "code item"), noteHighlights(notes))
    }

    @Test
    fun highlightsStopAtTheLimit() {
        val notes = (1..9).joinToString("\n") { "- item $it" }
        assertEquals(4, noteHighlights(notes).size)
        assertEquals(2, noteHighlights(notes, 2).size)
    }
}
