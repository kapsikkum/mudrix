package chat.mudrix.android

import android.app.Application
import androidx.compose.runtime.staticCompositionLocalOf
import chat.mudrix.android.integrations.IntegrationNetwork
import chat.mudrix.android.matrix.AppPreferences
import chat.mudrix.android.matrix.CallManager
import chat.mudrix.android.matrix.MatrixSession
import chat.mudrix.android.matrix.MediaLoader
import chat.mudrix.core.CoreInit

class WizardApplication : Application() {
    lateinit var session: MatrixSession
        private set
    lateinit var prefs: AppPreferences
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        CoreInit.load(this)
        prefs = AppPreferences(this)
        session = MatrixSession()
        // Lookups nobody asked for (a card on screen) stay off the network while streamer mode is on
        IntegrationNetwork.setPassiveBlocker { prefs.streamerModeActive(CallManager.shared.screenSharing) }
    }

    companion object {
        lateinit var instance: WizardApplication
            private set
    }
}

val LocalSession = staticCompositionLocalOf<MatrixSession> { error("no session") }
val LocalPrefs = staticCompositionLocalOf<AppPreferences> { error("no preferences") }
val LocalMedia = staticCompositionLocalOf<MediaLoader?> { null }
