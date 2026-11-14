package org.wizardchat.android.ui.settings

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.core.EncryptionStatus
import org.wizardchat.core.ServerFeatures

class DeveloperToolsTest {
    @Test
    fun debugInfoListsTheStateButNoSecrets() {
        val text = debugInfo(
            "@a:x", "DEV", "https://x", "26.1.0", "running", 3, 1,
            EncryptionStatus("enabled", true, true, true),
            ServerFeatures(listOf("v1.11", "v1.12"), listOf("org.matrix.msc4380")),
        )
        assertTrue(text.contains("User ID: @a:x"))
        assertTrue(text.contains("Rooms: 3 joined, 1 invited"))
        assertTrue(text.contains("Spec versions: v1.11, v1.12"))
        assertTrue(text.contains("Key backup: true"))
        assertFalse(text.contains("token", ignoreCase = true))
    }

    @Test
    fun missingPartsAreLeftOut() {
        val text = debugInfo(null, null, null, "1", "idle", 0, 0, null, null)
        assertTrue(text.contains("User ID: -"))
        assertFalse(text.contains("Cross-signing"))
        assertFalse(text.contains("Spec versions"))
    }
}
