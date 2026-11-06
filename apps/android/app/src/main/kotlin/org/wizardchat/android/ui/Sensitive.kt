package org.wizardchat.android.ui

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.unit.dp
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.matrix.CallManager

/** Whether streamer mode hides private details now (always when chosen, or "auto" while this device shares its screen) */
@Composable
fun isStreamerModeActive(): Boolean {
    val prefs = LocalPrefs.current
    return prefs.streamerModeActive(CallManager.shared.screenSharing)
}

/**
 * Blurs private details (user ID, e-mail addresses, session IPs, recovery key) in streamer mode.
 * Android before 12 cannot blur, so there they are hidden instead.
 */
@Composable
fun Modifier.sensitive(): Modifier {
    if (!isStreamerModeActive()) return this
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) blur(8.dp) else alpha(0f)
}
