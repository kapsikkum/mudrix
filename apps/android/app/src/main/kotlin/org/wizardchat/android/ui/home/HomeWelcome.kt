package org.wizardchat.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.mentionCount
import org.wizardchat.android.matrix.unreadCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.UnreadBadge
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

/** How many of the latest rooms "Jump back in" lists */
private const val RECENT_ROOMS = 6

/** The rooms to jump back into: joined, not spaces, newest activity first */
internal fun recentRooms(rooms: List<RoomSummary>): List<RoomSummary> =
    rooms.filter { !it.isSpace && it.lastActivity != null }.sortedByDescending { it.lastActivity }.take(RECENT_ROOMS)

/** The top of the Home list: a greeting, what needs catching up on and the latest rooms */
@Composable
fun HomeWelcome(roomList: RoomListModel, onOpenInbox: (() -> Unit)?) {
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val name = session.displayName ?: session.userId?.removePrefix("@")?.substringBefore(':').orEmpty()
    val invites = roomList.invites
    val mentions = roomList.mentionRooms
    val recent = recentRooms(roomList.joinedRooms)
    Column(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Text(tr("home.greeting", name), style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary, maxLines = 2)
        if ((invites.isNotEmpty() || mentions.isNotEmpty()) && onOpenInbox != null) {
            Heading(tr("home.catchUpHeading"), tr("home.inboxLink"), onOpenInbox)
            invites.take(3).forEach { invite ->
                CardRow(invite.displayName, invite.avatarUrl, tr("home.invitation"), 0, false) { onOpenInbox() }
            }
            mentions.take(3).forEach { room ->
                CardRow(room.displayName, room.avatarUrl, tr("inbox.youWereMentioned"), room.mentionCount, true) { navigator.openRoom(room.id) }
            }
        }
        if (recent.isNotEmpty()) {
            Heading(tr("home.recentHeading"), null, null)
            recent.forEach { room ->
                val label = when {
                    room.isDirect -> tr("home.dmLabel")
                    room.isVoice -> tr("home.voiceLabel")
                    else -> tr("home.roomLabel")
                }
                val unread = if (room.mentionCount > 0) room.mentionCount else room.unreadCount
                CardRow(room.displayName, room.avatarUrl, label, unread, room.mentionCount > 0) { navigator.openRoom(room.id) }
            }
        }
    }
}

@Composable
private fun Heading(title: String, action: String?, onAction: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().padding(top = WZ.Space.space3), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
        if (action != null && onAction != null) {
            Text(action, Modifier.clickable(onClick = onAction), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.accent)
        }
    }
}

@Composable
private fun CardRow(title: String, avatarUrl: String?, subtitle: String, unread: Int, mention: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .clickable(onClick = onClick)
            .padding(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Avatar(title, avatarUrl, WZ.SizeAvatar.sm)
        Column(Modifier.weight(1f)) {
            Text(title, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (unread > 0 && !mention) "$subtitle · ${trPlural("home.unreadBadge", unread, unread)}" else subtitle,
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (unread > 0) UnreadBadge(unread, isMention = mention)
    }
}
