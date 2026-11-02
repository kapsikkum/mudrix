package org.wizardchat.android

import android.app.Application
import androidx.compose.runtime.staticCompositionLocalOf
import org.wizardchat.android.matrix.AppPreferences
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.MediaLoader
import org.wizardchat.core.CoreInit

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
    }

    companion object {
        lateinit var instance: WizardApplication
            private set
    }
}

val LocalSession = staticCompositionLocalOf<MatrixSession> { error("no session") }
val LocalPrefs = staticCompositionLocalOf<AppPreferences> { error("no preferences") }
val LocalMedia = staticCompositionLocalOf<MediaLoader?> { null }
