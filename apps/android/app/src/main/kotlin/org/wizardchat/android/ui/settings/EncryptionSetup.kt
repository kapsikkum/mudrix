package org.wizardchat.android.ui.settings

import org.wizardchat.android.matrix.deviceId
import org.wizardchat.android.LocalPrefs
import androidx.compose.runtime.LaunchedEffect
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.cancelIdentityReset
import org.wizardchat.android.matrix.enableRecovery
import org.wizardchat.android.matrix.resetIdentity
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SecondaryButton
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.WizardError
import org.wizardchat.tokens.WZ

class EncryptionSetupState {
    var busy by mutableStateOf(false)
    var askPassword by mutableStateOf(false)
    var approvalUrl by mutableStateOf<String?>(null)
    var recoveryKey by mutableStateOf<String?>(null)
    var error by mutableStateOf<String?>(null)
    private var cancelled = false

    fun run(session: MatrixSession, scope: CoroutineScope, password: String? = null) {
        busy = true
        error = null
        cancelled = false
        scope.launch {
            try {
                session.resetIdentity(password) { url -> approvalUrl = url }
                recoveryKey = session.enableRecovery()
                session.checkIdentity()
            } catch (failure: WizardError) {
                if (failure.code == "passwordRequired") {
                    askPassword = true
                } else if (!cancelled) {
                    error = L10n.format("settings.keyBackup.setupFailed", failure.message)
                }
            } catch (failure: Exception) {
                if (!cancelled) error = L10n.format("settings.keyBackup.setupFailed", failure.message ?: failure.toString())
            } finally {
                busy = false
                approvalUrl = null
            }
        }
    }

    fun cancelApproval(session: MatrixSession, scope: CoroutineScope) {
        cancelled = true
        approvalUrl = null
        scope.launch { session.cancelIdentityReset() }
    }
}

