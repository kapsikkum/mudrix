package chat.mudrix.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Test
import chat.mudrix.core.ThreadInfo

class ThreadListTest {
    private fun thread(root: String, participated: Boolean, latest: Long?, root_ts: Long) = ThreadInfo(
        rootEventId = root,
        sender = "@a:example.org",
        body = root,
        timestamp = root_ts,
        replies = 1,
        latestTimestamp = latest,
        participated = participated,
    )

    private val all = listOf(
        thread("a", participated = true, latest = 300, root_ts = 100),
        thread("b", participated = false, latest = 500, root_ts = 400),
        thread("c", participated = true, latest = null, root_ts = 200),
    )

    @Test
    fun allShowsEveryThreadNewestFirst() {
        assertEquals(listOf("b", "a", "c"), ThreadList.visible(all, ThreadFilter.all).map { it.rootEventId })
    }

    @Test
    fun myKeepsOnlyThreadsYouWroteIn() {
        assertEquals(listOf("a", "c"), ThreadList.visible(all, ThreadFilter.my).map { it.rootEventId })
    }

    @Test
    fun aThreadWithNoReplyYetSortsByItsRoot() {
        val sorted = ThreadList.visible(listOf(thread("old", true, null, 10), thread("new", true, null, 20)), ThreadFilter.all)
        assertEquals(listOf("new", "old"), sorted.map { it.rootEventId })
    }

    @Test
    fun eachFilterHasItsOwnLabels() {
        assertEquals("timeline.threadsAll", ThreadList.titleKey(ThreadFilter.all))
        assertEquals("timeline.threadsMy", ThreadList.titleKey(ThreadFilter.my))
        assertEquals("timeline.threadListEmpty", ThreadList.emptyKey(ThreadFilter.all))
        assertEquals("timeline.threadListEmptyMy", ThreadList.emptyKey(ThreadFilter.my))
        assertEquals(listOf(ThreadFilter.all, ThreadFilter.my), ThreadList.FILTERS)
    }
}
