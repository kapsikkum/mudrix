package org.wizardchat.android.ui.login

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.QrLogin
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SecondaryButton
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.QrLoginControl
import org.wizardchat.core.QrLoginStatus
import org.wizardchat.tokens.WZ

private enum class QrMode { Scan, Show }

/** Where a QR sign-in is: what to show next and what to ask for */
internal class QrFlow(private val scope: CoroutineScope) {
    sealed interface Step {
        data object Starting : Step
        data object Finishing : Step
        data object Done : Step
        class ShowQr(val modules: Array<BooleanArray>) : Step
        data object EnterCode : Step
        data class ShowCode(val check: String?, val approval: String?) : Step
        data class Approve(val url: String) : Step
        data class Failed(val messageKey: String) : Step
    }

    var step by mutableStateOf<Step>(Step.Starting)
        private set
    var code by mutableStateOf("")
        private set
    var codeError by mutableStateOf(false)
        private set
    private var checkCode: String? = null
    private var control: QrLoginControl? = null
    private var cancelled = false

    fun editCode(value: String) {
        code = value.filter(Char::isDigit).take(2)
        codeError = false
    }

    /** Runs `work` (which reports progress through the listener) until it succeeds or fails */
    suspend fun run(work: suspend (QrLoginControl, (QrLoginStatus) -> Unit) -> Unit) {
        try {
            val control = QrLoginControl.create()
            this.control = control
            work(control) { status -> scope.launch { update(status) } }
            if (!cancelled) step = Step.Done
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            if (!cancelled) step = Step.Failed(QrLogin.failureKey(e.message ?: e.toString()))
        }
    }

    private fun update(status: QrLoginStatus) {
        if (cancelled) return
        when (status) {
            QrLoginStatus.Starting -> step = Step.Starting
            is QrLoginStatus.ShowQr -> QrLogin.modulesOfBase64(status.data)?.let { step = Step.ShowQr(it) }
            QrLoginStatus.EnterCheckCode -> step = Step.EnterCode
            is QrLoginStatus.ShowCheckCode -> {
                checkCode = QrLogin.checkCodeText(status.code)
                step = Step.ShowCode(checkCode, null)
            }
            is QrLoginStatus.WaitingForApproval -> step = Step.ShowCode(checkCode, status.user_code?.takeIf { it.isNotEmpty() })
            is QrLoginStatus.ApproveInBrowser -> {
                step = Step.Approve(status.url)
                scope.launch {
                    try {
                        control?.confirm()
                    } catch (e: Exception) {
                        step = Step.Failed(QrLogin.failureKey(e.message ?: e.toString()))
                    }
                }
            }
            QrLoginStatus.SyncingSecrets -> step = Step.Finishing
            QrLoginStatus.Done -> step = Step.Done
        }
    }

    fun sendCode() {
        val number = code.trim().takeIf { it.length == 2 }?.toIntOrNull()
        if (number == null) {
            codeError = true
            return
        }
        step = Step.Finishing
        scope.launch {
            try {
                control?.sendCheckCode(number.toLong())
            } catch (e: Exception) {
                step = Step.Failed(QrLogin.failureKey(e.message ?: e.toString()))
            }
        }
    }

    fun cancel() {
        cancelled = true
        val control = control ?: return
        scope.launch { runCatching { control.cancel() } }
    }
}

/** Signing in on this new device through one that is signed in: scan its QR code or show ours */
@Composable
fun QrSignInSheet(server: String, onDismiss: () -> Unit) {
    val session = LocalSession.current
    QrSheet(
        title = tr("auth.qr.signInTitle"),
        showSteps = listOf("auth.qr.signInStep1", "auth.qr.signInStep2", "auth.qr.signInStep3"),
        introSteps = listOf("auth.qr.scanStep1", "auth.qr.scanStep2", "auth.qr.scanStep3", "auth.qr.scanStep4"),
        doneKey = null,
        onDismiss = onDismiss,
    ) { scanned, control, listener -> session.loginWithQr(server, scanned, control, listener) }
}

/** Letting a new device sign in through this one */
@Composable
fun LinkDeviceSheet(onDismiss: () -> Unit) {
    val session = LocalSession.current
    QrSheet(
        title = tr("auth.qr.linkTitle"),
        showSteps = listOf("auth.qr.linkStep1", "auth.qr.linkStep2", "auth.qr.linkStep3"),
        introSteps = null,
        doneKey = "auth.qr.linkDone",
        onDismiss = onDismiss,
    ) { scanned, control, listener -> session.linkDevice(scanned, control, listener) }
}

