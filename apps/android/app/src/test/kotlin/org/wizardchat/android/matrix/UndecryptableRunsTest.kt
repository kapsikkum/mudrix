package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UndecryptableRunsTest {
    @Test
    fun `runs are counted and the oldest of each is marked`() {
        val runs = UndecryptableRuns.compute(listOf(true, true, true, false, true, false, true, true))
        assertEquals(UndecryptableRuns.Run(3, true), runs[0])
        assertEquals(UndecryptableRuns.Run(3, false), runs[1])
        assertEquals(UndecryptableRuns.Run(3, false), runs[2])
        assertNull(runs[3])
        assertEquals(UndecryptableRuns.Run(1, true), runs[4])
        assertNull(runs[5])
        assertEquals(UndecryptableRuns.Run(2, true), runs[6])
        assertEquals(UndecryptableRuns.Run(2, false), runs[7])
    }

    @Test
    fun `nothing unreadable has no runs`() {
        assertEquals(listOf<UndecryptableRuns.Run?>(null, null), UndecryptableRuns.compute(listOf(false, false)))
        assertEquals(emptyList<UndecryptableRuns.Run?>(), UndecryptableRuns.compute(emptyList()))
    }

    @Test
    fun `help depends on the reason, then on verification, then on the backup`() {
        fun kind(reason: String?, verified: Boolean) = UndecryptableRuns.helpKind(reason, verified)
        assertEquals(UndecryptableRuns.HelpKind.notJoined, kind("sentBeforeWeJoined", false))
        assertEquals(UndecryptableRuns.HelpKind.withheld, kind("withheldBySender", true))
        assertEquals(UndecryptableRuns.HelpKind.senderUntrusted, kind("verificationViolation", true))
        assertEquals(UndecryptableRuns.HelpKind.senderUntrusted, kind("unsignedDevice", false))
        assertEquals(UndecryptableRuns.HelpKind.senderUntrusted, kind("unknownDevice", true))
        assertEquals(UndecryptableRuns.HelpKind.unverified, kind("historicalMessageAndBackupIsDisabled", false))
        assertEquals(UndecryptableRuns.HelpKind.unverified, kind(null, false))
        assertEquals(UndecryptableRuns.HelpKind.noBackup, kind("historicalMessageAndBackupIsDisabled", true))
        assertEquals(UndecryptableRuns.HelpKind.waiting, kind("historicalMessageAndDeviceIsUnverified", true))
        assertEquals(UndecryptableRuns.HelpKind.waiting, kind(null, true))
    }
}
