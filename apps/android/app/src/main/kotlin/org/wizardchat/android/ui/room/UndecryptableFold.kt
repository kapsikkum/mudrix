package org.wizardchat.android.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.matrix.UndecryptableRuns
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.settings.SessionsSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.tokens.WZ

/** Rooms where the reader chose to see every unreadable message instead of the folded row (kept while the app runs, like the web) */
internal object UndecryptableFolds {
    var expandedRooms by mutableStateOf(setOf<String>())

    fun expand(roomId: String) {
        expandedRooms = expandedRooms + roomId
    }

    fun collapse(roomId: String) {
        expandedRooms = expandedRooms - roomId
    }
}

/** A timeline row: one entry, or a folded run of unreadable messages */
internal sealed interface TimelineItem {
    val key: String

    /** [collapsible] marks the first message of an expanded run, which gets a "Collapse" button */
    data class Single(val entry: ChatEntry, val collapsible: Boolean = false) : TimelineItem {
        override val key: String get() = entry.id
    }

    data class Fold(val entries: List<ChatEntry>) : TimelineItem {
        override val key: String get() = "fold-${entries.first().id}"
    }

    fun contains(id: String): Boolean = when (this) {
        is Single -> entry.id == id || entry.galleryItems.any { it.id == id }
        is Fold -> entries.any { it.id == id }
    }
}

/** [entries] (oldest first) with runs of [UndecryptableRuns.THRESHOLD] or more unreadable messages folded, unless [expanded] */
internal fun foldTimeline(entries: List<ChatEntry>, expanded: Boolean): List<TimelineItem> {
    val runs = UndecryptableRuns.compute(entries.map { it.kind is ChatEntry.Kind.Undecryptable })
    val result = ArrayList<TimelineItem>(entries.size)
    var index = 0
    while (index < entries.size) {
        val run = runs[index]
        if (run == null || run.count < UndecryptableRuns.THRESHOLD) {
            result += TimelineItem.Single(entries[index])
            index++
        } else if (expanded) {
            result += TimelineItem.Single(entries[index], collapsible = run.isFirst)
            index++
        } else {
            result += TimelineItem.Fold(entries.subList(index, index + run.count))
            index += run.count
        }
    }
    return result
}

/** Why a message cannot be read here and what can be done; opened from "How to fix" */
@Composable
internal fun UndecryptableHelp(reason: String?, modifier: Modifier = Modifier) {
    val session = LocalSession.current
    var verify by remember { mutableStateOf(false) }
    val verified = session.encryption?.deviceVerified != false
    val kind = UndecryptableRuns.helpKind(reason, verified)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        Text(tr("timeline.undecryptable.help.${kind.name}"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        if (kind == UndecryptableRuns.HelpKind.unverified) {
            PrimaryButton(tr("timeline.undecryptable.verifySession"), { verify = true })
        }
    }
    if (verify) SessionsSheet(onDismiss = { verify = false })
}

/** A small text button with a caret for "How to fix" */
@Composable
internal fun HowToFixButton(open: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .clip(CircleShape)
            .clickable(onClick = onToggle)
            .heightIn(min = 44.dp)
            .padding(horizontal = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
    ) {
        PhIcon(if (open) "caret-up" else "caret-down", size = WZ.SizeIcon.xs, tint = theme.accent)
        Text(tr("timeline.undecryptable.howToFix"), style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.accent)
    }
}

/** Stands in for a run of unreadable messages: one row that says how many, and how to fix it */
@Composable
internal fun UndecryptableFoldRow(entries: List<ChatEntry>, roomId: String) {
    var help by remember { mutableStateOf(false) }
    val reason = (entries.first().kind as? ChatEntry.Kind.Undecryptable)?.reason
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            PhIcon("lock", size = WZ.SizeIcon.sm, tint = theme.textMuted)
            Text(
                trPlural("timeline.undecryptable.group", entries.size, entries.size),
                Modifier.weight(1f),
                style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                color = theme.textPrimary,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2), verticalAlignment = Alignment.CenterVertically) {
            HowToFixButton(help) { help = !help }
            Row(
                Modifier.clip(CircleShape).clickable { UndecryptableFolds.expand(roomId) }.heightIn(min = 44.dp).padding(horizontal = WZ.Space.space4),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(tr("timeline.undecryptable.showAll"), style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.accent)
            }
        }
        if (help) UndecryptableHelp(reason)
    }
}

/** "Collapse" after the first message of an expanded run */
@Composable
internal fun UndecryptableCollapseRow(roomId: String) {
    Row(
        Modifier
            .padding(start = WZ.Space.space6 + WZ.SizeAvatar.md + WZ.Space.space5)
            .clip(CircleShape)
            .clickable { UndecryptableFolds.collapse(roomId) }
            .heightIn(min = 44.dp)
            .padding(horizontal = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(tr("timeline.undecryptable.collapse"), style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.accent)
    }
}
