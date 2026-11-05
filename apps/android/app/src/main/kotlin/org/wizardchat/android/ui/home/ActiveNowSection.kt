package org.wizardchat.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MemberDirectory
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.memberProfile
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

private const val PEOPLE_LIMIT = 5

private data class ActivePerson(val userId: String, val name: String?, val avatarUrl: String?, val known: Boolean)

private data class ActiveCard(val room: RoomSummary, val people: List<ActivePerson>, val knownCount: Int, val includesMe: Boolean)

@Composable
fun ActiveNowSection(roomList: RoomListModel) {
    val session = LocalSession.current
    val calls = LocalCalls.current
    val navigator = LocalNavigator.current
    val me = session.userId
    val known = roomList.joinedRooms.filter { it.isDirect }.mapNotNull { room -> room.dmUserId?.let { it to room } }.toMap()
    val cards = roomList.joinedRooms
        .filter { it.isVoice && it.callParticipants.isNotEmpty() }
        .mapNotNull { room ->
            val ids = room.callParticipants.distinct()
            val people = ids.map { id ->
                ActivePerson(id, known[id]?.dmUserName, known[id]?.dmUserAvatar, id != me && known[id] != null)
            }
            val knownCount = people.count { it.known }
            if (knownCount == 0) null else ActiveCard(room, people.sortedByDescending { it.known }, knownCount, me != null && me in ids)
        }
        .sortedByDescending { it.knownCount }
    if (cards.isEmpty()) return

    Column(
        Modifier.fillMaxWidth().padding(start = WZ.Space.space6, top = WZ.Space.space2, bottom = WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Text(tr("home.activeNow"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
            cards.forEach { card ->
                val shown = card.people.take(PEOPLE_LIMIT)
                Column(
                    Modifier
                        .width(WZ.Size.sidebar * 0.75f)
                        .heightIn(min = WZ.Size.sidebar * 0.75f)
                        .clip(RoundedCornerShape(WZ.Radius.xl))
                        .background(theme.bgSecondary)
                        .padding(WZ.Space.space5),
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                            PhIcon("speaker-high", PhWeight.fill, WZ.SizeIcon.xs, tint = theme.success)
                            Text(
                                card.room.name ?: card.room.id,
                                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                                color = theme.textPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        roomList.spaceContaining(card.room.id)?.let {
                            Text(it.name, style = wizardFont(WZ.FontSize.xs), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                        shown.forEach { person -> PersonRow(person, card.room.id) }
                        if (card.people.size > shown.size) {
                            val more = card.people.size - shown.size
                            Text(trPlural("home.morePeople", more, more), style = wizardFont(WZ.FontSize.xs), color = theme.textMuted)
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    Text(
                        tr(if (card.includesMe) "home.open" else "home.join"),
                        Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = WZ.SizeControl.md)
                            .clip(CircleShape)
                            .background(if (card.includesMe) theme.fill else theme.accent)
                            .clickable {
                                if (!card.includesMe) calls.launchJoin(card.room, session)
                                navigator.push(Route.Room(card.room.id))
                            }
                            .padding(vertical = WZ.Space.space3),
                        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                        color = if (card.includesMe) theme.textPrimary else theme.textOnAccent,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun PersonRow(person: ActivePerson, roomId: String) {
    val session = LocalSession.current
    var profile by remember(person.userId) { mutableStateOf<MemberDirectory.Profile?>(null) }
    LaunchedEffect(person.userId) {
        if (person.name == null) profile = session.memberProfile(person.userId, roomId)
    }
    val name = person.name ?: profile?.name ?: person.userId
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        Avatar(name, person.avatarUrl ?: profile?.avatarUrl, WZ.SizeAvatar.xs)
        Text(
            name,
            style = wizardFont(WZ.FontSize.sm, if (person.known) FontWeight.SemiBold else FontWeight.Normal),
            color = if (person.known) theme.textPrimary else theme.textMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
