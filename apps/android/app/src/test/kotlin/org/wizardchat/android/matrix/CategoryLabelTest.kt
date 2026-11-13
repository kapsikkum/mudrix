package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Test

class CategoryLabelTest {
    @Test
    fun usesNameFirst() {
        assertEquals("Games", categoryHeader("Games", "#games:vore.party", "Rooms"))
    }

    @Test
    fun fallsBackToCanonicalAlias() {
        assertEquals("#games:vore.party", categoryHeader(null, "#games:vore.party", "Rooms"))
        assertEquals("#games:vore.party", categoryHeader("  ", "#games:vore.party", "Rooms"))
    }

    @Test
    fun fallsBackToGenericNeverRawId() {
        assertEquals("Rooms", categoryHeader(null, null, "Rooms"))
        assertEquals("Rooms", categoryHeader("", "", "Rooms"))
    }
}
