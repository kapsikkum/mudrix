package org.wizardchat.android.ui.voice

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.delay
import org.wizardchat.android.matrix.AloneTracker
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The one clock both places that can show the notice (the screen and the full-screen call) follow */
private val sharedTracker = AloneTracker()

/** "You're the only one here": offered in a direct call once the other person is gone, then the call ends on its own */
@Composable
fun AloneNotice(modifier: Modifier = Modifier, show: Boolean = true) {
    val calls = CallManager.shared
    val tracker = sharedTracker
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val isDirect = calls.room?.isDirect == true
    val joined = calls.state == CallManager.State.Joined
    val others = calls.participants.count { !it.isLocal && it.connected }

    LaunchedEffect(isDirect, joined, others, calls.ring) {
        tracker.update(isDirect, joined, others, calls.ring, System.currentTimeMillis())
        now = System.currentTimeMillis()
    }
    // The clock only runs while there is something to count
    LaunchedEffect(show, tracker.phase, isDirect, joined, others, calls.ring) {
        while (show && tracker.phase != AloneTracker.Phase.Idle) {
            delay(250)
            now = System.currentTimeMillis()
            if (tracker.tick(now)) calls.leave()
        }
    }

    val counting = (tracker.phase as? AloneTracker.Phase.Counting)?.takeIf { show } ?: return
    Column(
        modifier
            .padding(horizontal = WZ.Space.space5)
            .floatingGlass(RoundedCornerShape(WZ.Radius.xl))
            .padding(WZ.Space.space5),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Text(tr("call.aloneTitle"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
        Text(
            L10n.format("call.aloneLeaving", tracker.secondsLeft(now).coerceAtLeast(if (counting.endsAt > now) 1 else 0)),
            style = wizardFont(WZ.FontSize.sm),
            color = theme.textMuted,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
            Action(tr("call.stay"), theme.accent) { tracker.stay(); now = System.currentTimeMillis() }
            if (calls.ring == CallManager.RingState.unanswered || calls.ring == CallManager.RingState.declined) {
                Action(tr("call.ringAgain"), theme.accent) { calls.ringAgain(); tracker.stay(); now = System.currentTimeMillis() }
            }
            Action(tr("call.leaveNow"), theme.error) { calls.leave() }
        }
    }
}

@Composable
private fun Action(label: String, color: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    Text(
        label,
        Modifier.clickable(onClick = onClick).padding(vertical = WZ.Space.space2),
        style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
        color = color,
    )
}
