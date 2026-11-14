package org.wizardchat.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Test

/** The frequently used rules, against the web's `useRecentEmoji` */
class RecentEmojiRankingTest {
    private fun entry(emoji: String, total: Long? = null, label: String? = null, url: String? = null) =
        RecentEmoji.Entry(emoji, label, url, total)

    @Test fun mostUsedFirst() {
        val ranked = RecentEmojiRanking.ranked(listOf(entry("a", 2), entry("b", 5), entry("c", 3)))
        assertEquals(listOf("b", "c", "a"), ranked.map { it.emoji })
    }

    @Test fun tiesKeepStoredOrder() {
        val ranked = RecentEmojiRanking.ranked(listOf(entry("x", 1), entry("y", 1), entry("z", 4)))
        assertEquals(listOf("z", "x", "y"), ranked.map { it.emoji })
    }

    @Test fun missingOrZeroCountIsOne() {
        val ranked = RecentEmojiRanking.ranked(listOf(entry("old"), entry("zero", 0), entry("two", 2)))
        assertEquals(listOf("two", "old", "zero"), ranked.map { it.emoji })
        assertEquals(1L, RecentEmojiRanking.count(entry("old")))
    }

    @Test fun shownIsCapped() {
        val many = (1..50).map { entry("e$it", it.toLong()) }
        val ranked = RecentEmojiRanking.ranked(many)
        assertEquals(RecentEmojiRanking.MAX_SHOWN, ranked.size)
        assertEquals("e50", ranked.first().emoji)
    }

    @Test fun useCountsAndStoresFirst() {
        val stored = listOf(entry("a", 3, "a-label"), entry("b", 1))
        val next = RecentEmojiRanking.use(stored, "b", "", null)
        assertEquals(listOf("b", "a"), next.map { it.emoji })
        assertEquals(2L, next.first().total)
    }

    @Test fun useKeepsLabelWhenNoneGiven() {
        val stored = listOf(entry("a", 3, "a-label"))
        val used = RecentEmojiRanking.use(stored, "a", "", null)
        assertEquals(4L, used.first().total)
        assertEquals("a-label", used.first().label)
        val fresh = RecentEmojiRanking.use(stored, "new", "new-label", null)
        assertEquals(1L, fresh.first().total)
        assertEquals("new-label", fresh.first().label)
    }

    @Test fun storeIsCapped() {
        val stored = (1..RecentEmojiRanking.MAX_STORED).map { entry("e$it", 1) }
        val next = RecentEmojiRanking.use(stored, "fresh", "fresh", null)
        assertEquals(RecentEmojiRanking.MAX_STORED, next.size)
        assertEquals("fresh", next.first().emoji)
    }

    @Test fun mergeTakesHigherCountAndKeepsLabel() {
        val current = listOf(entry("a", 2, "A"), entry("b", 1))
        val legacy = listOf(entry("a", 5), entry("b", 4), entry("c", 1))
        val merged = RecentEmojiRanking.merge(current, legacy)
        assertEquals(listOf("a", "b", "c"), merged.map { it.emoji })
        assertEquals(5L, merged[0].total)
        assertEquals("A", merged[0].label)
        assertEquals(4L, merged[1].total)
    }
}
