package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RoomKeyFilesTest {
    @Test
    fun anEmptyPassphraseIsRefused() {
        assertEquals("settings.roomKeys.passphrase", RoomKeyFiles.exportProblem("", ""))
    }

    @Test
    fun mismatchedPassphrasesAreRefused() {
        assertEquals("settings.roomKeys.passphraseMismatch", RoomKeyFiles.exportProblem("a", "b"))
    }

    @Test
    fun matchingPassphrasesPass() {
        assertNull(RoomKeyFiles.exportProblem("secret", "secret"))
    }

    @Test
    fun importErrorsMapToTheirNotice() {
        assertEquals("settings.roomKeys.error_version", RoomKeyFiles.importErrorKey("Unsupported version 3"))
        assertEquals("settings.roomKeys.error_rounds", RoomKeyFiles.importErrorKey("invalid rounds"))
        assertEquals("settings.roomKeys.error_password", RoomKeyFiles.importErrorKey("MAC mismatch"))
        assertEquals("settings.roomKeys.error_format", RoomKeyFiles.importErrorKey("bad header"))
        assertNull(RoomKeyFiles.importErrorKey("network down"))
        assertNull(RoomKeyFiles.importErrorKey(null))
    }
}
