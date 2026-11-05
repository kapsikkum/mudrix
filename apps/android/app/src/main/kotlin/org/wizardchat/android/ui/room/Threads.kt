package org.wizardchat.android.ui.room

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.memberProfile
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.Chip
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.ThreadInfo
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

@Composable
fun ThreadListSheet(room: RoomSummary, client: WizardClient, onDismiss: () -> Unit, onOpen: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var mine by remember { mutableStateOf(false) }
    var threads by remember { mutableStateOf<List<ThreadInfo>>(emptyList()) }
    var next by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load(more: Boolean) {
        if (!more) {
            threads = emptyList()
            next = null
        }
        loading = true
        error = null
        runCatching { client.threads(room.id, mine, if (more) next else null) }
            .onSuccess { page ->
                threads = threads + page.threads.filter { new -> threads.none { it.rootEventId == new.rootEventId } }
                next = page.next
            }
            .onFailure { error = it.message }
        loading = false
    }

    LaunchedEffect(mine) { load(more = false) }

    WizardSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).background(theme.bgSecondary)) {
            Box(Modifier.fillMaxWidth().height(WZ.Space.space11).padding(horizontal = WZ.Space.space3)) {
                Text(
                    tr("timeline.threads"),
                    Modifier.align(Alignment.Center),
                    style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                    color = theme.textPrimary,
                )
                Box(Modifier.align(Alignment.CenterEnd)) { BarTextButton(tr("common.done"), onDismiss, bold = true) }
            }
            Row(
                Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                Chip(tr("timeline.threadsAll"), !mine, { mine = false })
                Chip(tr("timeline.threadsMy"), mine, { mine = true })
            }
            LazyColumn(Modifier.fillMaxWidth().weight(1f).navigationBarsPadding()) {
                error?.let { message ->
                    item { Text(message, Modifier.padding(WZ.Space.space6), style = wizardFont(WZ.FontSize.md), color = theme.danger) }
                }
                if (threads.isEmpty() && !loading && error == null) {
                    item {
                        Text(
                            tr(if (mine) "timeline.threadListEmptyMy" else "timeline.threadListEmpty"),
                            Modifier.fillMaxWidth().padding(vertical = WZ.Space.space8),
                            style = wizardFont(WZ.FontSize.md),
                            color = theme.textMuted,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                items(threads, key = { it.rootEventId }) { thread ->
                    ThreadRow(thread, room.id) { onOpen(thread.rootEventId) }
                    if (thread.rootEventId == threads.lastOrNull()?.rootEventId && next != null && !loading) {
                        LaunchedEffect(thread.rootEventId) { scope.launch { load(more = true) } }
                    }
                }
                if (loading) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(WZ.Space.space6), contentAlignment = Alignment.Center) { Spinner() }
                    }
                }
            }
        }
    }
}

@Composable
private fun ThreadRow(thread: ThreadInfo, roomId: String, onClick: () -> Unit) {
    val session = LocalSession.current
    var name by remember(thread.sender) { mutableStateOf<String?>(null) }
    var avatarUrl by remember(thread.sender) { mutableStateOf<String?>(null) }
    var latestName by remember(thread.latestSender) { mutableStateOf<String?>(null) }
    LaunchedEffect(thread.rootEventId) {
        val profile = session.memberProfile(thread.sender, roomId)
        name = profile.name
        avatarUrl = profile.avatarUrl
        thread.latestSender?.let { latestName = session.memberProfile(it, roomId).name }
    }
    val time = thread.latestTimestamp ?: thread.timestamp
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Avatar(name ?: thread.sender, avatarUrl, WZ.SizeAvatar.sm)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    name ?: thread.sender,
                    Modifier.weight(1f),
                    style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                    color = theme.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    DateUtils.getRelativeTimeSpanString(time, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString(),
                    style = wizardFont(WZ.FontSize.xs),
                    color = theme.textMuted,
                )
            }
            Text(thread.body, style = wizardFont(WZ.FontSize.md), color = theme.textPrimary, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                Text(
                    trPlural("timeline.threadReplies", thread.replies.toInt(), thread.replies.toInt()),
                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                    color = theme.accent,
                )
                thread.latestBody?.lineSequence()?.firstOrNull()?.let { latest ->
                    Text(
                        latestName?.let { "$it: $latest" } ?: latest,
                        style = wizardFont(WZ.FontSize.sm),
                        color = theme.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}
