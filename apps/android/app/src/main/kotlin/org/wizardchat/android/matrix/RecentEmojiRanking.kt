package org.wizardchat.android.matrix

/**
 * Element's frequently used emoji: each emoji has a use count and the most used are offered first.
 * Pure, so it matches the web's `useRecentEmoji` and can be tested without an account.
 */
object RecentEmojiRanking {
    /** How many are offered in the picker */
    const val MAX_SHOWN = 30

    /** More are kept than shown, so a favourite you have not used lately still ranks */
    const val MAX_STORED = 100

    /** A count is at least one; entries from before counts were kept have none */
    fun count(entry: RecentEmoji.Entry): Long = entry.total?.takeIf { it > 0 } ?: 1L

    /** The most used first. Ties keep the stored order, which has the latest use first. */
    fun ranked(entries: List<RecentEmoji.Entry>): List<RecentEmoji.Entry> =
        entries.sortedByDescending { count(it) }.take(MAX_SHOWN)

    /** Counts one more use of [emoji] and stores it first. The label is kept when none is given. */
    fun use(entries: List<RecentEmoji.Entry>, emoji: String, label: String, url: String?): List<RecentEmoji.Entry> {
        val used = entries.firstOrNull { it.emoji == emoji }
        val total = (used?.let { count(it) } ?: 0L) + 1L
        val entry = RecentEmoji.Entry(emoji, label.ifEmpty { used?.label }, url, total)
        return (listOf(entry) + entries.filter { it.emoji != emoji }).take(MAX_STORED)
    }

    /** Both stored lists as one, each emoji with the higher of its two counts */
    fun merge(current: List<RecentEmoji.Entry>, legacy: List<RecentEmoji.Entry>): List<RecentEmoji.Entry> {
        val byEmoji = LinkedHashMap<String, RecentEmoji.Entry>()
        for (entry in current + legacy) {
            val known = byEmoji[entry.emoji]
            if (known == null || count(entry) > count(known)) {
                byEmoji[entry.emoji] = entry.copy(label = entry.label.takeUnless { it.isNullOrEmpty() } ?: known?.label)
            }
        }
        return byEmoji.values.toList()
    }
}
