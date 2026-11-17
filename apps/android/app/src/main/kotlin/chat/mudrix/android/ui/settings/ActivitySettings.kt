package chat.mudrix.android.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import chat.mudrix.android.matrix.ListeningSharing
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ

/**
 * Settings > Activity: what this phone shares about what it plays. Games are not detected on Android, so the page
 * offers the phone's media sessions ("listening to") and shows the track being shared right now, the closest
 * counterpart of the web's Activity page.
 */
@Composable
internal fun ActivitySettings(onBack: () -> Unit) {
    SettingsPage(tr("settings.activity.title"), onBack) {
        SettingsSection(tr("settings.activity.music"), tr("settings.activity.musicNote")) {
            ListeningRow()
        }
        SettingsSection(tr("settings.activity.detected")) {
            SettingsItem {
                val track = ListeningSharing.current
                Column(
                    Modifier.fillMaxWidth().padding(vertical = WZ.Space.space2),
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
                ) {
                    Text(
                        if (track == null) {
                            tr("settings.activity.nothing")
                        } else {
                            tr("settings.activity.nowListening", track.name)
                        },
                        style = wizardFont(WZ.FontSize.md),
                        color = if (track == null) theme.textMuted else theme.textPrimary,
                    )
                    if (track != null && track.details.isNotEmpty()) {
                        Text(
                            tr("profile.activity.listeningBy", track.name, track.details),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                        )
                    }
                }
            }
        }
    }
}
