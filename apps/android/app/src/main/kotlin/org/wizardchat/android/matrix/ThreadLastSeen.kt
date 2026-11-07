package org.wizardchat.android.matrix

import android.content.Context
import androidx.compose.runtime.mutableStateMapOf
import org.wizardchat.android.WizardApplication
import org.wizardchat.core.ThreadInfo

/**
 * Which threads have been looked at: thread root event id -> the time (milliseconds) up to which its replies were seen. Kept on
 * this device only, like the web's `threadLastSeen`; the web also stores the id of the last reply, which the core's
 * `ThreadInfo` does not carry, so only the time is compared.
 */
object ThreadLastSeen {
    private val seen = mutableStateMapOf<String, Long>()
    private val prefs by lazy { WizardApplication.instance.getSharedPreferences("thread_last_seen", Context.MODE_PRIVATE) }
    private var loaded = false

    private fun load() {
        if (loaded) return
        loaded = true
        prefs.all.forEach { (root, value) -> (value as? Long)?.let { seen[root] = it } }
    }

    /** Marks the replies of [rootEventId] up to [time] as seen */
    fun markSeen(rootEventId: String, time: Long = System.currentTimeMillis()) {
        load()
        if ((seen[rootEventId] ?: 0L) >= time) return
        seen[rootEventId] = time
        prefs.edit().putLong(rootEventId, time).apply()
    }

    /** True when the latest reply is somebody else's and newer than what was seen */
    fun isUnread(info: ThreadInfo, myUserId: String?): Boolean {
        load()
        return isUnread(info.latestSender, info.latestTimestamp, myUserId, seen[info.rootEventId])
    }

    /** The rule, without storage */
    fun isUnread(latestSender: String?, latestTimestamp: Long?, myUserId: String?, seenUpTo: Long?): Boolean {
        if (latestSender == null || latestSender == myUserId) return false
        return (latestTimestamp ?: 0L) > (seenUpTo ?: 0L)
    }
}
