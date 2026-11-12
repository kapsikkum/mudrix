package org.wizardchat.android.matrix

/**
 * Stops scrolling back through history this device cannot read: after a couple of pages that are
 * (nearly) all undecryptable, loading pauses until the person asks for more. The web app does the same in
 * `undecryptable.ts`.
 */
class UnreadableHistory {
    companion object {
        /** Consecutive (nearly) all-unreadable pages that pause scrollback */
        const val PAGES_BEFORE_PAUSE = 2

        /** The share of a page that must be unreadable for it to count */
        const val UNREADABLE_SHARE = 0.9

        /** Whether a freshly loaded page is (nearly) all messages this device cannot read */
        fun isUnreadablePage(added: Int, unreadable: Int): Boolean =
            added > 0 && unreadable >= added * UNREADABLE_SHARE
    }

    private var streak = 0

    var paused = false
        private set

    /** Records a loaded page; a readable page ends a streak and resumes automatic loading */
    fun record(added: Int, unreadable: Int) {
        if (isUnreadablePage(added, unreadable)) {
            streak++
            if (streak >= PAGES_BEFORE_PAUSE) paused = true
        } else if (added > 0) {
            streak = 0
            paused = false
        }
    }

    fun reset() {
        streak = 0
        paused = false
    }
}
