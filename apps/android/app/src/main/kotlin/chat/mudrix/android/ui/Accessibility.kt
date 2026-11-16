package chat.mudrix.android.ui

import android.content.Context
import android.view.View
import android.view.accessibility.AccessibilityManager
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView

/** Touch targets, and what TalkBack is told when something new happens */
object A11y {
    /** Android's minimum touch target, in dp: smaller visuals keep their size, only the tappable area grows */
    const val MIN_TARGET_DP = 48

    /** Longest text read out for one new message; the rest is on screen */
    const val MAX_ANNOUNCE_CHARS = 140

    /** How much padding a [visualDp] wide control needs on each side to reach [MIN_TARGET_DP] */
    fun targetPadding(visualDp: Float): Float = ((MIN_TARGET_DP - visualDp) / 2f).coerceAtLeast(0f)

    /** "Juno: hello", shortened; null when there is nothing to say */
    fun messageText(sender: String, body: String?): String? {
        val text = body?.replace(Regex("\\s+"), " ")?.trim().orEmpty()
        if (sender.isBlank() && text.isEmpty()) return null
        val clipped = if (text.length > MAX_ANNOUNCE_CHARS) text.take(MAX_ANNOUNCE_CHARS).trimEnd() + "…" else text
        return if (clipped.isEmpty()) sender else "$sender: $clipped"
    }

    /**
     * Whether a message that appeared in the open room is announced: only one that arrived after the room was loaded
     * (it is newer than what was last announced or seen) and that somebody else wrote.
     */
    fun announcesMessage(isOwn: Boolean, isNew: Boolean, isContent: Boolean): Boolean = isNew && isContent && !isOwn

    fun screenReaderOn(context: Context): Boolean =
        (context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager)?.isTouchExplorationEnabled == true

    /** Speaks [text] if a screen reader is on (does nothing otherwise) */
    fun announce(view: View, text: String) {
        if (screenReaderOn(view.context)) view.announceForAccessibility(text)
    }
}

/** The tappable area is at least 48 dp square; the control itself keeps its drawn size */
fun Modifier.touchTarget(): Modifier = minimumInteractiveComponentSize()

/** Says [text] to a screen reader whenever it changes to something new (skips the first value) */
@Composable
fun AnnounceChanges(key: Any?, text: () -> String?) {
    val view = LocalView.current
    val first = androidx.compose.runtime.remember { booleanArrayOf(true) }
    androidx.compose.runtime.LaunchedEffect(key) {
        if (first[0]) {
            first[0] = false
            return@LaunchedEffect
        }
        text()?.let { A11y.announce(view, it) }
    }
}
