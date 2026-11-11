package org.wizardchat.android.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** "This room has been upgraded": a way into the room that replaced it, joining it first when needed */
@Composable
fun TombstoneBanner(roomId: String, replacementRoomId: String) {
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    var joining by remember { mutableStateOf(false) }
    val inReplacement = session.roomList?.isJoined(replacementRoomId) == true

    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space5)
            .clip(CircleShape)
            .background(theme.fill)
            .padding(start = WZ.Space.space6, end = WZ.Space.space3, top = WZ.Space.space2, bottom = WZ.Space.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Text(tr("timeline.roomUpgraded"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
        Text(
            when {
                inReplacement -> tr("timeline.viewNewRoom")
                joining -> tr("explore.joining")
                else -> tr("common.join")
            },
            Modifier
                .clip(CircleShape)
                .clickable(enabled = !joining) {
                    if (inReplacement) {
                        navigator.openRoom(replacementRoomId)
                        return@clickable
                    }
                    val client = session.client ?: return@clickable
                    joining = true
                    scope.launch {
                        try {
                            navigator.openRoom(client.joinUpgradedRoom(roomId))
                        } catch (e: Exception) {
                            CopyToast.show(e.message ?: e.toString())
                        } finally {
                            joining = false
                        }
                    }
                }
                .padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space3),
            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
            color = theme.accent,
        )
    }
}
