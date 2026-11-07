package org.wizardchat.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.SavedMessages
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.mentionCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.UnreadBadge
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

private enum class InboxTab { invites, mentions, threads, saved }

/** Invites and rooms that mention you */
@Composable
fun InboxSheet(roomList: RoomListModel, onDismiss: () -> Unit, onOpenRoom: (String) -> Unit, onOpenSpace: (String) -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(InboxTab.invites) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val inviters = remember { mutableStateMapOf<String, String>() }

    fun accept(invite: RoomSummary) {
        scope.launch {
            busyId = invite.id
            errorMessage = null
            try {
                roomList.accept(invite)
                if (roomList.spaces.any { it.id == invite.id }) onOpenSpace(invite.id) else onOpenRoom(invite.id)
                onDismiss()
            } catch (e: Exception) {
                errorMessage = L10n.format("inbox.failedToAcceptInvite", e.message ?: e.toString())
            } finally {
                busyId = null
            }
        }
    }

    fun decline(invite: RoomSummary) {
        scope.launch {
            busyId = invite.id
            errorMessage = null
            try {
                roomList.decline(invite)
            } catch (e: Exception) {
                errorMessage = L10n.format("inbox.failedToDeclineInvite", e.message ?: e.toString())
            } finally {
                busyId = null
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetTopBar(
            tr("inbox.title"),
            leading = {
                if (tab == InboxTab.mentions && roomList.mentionRooms.isNotEmpty()) {
                    BarButton("check-circle", tr("common.markAllRead"), {
                        scope.launch { roomList.markAsRead(roomList.mentionRooms) }
                    }, weight = PhWeight.fill)
                }
            },
            trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) },
            titleContent = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    PhIcon("tray", tint = theme.textPrimary)
                    Text(tr("inbox.title"), style = wizardFont(WZ.FontSize.lg, FontWeight.Bold), color = theme.textPrimary)
                }
            },
        )
        Column(Modifier.fillMaxWidth().background(theme.bgSecondary)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                TabButton(tr("inbox.tabInvites"), roomList.invites.size, tab == InboxTab.invites) { tab = InboxTab.invites }
                TabButton(tr("inbox.tabMentions"), roomList.mentionRooms.size, tab == InboxTab.mentions) { tab = InboxTab.mentions }
                TabButton(tr("inbox.tabThreads"), 0, tab == InboxTab.threads) { tab = InboxTab.threads }
                TabButton(tr("inbox.tabSaved"), SavedMessages.shared.items.size, tab == InboxTab.saved) { tab = InboxTab.saved }
            }
            errorMessage?.let {
                Text(it, Modifier.padding(WZ.Space.space5), style = wizardFont(WZ.FontSize.sm), color = theme.error)
            }
            LazyColumn(
                Modifier.weight(1f, fill = false),
                contentPadding = PaddingValues(WZ.Space.space3),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
            ) {
                when (tab) {
                    InboxTab.invites -> {
                        if (roomList.invites.isEmpty()) item(key = "empty") { Empty(tr("inbox.emptyInvites")) }
                        items(roomList.invites, key = { it.id }) { invite ->
                            LaunchedEffect(invite.id) {
                                val info = runCatching { session.client?.inviteInfo(invite.id) }.getOrNull()
                                if (info != null) inviters[invite.id] = info.inviterName ?: info.inviterId
                            }
                            InviteRow(invite, inviters[invite.id] ?: "someone", busyId == invite.id, { accept(invite) }, { decline(invite) })
                        }
                    }
                    InboxTab.mentions -> {
                        if (roomList.mentionRooms.isEmpty()) item(key = "empty") { Empty(tr("inbox.emptyMentions")) }
                        items(roomList.mentionRooms, key = { it.id }) { room ->
                            MentionRow(
                                room,
                                onOpen = {
                                    onOpenRoom(room.id)
                                    onDismiss()
                                },
                                onMarkRead = { scope.launch { roomList.markAsRead(listOf(room)) } },
                            )
                        }
                    }
                    InboxTab.threads -> item(key = "threads") { InboxThreads(roomList, onDismiss) }
                    InboxTab.saved -> item(key = "saved") { InboxSaved(roomList, onOpenRoom, onDismiss) }
                }
            }
            Spacer(Modifier.navigationBarsPadding())
        }
    }
}

@Composable
private fun TabButton(title: String, count: Int, isActive: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .height(WZ.Space.space9)
            .clip(RoundedCornerShape(WZ.Radius.sm))
            .background(if (isActive) theme.bgActive else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Text(title, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = if (isActive) theme.textPrimary else theme.textMuted)
        if (count > 0) {
            Text(
                if (count > 99) "99+" else "$count",
                Modifier
                    .clip(CircleShape)
                    .background(if (isActive) theme.accent else theme.bgTertiary)
                    .padding(horizontal = WZ.Space.space3),
                style = wizardFont(WZ.FontSize.xs, FontWeight.Bold),
                color = if (isActive) theme.textOnAccent else theme.textMuted,
            )
        }
    }
}

@Composable
private fun Empty(text: String) {
    Text(
        text,
        Modifier.fillMaxWidth().padding(vertical = WZ.Space.space10),
        style = wizardFont(WZ.FontSize.md),
        color = theme.textMuted,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun SmallButton(text: String, background: Color, color: Color, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .height(WZ.Space.space8)
            .clip(RoundedCornerShape(WZ.Radius.sm))
            .background(background)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = WZ.Space.space4),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = color)
    }
}

@Composable
private fun InviteRow(invite: RoomSummary, inviterName: String, busy: Boolean, onAccept: () -> Unit, onDecline: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().alpha(if (busy) 0.5f else 1f).padding(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Avatar(invite.displayName, invite.avatarUrl, WZ.SizeAvatar.sm)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                if (invite.isDirect) {
                    Text("@", style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textMuted)
                } else {
                    PhIcon("hash-straight", size = WZ.SizeIcon.xs, tint = theme.textMuted)
                }
                Text(
                    invite.displayName,
                    style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                    color = theme.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                tr("inbox.invitedByName", inviterName),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(4.dp))
        SmallButton(tr("common.accept"), theme.accent, theme.textOnAccent, !busy, onAccept)
        SmallButton(tr("common.decline"), theme.bgTertiary, theme.textPrimary, !busy, onDecline)
    }
}

@Composable
private fun MentionRow(room: RoomSummary, onOpen: () -> Unit, onMarkRead: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.sm)
        Column(Modifier.weight(1f)) {
            Text(
                room.displayName,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (room.mentionCount == 1) tr("inbox.youWereMentioned") else tr("inbox.youWereMentionedTimes", room.mentionCount),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
                maxLines = 1,
            )
        }
        Spacer(Modifier.width(4.dp))
        UnreadBadge(room.mentionCount, isMention = true)
        Box(
            Modifier.size(WZ.Space.space8).clip(CircleShape).clickable(onClick = onMarkRead),
            contentAlignment = Alignment.Center,
        ) {
            PhIcon("check", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textMuted, contentDescription = tr("common.markRead"))
        }
    }
}
