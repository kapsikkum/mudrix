package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MutualRoomsTest {
    @Test
    fun readsTheJoinedList() {
        assertEquals(listOf("!a:x", "!b:x"), MutualRoomsLookup.parseJoined("""{"joined":["!a:x","!b:x"]}"""))
    }

    @Test
    fun skipsEntriesThatAreNotIds() {
        assertEquals(listOf("!a:x"), MutualRoomsLookup.parseJoined("""{"joined":["!a:x",3,null]}"""))
    }

    @Test
    fun anythingElseIsNotAnAnswer() {
        assertNull(MutualRoomsLookup.parseJoined("""{"errcode":"M_UNRECOGNIZED"}"""))
        assertNull(MutualRoomsLookup.parseJoined("not json"))
    }
}
