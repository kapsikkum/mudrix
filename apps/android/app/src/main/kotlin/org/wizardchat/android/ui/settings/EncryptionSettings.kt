package org.wizardchat.android.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.enableRecovery
import org.wizardchat.android.matrix.hasEncryptionIdentity
import org.wizardchat.android.matrix.resetRecoveryKey
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

@Composable
internal fun EncryptionSettings(onBack: (() -> Unit)?) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val setup = remember { EncryptionSetupState() }
    var hasIdentity by remember { mutableStateOf<Boolean?>(null) }
    var excludeInsecure by remember { mutableStateOf(session.excludesInsecureDevices) }
    var confirmReload by remember { mutableStateOf(false) }
    var confirmReset by remember { mutableStateOf(false) }
    var confirmChangeKey by remember { mutableStateOf(false) }
    var keyReplaced by remember { mutableStateOf(false) }
    val recovery = session.encryption?.recovery
    val hasRecoveryKey = recovery == "enabled" || recovery == "incomplete"

    LaunchedEffect(setup.recoveryKey, setup.busy) {
        if (!setup.busy) hasIdentity = session.hasEncryptionIdentity()
    }

    fun createRecoveryKey(replace: Boolean) {
        setup.busy = true
        setup.error = null
        scope.launch {
            try {
                val key = if (replace) session.resetRecoveryKey() else session.enableRecovery()
                keyReplaced = replace
                setup.recoveryKey = key
            } catch (failure: Exception) {
                setup.error = L10n.format("settings.keyBackup.setupFailed", failure.message ?: failure.toString())
            } finally {
                setup.busy = false
            }
        }
    }

    SettingsPage(tr("settings.encryption.title"), onBack) {
        SettingsSection {
            SettingsItem {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                        Text(tr("settings.encryption.endToEnd"), style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
                        Text(
                            tr(if (hasIdentity == false) "settings.encryption.notSetUpNote" else "settings.encryption.activeNote"),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                        )
                    }
                    when (hasIdentity) {
                        null -> Spinner(size = WZ.SizeIcon.md)
                        true -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                            PhIcon("check-circle", PhWeight.fill, WZ.SizeIcon.sm, tint = theme.success)
                            Text(tr("settings.encryption.active"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.success)
                        }
                        false -> Unit
                    }
                }
                if (hasIdentity == false) {
                    LabelButton(tr("verification.session.setupButton"), null, { setup.run(session, scope) }, primary = true, enabled = !setup.busy)
                }
            }
        }

        SettingsSection {
            ToggleRow(
                tr("settings.encryption.excludeInsecure"),
                excludeInsecure,
                { value ->
                    excludeInsecure = value
                    session.setExcludeInsecureDevices(value)
                    confirmReload = true
                },
                note = tr("settings.encryption.excludeInsecureNote"),
            )
        }

        if (hasIdentity == true) {
            SettingsSection(
                tr("settings.encryption.recoveryKey"),
                tr(if (hasRecoveryKey) "settings.encryption.recoveryKeyActiveNote" else "settings.encryption.recoveryKeyMissingNote"),
            ) {
                SettingsItem {
                    LabelButton(
                        tr(if (hasRecoveryKey) "settings.encryption.changeRecoveryKey" else "settings.encryption.setUpRecoveryKey"),
                        "key",
                        { if (hasRecoveryKey) confirmChangeKey = true else createRecoveryKey(replace = false) },
                        primary = !hasRecoveryKey,
                        enabled = !setup.busy,
                    )
                }
            }

            SettingsSection(tr("settings.encryption.reset"), tr("settings.encryption.resetNote")) {
                SettingsItem {
                    LabelButton(tr("settings.encryption.resetButton"), null, { confirmReset = true }, enabled = !setup.busy, color = theme.danger)
                }
            }
        }

        setup.error?.let { StatusText(it) }
    }

    EncryptionSetupPrompts(setup)

    if (confirmReload) {
        ConfirmDialog(
            title = tr("settings.encryption.excludeInsecure"),
            message = tr("settings.encryption.excludeInsecureReload"),
            confirm = tr("common.reloadNow"),
            danger = false,
            onConfirm = { scope.launch { session.restart() } },
            onDismiss = { confirmReload = false },
        )
    }
    if (confirmChangeKey) {
        ConfirmDialog(
            title = tr("settings.encryption.changeRecoveryKey"),
            message = tr("settings.encryption.changeRecoveryKeyConfirm"),
            confirm = tr("settings.encryption.changeRecoveryKey"),
            onConfirm = { createRecoveryKey(replace = true) },
            onDismiss = { confirmChangeKey = false },
        )
    }
    if (confirmReset) {
        ConfirmDialog(
            title = tr("verification.setupOverwritesTitle"),
            message = tr("verification.setupOverwritesConfirm"),
            confirm = tr("settings.encryption.resetButton"),
            onConfirm = { setup.run(session, scope) },
            onDismiss = { confirmReset = false },
        )
    }
    setup.recoveryKey?.let { key ->
        Dialog(
            onDismissRequest = {},
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false, usePlatformDefaultWidth = false),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(WZ.Space.space6)
                    .background(theme.bgPrimary, RoundedCornerShape(WZ.Radius.xl))
                    .padding(WZ.Space.space7),
            ) {
                RecoveryKeyContent(key, replaced = keyReplaced) {
                    setup.recoveryKey = null
                    keyReplaced = false
                }
            }
        }
    }
}

@Composable
private fun ConfirmDialog(
    title: String,
    message: String,
    confirm: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    danger: Boolean = true,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
        text = { Text(message, style = wizardFont(WZ.FontSize.md), color = theme.textMuted) },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onConfirm()
            }) {
                Text(confirm, color = if (danger) theme.danger else theme.accent, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(tr("common.cancel"), color = theme.accent, style = wizardFont(WZ.FontSize.lg))
            }
        },
    )
}
