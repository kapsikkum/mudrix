package org.wizardchat.android.ui.room

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.people.SheetBar
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

/** The rooms a message can be forwarded to: joined rooms and chats, newest activity first, filtered by what was typed */
internal fun forwardTargets(rooms: List<RoomSummary>, query: String): List<RoomSummary> {
    val needle = query.trim().lowercase()
    return rooms
        .filter { !it.isSpace && !it.isInvite && !it.isTombstoned }
        .filter { needle.isEmpty() || it.displayName.lowercase().contains(needle) || it.canonicalAlias?.lowercase()?.contains(needle) == true }
        .sortedByDescending { it.lastActivity ?: 0L }
}

/** "Forward message": picks a room or chat and sends the message there */
@Composable
fun ForwardSheet(fromRoomId: String, eventId: String, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var sendingTo by remember { mutableStateOf<String?>(null) }
    val targets = remember(session.roomList?.joinedRooms, query) { forwardTargets(session.roomList?.joinedRooms.orEmpty(), query) }

    WizardSheet(onDismiss) {
        SheetBar(tr("timeline.forwardPickerTitle"), trailing = { BarTextButton(tr("common.cancel"), onDismiss) })
        Box(Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3)) {
            WizardTextField(query, { query = it }, tr("timeline.forwardSearchPlaceholder"))
        }
        LazyColumn(Modifier.fillMaxWidth().navigationBarsPadding().height(WZ.Size.sidebar + WZ.Size.sidebar)) {
            items(targets, key = { it.id }) { room ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable(enabled = sendingTo == null) {
                            val client = session.client ?: return@clickable
                            sendingTo = room.id
                            scope.launch {
                                try {
                                    client.forwardEvent(fromRoomId, eventId, room.id)
                                    CopyToast.show(L10n.format("mobile.forwarded", room.displayName))
                                    onDismiss()
                                } catch (e: Exception) {
                                    CopyToast.show(L10n.format("timeline.forwardFailed", e.message ?: ""))
                                    sendingTo = null
                                }
                            }
                        }
                        .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                ) {
                    Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.md)
                    Text(
                        room.displayName,
                        Modifier.weight(1f),
                        style = wizardFont(WZ.FontSize.lg, FontWeight.Medium),
                        color = theme.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (sendingTo == room.id) Spinner() else PhIcon("arrow-circle-right", tint = theme.textMuted)
                }
            }
        }
    }
}
