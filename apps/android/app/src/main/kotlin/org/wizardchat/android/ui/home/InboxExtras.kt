package org.wizardchat.android.ui.home

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.EventPreview
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.SavedMessages
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.android.matrix.ThreadLastSeen
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.ThreadInfo
import org.wizardchat.tokens.WZ

/** Rooms looked at for threads: the busiest ones, so the tab does not ask every room */
private const val THREAD_ROOMS = 25
private const val THREAD_ROWS = 50

private data class InboxThread(val room: RoomSummary, val thread: ThreadInfo) {
    val time get() = thread.latestTimestamp ?: thread.timestamp
}

/** Threads you took part in across the busiest rooms, from the core's `threads(roomId, mine)` */
@Composable
internal fun InboxThreads(roomList: RoomListModel, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val client = session.client
    val navigator = LocalNavigator.current
    var threads by remember { mutableStateOf<List<InboxThread>?>(null) }
    // Asked again when a room has new activity, not on every recomposition
    val activity = roomList.joinedRooms.sumOf { it.lastActivity ?: 0L }

    LaunchedEffect(client, activity) {
        val c = client ?: return@LaunchedEffect
        val rooms = roomList.joinedRooms.filter { !it.isSpace }.sortedByDescending { it.lastActivity ?: 0L }.take(THREAD_ROOMS)
        threads = coroutineScope {
            rooms.chunked(4).flatMap { batch ->
                batch.map { room ->
                    async {
                        runCatching { c.threads(room.id, true).threads }.getOrDefault(emptyList()).map { InboxThread(room, it) }
                    }
                }.awaitAll().flatten()
            }
        }.sortedByDescending { it.time }.take(THREAD_ROWS)
    }

    val list = threads
    when {
        list == null -> Box(Modifier.fillMaxWidth().padding(WZ.Space.space6), contentAlignment = Alignment.Center) { Spinner() }
        list.isEmpty() -> InboxEmpty(tr("inbox.emptyThreads"))
        else -> Column {
            list.forEach { item ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            ThreadLastSeen.markSeen(item.thread.rootEventId, item.time)
                            navigator.push(Route.Thread(item.room.id, item.thread.rootEventId))
                            onDismiss()
                        }
                        .padding(WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                ) {
                    val unread = ThreadLastSeen.isUnread(item.thread, session.userId)
                    Box(Modifier.size(WZ.Space.space3).background(if (unread) theme.accent else Color.Transparent, CircleShape))
                    Avatar(item.room.displayName, item.room.avatarUrl, WZ.SizeAvatar.sm)
                    Column(Modifier.weight(1f)) {
                        Text(
                            item.thread.body.lineSequence().firstOrNull().orEmpty(),
                            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            "${item.room.displayName} · ${trPlural("timeline.threadReplies", item.thread.replies.toInt(), item.thread.replies.toInt())}",
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        DateUtils.getRelativeTimeSpanString(item.time, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString(),
                        style = wizardFont(WZ.FontSize.xs),
                        color = theme.textMuted,
                    )
                }
            }
        }
    }
}

/** Messages saved from the message menu, with their first line fetched and decrypted */
@Composable
internal fun InboxSaved(roomList: RoomListModel, onOpenRoom: (String) -> Unit, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val saved = SavedMessages.shared.items
    val previews = remember { mutableStateMapOf<String, EventPreview?>() }
    val notifier = MessageNotifier.shared

    if (saved.isEmpty()) {
        InboxEmpty(tr("inbox.emptySaved"))
        return
    }
    Column {
        saved.forEach { message ->
            LaunchedEffect(message.eventId) {
                if (message.eventId !in previews) {
                    val client = session.client ?: return@LaunchedEffect
                    previews[message.eventId] = SavedMessages.resolve(client, message)
                }
            }
            val room = roomList.room(message.roomId)
            val preview = previews[message.eventId]
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable {
                        notifier.eventToFocus = message.roomId to message.eventId
                        onOpenRoom(message.roomId)
                        onDismiss()
                    }
                    .padding(WZ.Space.space4),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                Avatar(room?.displayName ?: "?", room?.avatarUrl, WZ.SizeAvatar.sm)
                Column(Modifier.weight(1f)) {
                    Text(
                        when {
                            preview == null && message.eventId in previews -> tr("inbox.savedUnavailable")
                            preview == null -> "…"
                            preview.redacted -> tr("timeline.messageDeleted")
                            else -> preview.body.lineSequence().firstOrNull().orEmpty()
                        },
                        style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                        color = theme.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        listOfNotNull(room?.displayName, preview?.sender?.takeIf { it.isNotEmpty() }).joinToString(" · "),
                        style = wizardFont(WZ.FontSize.sm),
                        color = theme.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Box(
                    Modifier.size(WZ.Space.space8).clip(CircleShape).clickable {
                        scope.launch { session.client?.let { runCatching { SavedMessages.shared.toggle(it, message.roomId, message.eventId) } } }
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    PhIcon("bookmark-simple", PhWeight.fill, size = WZ.SizeIcon.sm, tint = theme.accent, contentDescription = tr("timeline.unsaveMessage"))
                }
            }
        }
    }
}

@Composable
private fun InboxEmpty(text: String) {
    Text(
        text,
        Modifier.fillMaxWidth().padding(vertical = WZ.Space.space10, horizontal = WZ.Space.space6),
        style = wizardFont(WZ.FontSize.md),
        color = theme.textMuted,
        textAlign = TextAlign.Center,
    )
}
