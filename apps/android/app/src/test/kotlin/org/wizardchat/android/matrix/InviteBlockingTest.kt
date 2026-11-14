package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InviteBlockingTest {
    @Test
    fun picksTheEventTypeTheServerKnows() {
        assertEquals(InviteBlocking.STABLE_TYPE, InviteBlocking.eventType(listOf("org.matrix.msc4380.stable", "org.matrix.msc4380")))
        assertEquals(InviteBlocking.UNSTABLE_TYPE, InviteBlocking.eventType(listOf("org.matrix.msc4380")))
        assertNull(InviteBlocking.eventType(listOf("org.matrix.msc3881")))
    }

    @Test
    fun readsAndWritesTheBlockAction() {
        assertTrue(InviteBlocking.isBlocked(InviteBlocking.content(true)))
        assertFalse(InviteBlocking.isBlocked(InviteBlocking.content(false)))
        assertFalse(InviteBlocking.isBlocked(null))
        assertFalse(InviteBlocking.isBlocked(JsonObject(mapOf("default_action" to JsonPrimitive("allow")))))
        assertEquals(JsonObject(emptyMap()), InviteBlocking.content(false))
    }

    @Test
    fun knowsTheServersRefusal() {
        assertTrue(InviteBlocking.isBlockedError("M_INVITE_BLOCKED"))
        assertTrue(InviteBlocking.isBlockedError("org.matrix.msc4155.invite_blocked"))
        assertFalse(InviteBlocking.isBlockedError("M_FORBIDDEN"))
        assertFalse(InviteBlocking.isBlockedError(null))
    }
}
