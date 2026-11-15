package chat.mudrix.android.matrix

import chat.mudrix.core.ThreadInfo

/** The Inbox thread list's All / My tabs, as the web's `ThreadListPanel` filter */
enum class ThreadFilter { all, my }

/** Which threads a filter shows, and the labels and empty text that go with it */
object ThreadList {
    val FILTERS = listOf(ThreadFilter.all, ThreadFilter.my)

    fun titleKey(filter: ThreadFilter): String =
        if (filter == ThreadFilter.my) "timeline.threadsMy" else "timeline.threadsAll"

    fun emptyKey(filter: ThreadFilter): String =
        if (filter == ThreadFilter.my) "timeline.threadListEmptyMy" else "timeline.threadListEmpty"

    /**
     * The threads a filter shows, newest first. "My" is the threads you started or wrote in (the core's
     * `participated`), and the order is by the latest reply, falling back to the root's own time.
     */
    fun visible(threads: List<ThreadInfo>, filter: ThreadFilter): List<ThreadInfo> =
        threads
            .filter { filter == ThreadFilter.all || it.participated }
            .sortedByDescending { it.latestTimestamp ?: it.timestamp }
}
