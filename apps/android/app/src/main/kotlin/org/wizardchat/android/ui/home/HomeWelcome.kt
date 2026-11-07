package org.wizardchat.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.settings.AccountSettings
import org.wizardchat.android.ui.settings.SessionsSheet
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
    var sheet by remember { mutableStateOf<SetupSheet?>(null) }
    when (sheet) {
        SetupSheet.sessions -> SessionsSheet { sheet = null }
        SetupSheet.account -> WizardSheet({ sheet = null }) {
            Box(Modifier.fillMaxWidth().fillMaxHeight(0.92f)) { AccountSettings { sheet = null } }
        }
        null -> Unit
    }
    Column(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Text(tr("timeline.home.greeting", name), style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary, maxLines = 2)
        // Finish setting up: a profile picture, and a session that is not verified yet (nothing shows while it is still loading)
        val needsPicture = session.avatarUrl == null
        val needsVerification = session.encryption?.let { !it.deviceVerified } == true
        if (needsPicture || needsVerification) {
            Heading(tr("timeline.home.setupHeading"), null, null)
            if (needsPicture) {
                CardRow(tr("timeline.home.profileTitle"), null, tr("timeline.home.profileDesc"), 0, false, icon = "camera") { sheet = SetupSheet.account }
            }
            if (needsVerification) {
                CardRow(tr("verifySession.title"), null, tr("timeline.home.encryptionDesc"), 0, false, icon = "shield-warning", warning = true) { sheet = SetupSheet.sessions }
            }
        }
        if ((invites.isNotEmpty() || mentions.isNotEmpty()) && onOpenInbox != null) {
            Heading(tr("timeline.home.catchUpHeading"), tr("timeline.home.inboxLink"), onOpenInbox)
            invites.take(3).forEach { invite ->
                CardRow(invite.displayName, invite.avatarUrl, tr("timeline.home.invitation"), 0, false) { onOpenInbox() }
            }
            mentions.take(3).forEach { room ->
                CardRow(room.displayName, room.avatarUrl, tr("inbox.youWereMentioned"), room.mentionCount, true) { navigator.openRoom(room.id) }
            }
        }
        if (recent.isNotEmpty()) {
            Heading(tr("timeline.home.recentHeading"), null, null)
            recent.forEach { room ->
                val label = when {
                    room.isDirect -> tr("timeline.home.dmLabel")
                    room.isVoice -> tr("timeline.home.voiceLabel")
                    else -> tr("timeline.home.roomLabel")
                }
                val unread = if (room.mentionCount > 0) room.mentionCount else room.unreadCount
                CardRow(room.displayName, room.avatarUrl, label, unread, room.mentionCount > 0) { navigator.openRoom(room.id) }
            }
        }
    }
}

private enum class SetupSheet { account, sessions }

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
private fun CardRow(title: String, avatarUrl: String?, subtitle: String, unread: Int, mention: Boolean, icon: String? = null, warning: Boolean = false, onClick: () -> Unit) {
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
        if (icon != null) {
            PhIcon(icon, size = WZ.SizeIcon.lg, tint = if (warning) theme.warningColor else theme.accent)
        } else {
            Avatar(title, avatarUrl, WZ.SizeAvatar.sm)
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (unread > 0 && !mention) "$subtitle · ${trPlural("timeline.home.unreadBadge", unread, unread)}" else subtitle,
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (unread > 0) UnreadBadge(unread, isMention = mention)
    }
}
