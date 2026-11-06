package org.wizardchat.android.matrix

/**
 * Mudrix's namespace for custom Matrix event types, account data, room state and call data
 * topics; the same names as `apps/web/src/util/namespace.ts`.
 *
 * Two older families are still read so existing data keeps working: `chat.mudrix.*` (earlier
 * Mudrix versions) and `org.wizardchat.*` (the WizardChat base). Only the current name is
 * written, except where another device may still need an older one (settings).
 */
object Namespace {
    const val MUDRIX = "io.github.kapsikkum.mudrix"
    private const val LEGACY_MUDRIX = "chat.mudrix"
    private const val WIZARDCHAT = "org.wizardchat"

    /** The current name of a Mudrix type or key */
    fun mudrixKey(name: String) = "$MUDRIX.$name"

    /** The name earlier Mudrix versions used for it */
    fun legacyMudrixKey(name: String) = "$LEGACY_MUDRIX.$name"

    /** The name WizardChat used for it */
    fun wizardchatKey(name: String) = "$WIZARDCHAT.$name"
}
