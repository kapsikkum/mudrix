package chat.mudrix.android.ui.voice

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import chat.mudrix.android.LocalSession
import chat.mudrix.android.matrix.MatrixSession
import chat.mudrix.android.matrix.SidebarSelection
import chat.mudrix.android.matrix.SpaceModern
import chat.mudrix.android.matrix.VoiceMoves
import chat.mudrix.android.matrix.displayName
import chat.mudrix.android.ui.CopyToast
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.core.RoomSummary
import chat.mudrix.tokens.WZ

/**
 * The voice channels [userId] could be moved to from [roomId]: the other voice channels of the space around it,
 * and only when the signed-in person manages a space holding both
 */
suspend fun voiceMoveTargets(session: MatrixSession, roomId: String, userId: String): List<RoomSummary> {
    val client = session.client ?: return emptyList()
    val me = session.userId ?: return emptyList()
    val list = session.roomList ?: return emptyList()
    if (me == userId) return emptyList()
    val root = SpaceModern.rootSpaceOf(list.graph, roomId)
    if (root == roomId) return emptyList()
    return list.rooms(SidebarSelection.Space(root))
        .filter { it.isVoice && !it.isInvite && it.id != roomId }
        .take(20)
        .filter { runCatching { VoiceMoves.mayMoveBetween(client, list.graph, me, roomId, it.id) }.getOrDefault(false) }
}

/** "Move to...": picks one of the channels; the person's own device then joins it */
@Composable
fun VoiceMoveDialog(roomId: String, userId: String, targets: List<RoomSummary>, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(tr("room.settings.channels.moveTo"), style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary) },
        text = {
            Column {
                targets.forEach { target ->
                    TextButton(onClick = {
                        onDismiss()
                        val client = session.client ?: return@TextButton
                        scope.launch {
                            try {
                                VoiceMoves.request(client, roomId, userId, target.id)
                            } catch (e: Exception) {
                                CopyToast.show(e.message ?: e.toString())
                            }
                        }
                    }, Modifier.fillMaxWidth()) {
                        Text(target.displayName, style = wizardFont(WZ.FontSize.lg), color = theme.accent)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("common.cancel"), style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.accent) } },
    )
}
