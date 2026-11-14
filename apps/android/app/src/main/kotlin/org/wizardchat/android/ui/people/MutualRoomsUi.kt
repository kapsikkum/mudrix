package org.wizardchat.android.ui.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MutualEntry
import org.wizardchat.android.matrix.MutualRooms
import org.wizardchat.android.matrix.MutualRoomsLookup
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.Note
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

private const val MEMBER_LOOKUP_CAP = 50
private const val MEMBER_LOOKUP_PARALLEL = 8

/** The rooms and spaces this person shares with you, or null while unknown (neither the server nor the rooms could say) */
@Composable
internal fun rememberMutualRooms(userId: String, enabled: Boolean): MutualRooms? {
    val session = LocalSession.current
    var mutual by remember(userId, enabled) { mutableStateOf<MutualRooms?>(null) }
    LaunchedEffect(userId, enabled) {
        if (!enabled) return@LaunchedEffect
        val stored = session.client?.session ?: return@LaunchedEffect
        val list = session.roomList ?: return@LaunchedEffect
        val ids = MutualRoomsLookup.fetch(stored.homeserverUrl, stored.accessToken, userId)
        mutual = if (ids != null) {
            MutualRoomsLookup.classify(ids, list.joinedRooms, list.spaces, list.graph)
        } else {
            mutualFromMembers(list, userId)
        }
    }
    return mutual
}

/**
 * For a server without the lookup: the members of the rooms and spaces this device knows, a few at a time, at most
 * [MEMBER_LOOKUP_CAP]. A match is always real; "none" only when every room was checked, otherwise it is unknown (null).
 */
private suspend fun mutualFromMembers(list: RoomListModel, userId: String): MutualRooms? {
    val candidates = (list.joinedRooms.filter { !it.isDirect && !it.isTombstoned }.map { it.id } + list.spaces.map { it.id }).distinct()
    val checked = candidates.take(MEMBER_LOOKUP_CAP)
    val answers = checked.chunked(MEMBER_LOOKUP_PARALLEL).flatMap { chunk ->
        coroutineScope {
            chunk.map { id ->
                async { runCatching { list.client.members(id) }.getOrNull()?.any { it.userId == userId && !it.isInvite } }
            }.awaitAll()
        }
    }
    val found = checked.filterIndexed { index, _ -> answers[index] == true }
    val complete = checked.size == candidates.size && answers.all { it != null }
    if (found.isEmpty() && !complete) return null
    return MutualRoomsLookup.classify(found, list.joinedRooms, list.spaces, list.graph)
}

/** The mutual rooms of a profile: spaces first, then rooms, or the empty note (the web's mutual tab); nothing while unknown */
@Composable
internal fun MutualRoomsList(found: MutualRooms?, onOpen: (entry: MutualEntry, isSpace: Boolean) -> Unit) {
    if (found == null) return
    if (found.isEmpty) {
        Note(tr("profile.mutualEmpty"), Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space6))
        return
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
        if (found.spaces.isNotEmpty()) {
            MutualHeading(tr("profile.mutualSpacesHeading"))
            found.spaces.forEach { entry -> MutualRow(entry) { onOpen(entry, true) } }
        }
        if (found.rooms.isNotEmpty()) {
            MutualHeading(tr("profile.mutualRoomsHeading"))
            found.rooms.forEach { entry -> MutualRow(entry) { onOpen(entry, false) } }
        }
    }
}

@Composable
private fun MutualHeading(text: String) {
    Text(
        text,
        Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
        color = theme.textMuted,
    )
}

@Composable
private fun MutualRow(entry: MutualEntry, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Avatar(entry.name, entry.avatarUrl, WZ.SizeAvatar.sm)
        Text(entry.name, style = wizardFont(WZ.FontSize.lg, FontWeight.Medium), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