@Composable
private fun QrSheet(
    title: String,
    showSteps: List<String>,
    introSteps: List<String>?,
    doneKey: String?,
    onDismiss: () -> Unit,
    work: suspend (ByteArray?, QrLoginControl, (QrLoginStatus) -> Unit) -> Unit,
) {
    // Signing in starts with a few steps to follow; linking from a signed-in device goes straight to the camera
    var mode by remember { mutableStateOf<QrMode?>(if (introSteps == null) QrMode.Scan else null) }
    // Both screens are rebuilt when the mode changes, so a half-done attempt never leaks into the next
    WizardSheet(onDismiss = {}) {
        SheetTopBar(title, leading = {}, trailing = { BarTextButton(tr("common.cancel"), onDismiss) })
        Box(
            Modifier
                .fillMaxWidth()
                .background(theme.bgSecondary)
                .navigationBarsPadding(),
        ) {
            val current = mode
            if (current == null) {
                QrIntro(introSteps.orEmpty()) { mode = QrMode.Scan }
            } else {
                QrAttempt(
                    mode = current,
                    showSteps = showSteps,
                    doneKey = doneKey,
                    switchMode = { mode = if (current == QrMode.Scan) QrMode.Show else QrMode.Scan },
                    onClose = onDismiss,
                    work = work,
                    key = current,
                )
            }
        }
    }
}

@Composable
private fun QrIntro(steps: List<String>, onReady: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(WZ.Space.space7),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
    ) {
        QrHeader("devices", tr("auth.qr.scanIntroTitle"), tr("auth.qr.scanIntroNote"))
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(WZ.Radius.xl)).background(theme.bgPrimary).padding(WZ.Space.space6),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            steps.forEachIndexed { index, step ->
                Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4), verticalAlignment = Alignment.Top) {
                    Box(Modifier.clip(CircleShape).background(theme.fill).padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space1)) {
                        Text("${index + 1}", style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
                    }
                    Text(tr(step), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                }
            }
        }
        PrimaryButton(tr("auth.qr.readyToScan"), onReady)
    }
}

@Composable
private fun QrHeader(icon: String, title: String, note: String? = null) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
        Box(
            Modifier.clip(RoundedCornerShape(WZ.Radius.lg)).background(theme.fill).padding(WZ.Space.space4),
            contentAlignment = Alignment.Center,
        ) { PhIcon(icon, size = WZ.SizeIcon.xl, tint = theme.textPrimary) }
        Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
        if (note != null) Text(note, style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
    }
}