@Composable
fun EncryptionSetupPrompts(state: EncryptionSetupState) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    if (state.askPassword) {
        var password by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { state.askPassword = false },
            containerColor = theme.bgPrimary,
            title = { Text(tr("settings.keyBackup.uiaTitle"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    Text(tr("settings.keyBackup.uiaDescription"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                    WizardTextField(password, { password = it }, tr("settings.keyBackup.uiaPasswordLabel"), password = true)
                }
            },
            confirmButton = {
                BarTextButton(tr("common.confirm"), {
                    state.askPassword = false
                    state.run(session, scope, password)
                }, enabled = password.isNotEmpty(), bold = true)
            },
            dismissButton = { BarTextButton(tr("common.cancel"), { state.askPassword = false }) },
        )
    }
    state.approvalUrl?.let { url ->
        AlertDialog(
            onDismissRequest = {},
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
            containerColor = theme.bgPrimary,
            title = { Text(tr("settings.keyBackup.uiaResetTitle"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space5), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(tr("settings.keyBackup.uiaResetDescription"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                    Spinner()
                }
            },
            confirmButton = { BarTextButton(tr("settings.keyBackup.uiaResetCta"), { uriHandler.openUri(url) }, bold = true) },
            dismissButton = { BarTextButton(tr("common.cancel"), { state.cancelApproval(session, scope) }) },
        )
    }
}

@Composable
fun RecoveryKeyContent(recoveryKey: String, replaced: Boolean = false, onDone: () -> Unit) {
    val context = LocalContext.current
    var saved by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
    ) {
        PhIcon("key", size = WZ.SizeIcon.xl, tint = theme.accent)
        Text(tr(if (replaced) "settings.keyBackup.newRecoveryKeyGenerated" else "settings.keyBackup.yourRecoveryKey"), style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
        Text(tr(if (replaced) "settings.keyBackup.oldKeyWarningBody" else "settings.keyBackup.storeKeyWarning"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
        SelectionContainer {
            Text(
                recoveryKey,
                Modifier
                    .fillMaxWidth()
                    .background(theme.fill, RoundedCornerShape(WZ.Radius.lg))
                    .padding(WZ.Space.space5),
                style = wizardFont(WZ.FontSize.md).copy(fontFamily = FontFamily.Monospace),
                color = theme.textPrimary,
                textAlign = TextAlign.Center,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
            SecondaryButton(tr("common.copy"), {
                copyToClipboard(recoveryKey)
                saved = true
            }, Modifier.weight(1f))
            SecondaryButton(tr("common.download"), {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, recoveryKey)
                context.startActivity(Intent.createChooser(send, null))
                saved = true
            }, Modifier.weight(1f))
        }
        PrimaryButton(tr("settings.keyBackup.savedConfirmButton"), onDone, enabled = saved)
    }
}

@Composable
fun EncryptionSetupScreen(state: EncryptionSetupState) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(theme.bgPrimary)
                .safeDrawingPadding()
                .verticalScroll(rememberScrollState())
                .padding(WZ.Space.space7),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                Modifier.widthIn(max = WZ.Size.sidebar * 2).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
            ) {
                Spacer(Modifier.height(WZ.Space.space10))
                val key = state.recoveryKey
                if (key != null) {
                    RecoveryKeyContent(key) { state.recoveryKey = null }
                } else if (session.needsEncryptionSetup) {
                    SetupHeader(tr("verification.session.setupTitle"), tr("verification.session.setupBody"))
                    if (state.busy) {
                        Spinner()
                    } else {
                        PrimaryButton(tr("verification.session.setupButton"), { state.run(session, scope) })
                    }
                    state.error?.let { StatusText(it) }
                    BarTextButton(tr("settings.account.logout"), { scope.launch { session.logout() } }, enabled = !state.busy)
                } else {
                    VerifyContent(state)
                }
            }
        }
        EncryptionSetupPrompts(state)
    }
}

@Composable
private fun SetupHeader(title: String, body: String) {
    PhIcon("shield-check", size = WZ.SizeIcon.xl, tint = theme.accent)
    Text(title, style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
    Text(body, style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
}

@Composable
private fun VerifyContent(state: EncryptionSetupState) {
    val session = LocalSession.current
    val prefs = LocalPrefs.current
    val scope = rememberCoroutineScope()
    var hasOtherVerifiedSession by remember { mutableStateOf(false) }
    var verification by remember { mutableStateOf<VerificationModel?>(null) }
    var showRecoveryKeyEntry by remember { mutableStateOf(false) }
    var confirmReset by remember { mutableStateOf(false) }
    var confirmSkip by remember { mutableStateOf(false) }
    val recovery = session.encryption?.recovery
    val hasRecoveryKey = recovery == "enabled" || recovery == "incomplete"
    val cannotVerify = !hasOtherVerifiedSession && !hasRecoveryKey

    LaunchedEffect(Unit) {
        val devices = runCatching { session.requireClient.devices() }.getOrNull() ?: return@LaunchedEffect
        hasOtherVerifiedSession = devices.any { !it.isCurrent && it.crossSignedByOwner }
    }

    SetupHeader(
        tr("verification.session.title"),
        tr(if (cannotVerify) "verification.session.noWayToVerify" else "verification.session.body"),
    )
    when {
        state.busy -> Spinner()
        cannotVerify -> PrimaryButton(tr("verification.session.resetAndSetUp"), { state.run(session, scope) })
        else -> {
            if (hasOtherVerifiedSession) {
                PrimaryButton(tr("verification.session.useOtherDevice"), { verification = VerificationModel(VerificationModel.Start.OwnDevice) })
            }
            if (hasRecoveryKey) {
                if (hasOtherVerifiedSession) {
                    SecondaryButton(tr("verification.session.useRecoveryKey"), { showRecoveryKeyEntry = true })
                } else {
                    PrimaryButton(tr("verification.session.useRecoveryKey"), { showRecoveryKeyEntry = true })
                }
            }
            TextButton(onClick = { confirmReset = true }) {
                Text(tr("verification.session.reset"), style = wizardFont(WZ.FontSize.md), color = theme.danger)
            }
        }
    }
    state.error?.let { StatusText(it) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
        BarTextButton(tr("verification.session.skip"), { confirmSkip = true }, enabled = !state.busy)
        Text("·", style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        BarTextButton(tr("settings.account.logout"), { scope.launch { session.logout() } }, enabled = !state.busy)
    }

    if (showRecoveryKeyEntry) RecoveryKeyEntrySheet { showRecoveryKeyEntry = false }
    verification?.let { model -> VerificationSheet(model) { verification = null } }
    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            containerColor = theme.bgTertiary,
            title = { Text(tr("verification.setupOverwritesTitle"), style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
            text = { Text(tr("verification.setupOverwritesConfirm"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted) },
            confirmButton = {
                BarTextButton(tr("settings.encryption.resetButton"), {
                    confirmReset = false
                    state.run(session, scope)
                }, bold = true)
            },
            dismissButton = { BarTextButton(tr("common.cancel"), { confirmReset = false }) },
        )
    }
    if (confirmSkip) {
        AlertDialog(
            onDismissRequest = { confirmSkip = false },
            containerColor = theme.bgTertiary,
            title = { Text(tr("verification.session.skipConfirmTitle"), style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
            text = { Text(tr("verification.session.skipConfirmBody"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted) },
            confirmButton = {
                BarTextButton(tr("verification.session.skipConfirm"), {
                    confirmSkip = false
                    prefs.verifySkippedDevice = session.deviceId ?: ""
                }, bold = true)
            },
            dismissButton = { BarTextButton(tr("common.cancel"), { confirmSkip = false }) },
        )
    }
}
