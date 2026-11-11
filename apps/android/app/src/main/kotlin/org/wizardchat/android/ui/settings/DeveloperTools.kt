package org.wizardchat.android.ui.settings

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.deviceId
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.EncryptionStatus
import org.wizardchat.core.ServerFeatures
import org.wizardchat.tokens.WZ

/** What the debug text holds: the session, sync and encryption state, never the access token */
internal fun debugInfo(
    userId: String?,
    deviceId: String?,
    homeserver: String?,
    version: String,
    syncState: String,
    joined: Int,
    invited: Int,
    encryption: EncryptionStatus?,
    features: ServerFeatures?,
): String = buildString {
    appendLine("User ID: ${userId ?: "-"}")
    appendLine("Device ID: ${deviceId ?: "-"}")
    appendLine("Homeserver: ${homeserver ?: "-"}")
    appendLine("App version: $version")
    appendLine("Sync state: $syncState")
    appendLine("Rooms: $joined joined, $invited invited")
    if (encryption != null) {
        appendLine("Cross-signing: ${encryption.crossSigningComplete}")
        appendLine("Recovery: ${encryption.recovery}")
        appendLine("Key backup: ${encryption.backupEnabled}")
        appendLine("Device verified: ${encryption.deviceVerified}")
    }
    if (features != null) {
        appendLine("Spec versions: ${features.versions.joinToString(", ")}")
        appendLine("Server features: ${features.unstableFeatures.joinToString(", ")}")
    }
}

/** Settings > Developer: the session, the encryption state, what the server supports and a few maintenance tools */
@Composable
internal fun DeveloperToolsSections() {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var features by remember { mutableStateOf<ServerFeatures?>(null) }
    var cleared by remember { mutableStateOf(false) }
    LaunchedEffect(session.client) {
        features = session.client?.let { runCatching { it.serverFeatures() }.getOrNull() }
    }
    val roomList = session.roomList
    val joined = roomList?.joinedRooms?.size ?: 0
    val invited = roomList?.invites?.size ?: 0
    val version = remember {
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "?"
    }
    val encryption = session.encryption

    SettingsSection(tr("settings.developer.session")) {
        CopyRow(tr("settings.developer.userId"), session.userId.orEmpty())
        SettingsDivider()
        CopyRow(tr("settings.developer.appVersion"), version)
        SettingsDivider()
        CopyRow(tr("settings.developer.syncState"), session.syncState.name)
        SettingsDivider()
        CopyRow(tr("settings.developer.rooms"), L10n.format("settings.developer.roomsValue", joined, invited))
        features?.versions?.lastOrNull()?.let {
            SettingsDivider()
            CopyRow(tr("settings.developer.specVersion"), it)
        }
    }
    SettingsSection(tr("settings.developer.encryption")) {
        if (encryption == null) {
            SettingsItem { Text(tr("settings.developer.cryptoUnavailable"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted) }
        } else {
            val yes = tr("settings.developer.ready")
            val no = tr("settings.developer.notReady")
            fun ready(on: Boolean) = if (on) yes else no
            CopyRow(tr("settings.developer.crossSigning"), ready(encryption.crossSigningComplete))
            SettingsDivider()
            CopyRow(tr("settings.developer.secretStorage"), ready(encryption.recovery == "enabled"))
            SettingsDivider()
            CopyRow(tr("settings.developer.keyBackup"), ready(encryption.backupEnabled))
        }
    }
    features?.let { f ->
        val all = f.unstableFeatures
        SettingsSection(L10n.format("settings.developer.serverFeatures", all.size)) {
            all.forEachIndexed { index, feature ->
                if (index > 0) SettingsDivider()
                CopyRow(feature, feature)
            }
        }
    }
    SettingsSection(tr("settings.developer.tools")) {
        ToolRow(tr("settings.developer.copyDebugInfo")) {
            val text = debugInfo(
                session.userId,
                session.deviceId,
                session.client?.session?.homeserverUrl,
                version,
                session.syncState.name,
                joined,
                invited,
                encryption,
                features,
            )
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("debug", text))
            CopyToast.show(L10n.format("common.copied"))
        }
        SettingsDivider()
        ToolRow(tr("settings.developer.clearMedia")) {
            scope.launch {
                withContext(Dispatchers.IO) { File(context.cacheDir, "media").deleteRecursively() }
                cleared = true
                CopyToast.show(L10n.format("settings.developer.clearMediaDone"))
            }
        }
    }
}

@Composable
private fun ToolRow(label: String, onClick: () -> Unit) {
    Text(
        label,
        Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = WZ.Space.space11).padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        style = wizardFont(WZ.FontSize.md),
        color = theme.accent,
    )
}