@Composable
private fun QrAttempt(
    mode: QrMode,
    showSteps: List<String>,
    doneKey: String?,
    switchMode: () -> Unit,
    onClose: () -> Unit,
    work: suspend (ByteArray?, QrLoginControl, (QrLoginStatus) -> Unit) -> Unit,
    key: Any,
) {
    val scope = rememberCoroutineScope()
    val flow = remember(key) { QrFlow(scope) }
    var scanned by remember(key) { mutableStateOf(false) }
    val uriHandler = LocalUriHandler.current

    fun start(bytes: ByteArray?) {
        scope.launch { flow.run { control, listener -> work(bytes, control, listener) } }
    }
    LaunchedEffect(key) { if (mode == QrMode.Show) start(null) }
    DisposableEffect(key) { onDispose { flow.cancel() } }

    if (mode == QrMode.Scan && !scanned) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(WZ.Space.space7),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space7),
        ) {
            QrHeader("camera", tr("auth.qr.scanTitle"))
            Box(Modifier.widthIn(max = WZ.SizeMedia.maxWidth).fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(WZ.Radius.xl))) {
                QrScannerView({ bytes ->
                    scanned = true
                    start(bytes)
                }, Modifier.matchParentSize())
                ScanFrame(Modifier.matchParentSize().padding(WZ.Space.space7))
            }
            SecondaryButton(tr("auth.qr.showQrInstead"), switchMode)
        }
        return
    }

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(WZ.Space.space7),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
    ) {
        val body = wizardFont(WZ.FontSize.md)
        when (val step = flow.step) {
            QrFlow.Step.Starting, QrFlow.Step.Finishing -> Spinner()
            is QrFlow.Step.ShowQr -> {
                QrImage(step.modules, Modifier.widthIn(max = WZ.Size.sidebar).fillMaxWidth())
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    showSteps.forEachIndexed { index, text -> Text("${index + 1}. ${tr(text)}", style = body, color = theme.textPrimary) }
                }
                SecondaryButton(tr("auth.qr.scanQrInstead"), switchMode)
            }
            QrFlow.Step.EnterCode -> {
                Text(tr("auth.qr.enterCode"), style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                WizardTextField(
                    flow.code,
                    flow::editCode,
                    "00",
                    Modifier.widthIn(max = WZ.SizeAvatar.xl * 2),
                    keyboardType = KeyboardType.Number,
                    onSubmit = flow::sendCode,
                )
                if (flow.codeError) Text(tr("auth.qr.codeMismatch"), style = wizardFont(WZ.FontSize.sm), color = theme.error)
                Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    SecondaryButton(tr("common.decline"), {
                        flow.cancel()
                        onClose()
                    }, Modifier.weight(1f))
                    PrimaryButton(tr("common.continue"), flow::sendCode, Modifier.weight(1f), enabled = flow.code.length == 2)
                }
            }
            is QrFlow.Step.ShowCode -> {
                step.check?.let {
                    Text(tr("auth.qr.showCode"), style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                    Text(it, style = wizardFont(WZ.FontSize.display, FontWeight.Bold), color = theme.accent)
                }
                step.approval?.let {
                    Text(tr("auth.qr.showApprovalCode"), style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                    Text(it, style = wizardFont(WZ.FontSize.display, FontWeight.Bold), color = theme.accent)
                }
                Text(tr("auth.qr.waitingForApproval"), style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                Spinner()
            }
            is QrFlow.Step.Approve -> {
                Text(tr("auth.qr.approveInBrowser"), style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                Spinner()
                SecondaryButton(tr("auth.qr.openApproval"), { uriHandler.openUri(step.url) })
                LaunchedEffect(step.url) { uriHandler.openUri(step.url) }
            }
            QrFlow.Step.Done -> {
                if (doneKey != null) {
                    PhIcon("check-circle", org.wizardchat.android.ui.PhWeight.fill, size = WZ.SizeIcon.xxl, tint = theme.success)
                    Text(tr(doneKey), style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                    PrimaryButton(tr("common.close"), onClose)
                } else {
                    Spinner()
                }
            }
            is QrFlow.Step.Failed -> {
                PhIcon("x-circle", size = WZ.SizeIcon.xxl, tint = theme.error)
                Text(tr(step.messageKey), style = body, color = theme.textPrimary, textAlign = TextAlign.Center)
                SecondaryButton(tr("common.close"), onClose)
            }
        }
    }
}

/** The QR code on white, with the quiet zone readers need */
@Composable
private fun QrImage(modules: Array<BooleanArray>, modifier: Modifier = Modifier) {
    val label = tr("auth.qr.qrLabel")
    val quiet = 2
    Canvas(
        modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(Color.White)
            .padding(WZ.Space.space4)
            .semantics { contentDescription = label },
    ) {
        val count = modules.size + quiet * 2
        val cell = size.width / count
        modules.forEachIndexed { y, row ->
            row.forEachIndexed { x, dark ->
                if (dark) {
                    drawRect(
                        Color.Black,
                        Offset((x + quiet) * cell, (y + quiet) * cell),
                        Size(cell + 0.5f, cell + 0.5f),
                    )
                }
            }
        }
    }
}

/** Four white corners to aim the camera with */
@Composable
private fun ScanFrame(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val arm = minOf(size.width, size.height) * 0.18f
        val stroke = WZ.Space.space2.toPx()
        val white = Color.White
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(white, Offset(x1, y1), Offset(x2, y2), stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round)
        val w = size.width
        val h = size.height
        line(0f, arm, 0f, 0f); line(0f, 0f, arm, 0f)
        line(w - arm, 0f, w, 0f); line(w, 0f, w, arm)
        line(0f, h - arm, 0f, h); line(0f, h, arm, h)
        line(w - arm, h, w, h); line(w, h, w, h - arm)
    }
}
