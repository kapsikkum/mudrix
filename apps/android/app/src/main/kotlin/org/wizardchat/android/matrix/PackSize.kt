package org.wizardchat.android.matrix

import java.util.Locale
import kotlinx.serialization.json.JsonObject

/** How big a pack's state event may get and when the editor warns, the same numbers as the web's `packSize.ts` */
object PackSize {
    /** Matrix caps a whole event at 65,536 bytes of canonical JSON */
    const val EVENT_CAP_BYTES = 65536
    /** What the pack content may take, leaving room for the envelope */
    const val BUDGET_BYTES = 60 * 1024
    /** The meter warns from this share of the budget */
    const val WARN_RATIO = 0.8

    /** How a pack's size stands against its limit */
    enum class Level { Ok, Near, Over }

    /** The bytes of the pack content as UTF-8 JSON, which is what the server counts */
    fun contentBytes(content: JsonObject): Int = content.toString().toByteArray(Charsets.UTF_8).size

    /** Where [bytes] stands against [cap] */
    fun level(bytes: Int, cap: Int = BUDGET_BYTES): Level = when {
        bytes > cap -> Level.Over
        bytes > cap * WARN_RATIO -> Level.Near
        else -> Level.Ok
    }

    /** One decimal under 10 KB and whole kilobytes above, like the web's `formatKb` */
    fun formatKb(bytes: Int): String =
        if (bytes < 10 * 1024) String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0)
        else String.format(Locale.ROOT, "%.0f KB", bytes / 1024.0)
}
