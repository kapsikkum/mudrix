package org.wizardchat.android.matrix

import org.wizardchat.core.EventVersion

/**
 * The rules of the edit-history list: newest version first, with a badge for the current text and the
 * original. The web app does the same in `EditHistoryModal.tsx`.
 */
object EditHistory {
    /** The core lists the oldest first; the newest version leads */
    fun newestFirst(versions: List<EventVersion>): List<EventVersion> = versions.reversed()

    /** Badge locale keys for a row: "current" for the newest text, "original" for the message as first sent */
    fun badges(version: EventVersion, index: Int): List<String> = buildList {
        if (index == 0) add("timeline.editHistory.current")
        if (version.isOriginal) add("timeline.editHistory.original")
    }

    /** True when there is nothing to compare: no versions, or only the original */
    fun isEmpty(versions: List<EventVersion>): Boolean = versions.size <= 1
}
