package org.wizardchat.android.ui.home

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.delay
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.rtc.CallTimer
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.tokens.WZ

/** How long a voice channel's call has been going: the time since the first person joined, ticking every second */
@Composable
fun RoomCallTimer(roomId: String, modifier: Modifier = Modifier) {
    val session = LocalSession.current
    var since by remember(roomId) { mutableStateOf<Long?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    DisposableEffect(roomId, session.client) {
        val subscription = session.client?.watchCallMembers(roomId) { members ->
            since = members.minOfOrNull { it.joinedAt }
        }
        onDispose { subscription?.cancel() }
    }
    val start = since ?: return
    LaunchedEffect(start) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }
    Text(
        CallTimer.format(now - start),
        modifier,
        style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
        color = theme.success,
        maxLines = 1,
    )
}
