package org.wizardchat.android.matrix

import org.wizardchat.core.ShieldCode
import org.wizardchat.core.ShieldColor
import org.wizardchat.core.ShieldView

/**
 * How a message's encryption shield looks, as the web app's shield.ts decides it: grey for what can't be
 * guaranteed, a warning for a red SDK shield (unverified sender), and the strongest red for a message
 * sent unencrypted into an encrypted room. Null when the message has no shield.
 */
object Shields {
    enum class Kind { Grey, Warning, Red }

    data class Display(val kind: Kind, val reasonKey: String)

    private val REASON_KEYS = mapOf(
        ShieldCode.authenticityNotGuaranteed to "encryption.shield.authenticity",
        ShieldCode.unknownDevice to "encryption.shield.unknownDevice",
        ShieldCode.unsignedDevice to "encryption.shield.unsignedDevice",
        ShieldCode.unverifiedIdentity to "encryption.shield.unverifiedIdentity",
        ShieldCode.verificationViolation to "encryption.shield.violation",
        ShieldCode.mismatchedSender to "encryption.shield.mismatchedSender",
        ShieldCode.sentInClear to "encryption.shield.sentInClear",
    )

    fun display(shield: ShieldView?): Display? {
        if (shield == null) return null
        val reasonKey = REASON_KEYS[shield.code] ?: "encryption.shield.unknown"
        if (shield.code == ShieldCode.sentInClear) return Display(Kind.Red, reasonKey)
        return Display(if (shield.color == ShieldColor.red) Kind.Warning else Kind.Grey, reasonKey)
    }
}
