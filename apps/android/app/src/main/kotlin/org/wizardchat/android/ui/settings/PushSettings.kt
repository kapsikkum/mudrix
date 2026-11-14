package org.wizardchat.android.ui.settings

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.matrix.ListeningSharing
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.push.KeepAliveService
import org.wizardchat.android.push.PushMode
import org.wizardchat.android.push.PushProvider
import org.wizardchat.tokens.WZ

/** "Share what I'm listening to": needs Notification access, which this sends the person to Android's settings for */
@Composable
internal fun ListeningRow() {
    val context = LocalContext.current
    val prefs = LocalPrefs.current
    ToggleRow(
        tr("mobile.listening.share"),
        prefs.shareListening,
        {
            prefs.shareListening = it
            if (it && !ListeningSharing.hasAccess(context)) {
                runCatching {
                    context.startActivity(
                        android.content.Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            }
        },
        note = tr("mobile.listening.note"),
    )
}

/** Android's name for an installed app (a UnifiedPush distributor is an app package) */
internal fun appLabel(context: Context, packageName: String): String =
    runCatching {
        val info = context.packageManager.getApplicationInfo(packageName, 0)
        context.packageManager.getApplicationLabel(info).toString()
    }.getOrDefault(packageName)

/**
 * How notifications arrive with the app closed: which push mode this build has (Firebase, UnifiedPush or neither) and
 * the "Stay connected" service, which keeps the connection open and posts the notifications itself.
 */
@Composable
internal fun PushDeliverySection() {
    val context = LocalContext.current
    val prefs = LocalPrefs.current
    var refresh by remember { mutableIntStateOf(0) }
    val mode = PushMode.current
    val note = when (mode) {
        PushMode.fcm -> tr("mobile.push.fcmNote")
        PushMode.unifiedpush -> tr("mobile.push.unifiedNote")
        PushMode.keepalive -> tr("mobile.push.keepAliveOnlyNote")
    }
    SettingsSection(tr("mobile.push.title"), note = note) {
        if (mode == PushMode.unifiedpush) {
            val distributors = remember(refresh) { PushProvider.distributors(context) }
            val chosen = remember(refresh) { PushProvider.distributor(context) }
            if (distributors.isEmpty()) {
                SettingsItem {
                    Text(tr("mobile.push.noDistributor"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                }
            } else {
                PickerRow(
                    tr("mobile.push.distributor"),
                    chosen,
                    distributors.map { it to appLabel(context, it) },
                    {
                        if (it != null) {
                            PushProvider.chooseDistributor(context, it)
                            refresh++
                        }
                    },
                )
                val error = PushProvider.lastError(context)
                if (error != null) {
                    SettingsDivider()
                    SettingsItem {
                        Text(
                            L10n.format("mobile.push.failed", error),
                            Modifier.fillMaxWidth().padding(vertical = WZ.Space.space1),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.error,
                        )
                    }
                }
            }
            SettingsDivider()
        }
        ToggleRow(
            tr("mobile.push.keepAlive"),
            prefs.keepAlive,
            {
                prefs.keepAlive = it
                KeepAliveService.apply(context)
            },
            note = tr("mobile.push.keepAliveNote"),
        )
    }
}
