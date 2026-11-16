package chat.mudrix.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * What "auto" streamer mode follows: this device sharing its screen in a call, or the system
 * saying the screen is being recorded (Android 15 and later; earlier versions can't tell).
 */
object StreamerSignals {
    var recording by mutableStateOf(false)

    val sharing: Boolean get() = CallManager.shared.screenSharing || recording

    /** `WindowManager.SCREEN_RECORDING_STATE_VISIBLE` is 1, `..._NOT_VISIBLE` is 0 */
    fun recordingFrom(state: Int): Boolean = state == 1
}
