package org.wizardchat.android.matrix.rtc

/** The call timer's text: `m:ss`, or `h:mm:ss` from an hour on; `formatElapsed` of the web's room list */
object CallTimer {
    fun format(elapsedMs: Long): String {
        val total = (elapsedMs / 1000).coerceAtLeast(0)
        val hours = total / 3600
        val minutes = (total % 3600) / 60
        val seconds = "%02d".format(total % 60)
        return if (hours > 0) "$hours:${"%02d".format(minutes)}:$seconds" else "$minutes:$seconds"
    }
}
