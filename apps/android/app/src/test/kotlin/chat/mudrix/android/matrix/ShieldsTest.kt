package chat.mudrix.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import chat.mudrix.core.ShieldCode
import chat.mudrix.core.ShieldColor
import chat.mudrix.core.ShieldView

class ShieldsTest {
    private fun shield(color: ShieldColor, code: ShieldCode) = ShieldView(color = color, code = code)

    @Test
    fun aVerifiedMessageHasNoShield() {
        assertNull(Shields.display(null))
    }

    @Test
    fun sentInClearIsAlwaysRed() {
        val display = Shields.display(shield(ShieldColor.grey, ShieldCode.sentInClear))
        assertEquals(Shields.Kind.Red, display?.kind)
        assertEquals("encryption.shield.sentInClear", display?.reasonKey)
    }

    @Test
    fun aRedSdkShieldIsAWarning() {
        val display = Shields.display(shield(ShieldColor.red, ShieldCode.unverifiedIdentity))
        assertEquals(Shields.Kind.Warning, display?.kind)
        assertEquals("encryption.shield.unverifiedIdentity", display?.reasonKey)
    }

    @Test
    fun aGreySdkShieldIsQuiet() {
        val display = Shields.display(shield(ShieldColor.grey, ShieldCode.unknownDevice))
        assertEquals(Shields.Kind.Grey, display?.kind)
        assertEquals("encryption.shield.unknownDevice", display?.reasonKey)
    }

    @Test
    fun everyCodeHasItsOwnReason() {
        val keys = ShieldCode.entries.map { code ->
            Shields.display(shield(ShieldColor.red, code))?.reasonKey ?: error("no reason for $code")
        }
        assertEquals(ShieldCode.entries.size, keys.toSet().size)
    }

    @Test
    fun aRedShieldOnACleanCodeIsStillAWarning() {
        val display = Shields.display(shield(ShieldColor.red, ShieldCode.authenticityNotGuaranteed))
        assertEquals(Shields.Kind.Warning, display?.kind)
        assertEquals("encryption.shield.authenticity", display?.reasonKey)
    }

    @Test
    fun theBubbleLayoutOnlyShowsRealWarnings() {
        // A grey shield means "cannot vouch for that device", which the room already says: no per-message icon
        assertNull(Shields.bubbleWarning(Shields.display(shield(ShieldColor.grey, ShieldCode.unknownDevice))))
        assertNull(Shields.bubbleWarning(null))
        assertEquals(
            Shields.Kind.Warning,
            Shields.bubbleWarning(Shields.display(shield(ShieldColor.red, ShieldCode.unverifiedIdentity)))?.kind,
        )
        assertEquals(
            Shields.Kind.Red,
            Shields.bubbleWarning(Shields.display(shield(ShieldColor.grey, ShieldCode.sentInClear)))?.kind,
        )
    }
}
