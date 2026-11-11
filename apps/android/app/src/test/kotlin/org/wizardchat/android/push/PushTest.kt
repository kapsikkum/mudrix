package org.wizardchat.android.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushTest {
    private fun parse(json: String) = Push.parsePayload(json.toByteArray())

    @Test
    fun readsTheEventAndRoomOfAGatewayPayload() {
        val data = parse("""{"notification":{"event_id":"${'$'}e","room_id":"!r:x","counts":{"unread":3},"devices":[]}}""")
        assertEquals(mapOf("room_id" to "!r:x", "event_id" to "\$e", "unread" to "3"), data)
    }

    @Test
    fun aClearedBadgeHasOnlyTheCount() {
        assertEquals(mapOf("unread" to "0"), parse("""{"notification":{"counts":{"unread":0}}}"""))
    }

    @Test
    fun otherBytesAreNotANotification() {
        assertNull(parse("not json"))
        assertNull(parse("""{"other":1}"""))
        assertNull(parse("""{"notification":{}}"""))
    }
}
