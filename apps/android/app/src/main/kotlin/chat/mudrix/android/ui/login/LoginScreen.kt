package chat.mudrix.android.ui.login

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import chat.mudrix.android.BrowserLogin
import chat.mudrix.android.LocalSession
import chat.mudrix.android.matrix.SignInIdentifier
import chat.mudrix.android.ui.Chip
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.LineDivider
import chat.mudrix.android.ui.Note
import chat.mudrix.android.ui.PhIcon
import chat.mudrix.android.ui.PrimaryButton
import chat.mudrix.android.ui.SecondaryButton
import chat.mudrix.android.ui.WizardLogo
import chat.mudrix.android.ui.WizardTextField
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.core.IdentityProvider
import chat.mudrix.core.RegistrationInfo
import chat.mudrix.core.ServerInfo
import chat.mudrix.core.MudrixClient
import chat.mudrix.core.WizardError
import chat.mudrix.tokens.WZ

private enum class Mode { Login, Register }
private enum class UsernameState { Idle, Checking, Available, Taken, Reserved, Invalid }

private val PRESETS = listOf("https://matrix.org", "https://mozilla.org", "https://unredacted.org")
private const val CUSTOM = "custom"
private val LOCALPART = Regex("^[a-z0-9._=\\-/+]+$")
/**
 * Sign in or create an account. Asks the server what it supports first and only offers that: the
 * server's own page (OIDC), a password form, or single sign-on.
 */
@Composable
fun LoginScreen() {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var mode by remember { mutableStateOf(Mode.Login) }
    // One quiet line that opens into an address box, like the web's ServerPicker
    var serverInput by remember { mutableStateOf(ServerStep.host(PRESETS[0])) }
    var info by remember { mutableStateOf<ServerInfo?>(null) }
    var registration by remember { mutableStateOf<RegistrationInfo?>(null) }
    var registrationRateLimited by remember { mutableStateOf(false) }
    var unreachable by remember { mutableStateOf(false) }
    var notMatrix by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var usernameState by remember { mutableStateOf(UsernameState.Idle) }
    var busy by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showQr by remember { mutableStateOf(false) }

    val server = ServerStep.address(serverInput)
    val serverName = ServerStep.host(serverInput)

    val identifier = SignInIdentifier.interpret(username, serverName)
    val byEmail = identifier?.isEmailOrPhone == true

    fun message(error: Throwable): String = when {
        error is WizardError && error.code == "notMatrix" -> L10n.format("welcome.errNotAServer")
        mode == Mode.Login && byEmail && error is WizardError && error.code == "invalidCredentials" ->
            L10n.format("welcome.errWrongEmail", serverName)
        mode == Mode.Login && byEmail && error is WizardError &&
            error.errcode in setOf("M_INVALID_USERNAME", "M_INVALID_PARAM", "M_UNKNOWN", "M_UNRECOGNIZED") ->
            L10n.format("welcome.errNoEmailLogin")
        error is WizardError && error.code == "invalidCredentials" -> L10n.format("auth.errors.credentials")
        error is WizardError && error.code == "homeserver" -> L10n.format("auth.errors.homeserver", server)
        error is WizardError -> L10n.format("auth.errors.generic", error.message)
        else -> L10n.format("auth.loginFailed", error.message ?: error.toString())
    }

    fun signInWithBrowser(sso: IdentityProvider? = null, createAccount: Boolean = false) = scope.launch {
        busy = true
        errorMessage = null
        try {
            val url = session.startBrowserLogin(server, sso, createAccount)
            val callback = BrowserLogin.open(context, url)
            if (callback == null) session.cancelBrowserLogin() else session.finishBrowserLogin(callback.toString())
        } catch (error: Exception) {
            session.cancelBrowserLogin()
            errorMessage = message(error)
        } finally {
            busy = false
        }
    }

    fun logInWithPassword() = scope.launch {
        if (identifier == null || password.isEmpty()) {
            errorMessage = L10n.format("auth.fillAllFields")
            return@launch
        }
        if (notMatrix) {
            errorMessage = L10n.format("welcome.errNotAServer")
            return@launch
        }
        busy = true
        errorMessage = null
        try {
            session.login(server, identifier.toCore(), password)
        } catch (error: Exception) {
            errorMessage = message(error)
        } finally {
            busy = false
        }
    }

    val usernameError = usernameState in listOf(UsernameState.Taken, UsernameState.Reserved, UsernameState.Invalid)
    val canRegister = username.isNotEmpty() && password.length >= 8 && !usernameError && usernameState != UsernameState.Checking

    fun register() = scope.launch {
        if (!canRegister) return@launch
        // Only flows without extra steps (dummy, terms) can be completed here
        val flows = registration?.flows.orEmpty()
        val supported = { stage: String -> stage == "m.login.dummy" || stage == "m.login.terms" }
        if (flows.isNotEmpty() && flows.none { flow -> flow.all(supported) }) {
            errorMessage = L10n.format("auth.additionalVerification", flows.joinToString(", ") { it.joinToString(" -> ") })
            return@launch
        }
        busy = true
        errorMessage = null
        try {
            session.register(server, username, password)
        } catch (error: WizardError) {
            errorMessage = when (error.errcode) {
                "M_USER_IN_USE" -> L10n.format("auth.usernameTaken")
                "M_INVALID_USERNAME" -> L10n.format("auth.invalidUsername")
                "M_EXCLUSIVE" -> L10n.format("auth.usernameReserved")
                "M_WEAK_PASSWORD" -> L10n.format("auth.weakPassword", error.message)
                else -> L10n.format("auth.registrationFailed", error.message)
            }
        } catch (error: Exception) {
            errorMessage = L10n.format("auth.registrationFailed", error.message ?: "")
        } finally {
            busy = false
        }
    }

    LaunchedEffect(server) {
        info = null
        registration = null
        registrationRateLimited = false
        unreachable = false
        notMatrix = false
        errorMessage = null
        if (serverName.isEmpty()) return@LaunchedEffect
        checking = true
        try {
            delay(400)
            val discovered = session.discover(server)
            try {
                registration = MudrixClient.registrationInfo(discovered.homeserverUrl)
            } catch (error: WizardError) {
                registrationRateLimited = error.errcode == "M_LIMIT_EXCEEDED"
            } catch (_: Exception) {
            }
            info = discovered
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: WizardError) {
            if (error.code == "notMatrix") notMatrix = true else unreachable = true
        } catch (_: Exception) {
            unreachable = true
        } finally {
            checking = false
        }
    }

    LaunchedEffect(server, username, mode, registration?.enabled) {
        if (mode != Mode.Register || username.isEmpty() || registration?.enabled != true) {
            usernameState = UsernameState.Idle
            return@LaunchedEffect
        }
        if (!LOCALPART.matches(username)) {
            usernameState = UsernameState.Invalid
            return@LaunchedEffect
        }
        usernameState = UsernameState.Checking
        delay(500)
        usernameState = try {
            if (MudrixClient.usernameAvailable(server, username)) UsernameState.Available else UsernameState.Taken
        } catch (error: WizardError) {
            when (error.errcode) {
                "M_USER_IN_USE" -> UsernameState.Taken
                "M_INVALID_USERNAME" -> UsernameState.Invalid
                "M_EXCLUSIVE" -> UsernameState.Reserved
                else -> UsernameState.Idle
            }
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (_: Exception) {
            UsernameState.Idle
        }
    }

    if (showQr) QrSignInSheet(server) { showQr = false }

    Box(Modifier.fillMaxSize().background(theme.bgPrimary)) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = WZ.Space.space8, vertical = WZ.Space.space10),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space6, Alignment.CenterVertically),
        ) {
            WizardLogo(WZ.SizeAvatar.xl)
            Column(
                Modifier.padding(bottom = WZ.Space.space4),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                Text(tr("auth.title"), style = wizardFont(WZ.FontSize.display, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
                Text(tr("auth.tagline"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
            }

            Column(
                Modifier.widthIn(max = WZ.SizeMedia.maxWidth).fillMaxWidth().animateContentSize(),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
            ) {
                Text(
                    tr(if (mode == Mode.Login) "auth.login" else "auth.register"),
                    style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                    color = theme.textPrimary,
                )

                ServerPicker(
                    input = serverInput,
                    onInput = { serverInput = it },
                    label = tr(if (mode == Mode.Login) "welcome.serverLabelLogin" else "welcome.serverLabelRegister"),
                    state = ServerStep.state(serverInput, checking, info != null, notMatrix, unreachable),
                    software = info?.software?.let { listOf(it.name, it.version).filter(String::isNotEmpty).joinToString(" ") }.orEmpty(),
                )

                val discovered = info
                when {
                    discovered != null && mode == Mode.Login -> {
                        if (discovered.oauth) {
                            PrimaryButton(tr(if (busy) "auth.redirecting" else "auth.oidcLogin"), { signInWithBrowser() }, enabled = !busy)
                            SecondaryButton(tr("auth.qr.signInTitle"), { showQr = true }, enabled = !busy)
                        }
                        if (discovered.password) {
                            WizardTextField(username, { username = it }, tr("auth.username"), keyboardType = KeyboardType.Email)
                            if (identifier is SignInIdentifier.Email || identifier is SignInIdentifier.Phone) {
                                Text(
                                    tr(if (identifier is SignInIdentifier.Email) "welcome.idEmail" else "welcome.idPhone"),
                                    style = wizardFont(WZ.FontSize.sm),
                                    color = theme.textMuted,
                                )
                            }
                            WizardTextField(password, { password = it }, tr("auth.password"), password = true, onSubmit = { logInWithPassword() })
                            PrimaryButton(
                                tr(if (busy) "auth.loggingIn" else "auth.login"),
                                { logInWithPassword() },
                                enabled = !busy && identifier != null && password.isNotEmpty(),
                            )
                        }
                        SsoButtons(discovered, afterPassword = discovered.password, busy) { signInWithBrowser(sso = it) }
                        if (!discovered.oauth && !discovered.password && discovered.sso.isEmpty()) Note(tr("auth.noLoginMethod"))
                    }
                    discovered != null -> {
                        val passwordRegister = !discovered.oauth && registration?.enabled == true
                        if (discovered.oauth) {
                            PrimaryButton(
                                tr(if (busy) "auth.redirecting" else "auth.oidcRegister"),
                                { signInWithBrowser(createAccount = true) },
                                enabled = !busy,
                            )
                        }
                        if (passwordRegister) {
                            WizardTextField(username, { username = it }, tr("auth.username"))
                            usernameHint(usernameState, username, serverName)?.let { hint ->
                                Text(hint, style = wizardFont(WZ.FontSize.sm), color = if (usernameError) theme.error else theme.textMuted)
                            }
                            WizardTextField(password, { password = it }, tr("auth.password"), password = true, onSubmit = { register() })
                            if (password.isNotEmpty() && password.length < 8) {
                                Text(tr("auth.passwordTooShort"), style = wizardFont(WZ.FontSize.sm), color = theme.error)
                            }
                            PrimaryButton(tr(if (busy) "auth.registering" else "auth.registerSubmit"), { register() }, enabled = !busy && canRegister)
                        }
                        if (!discovered.oauth) SsoButtons(discovered, afterPassword = passwordRegister, busy) { signInWithBrowser(sso = it) }
                        if (!discovered.oauth && !passwordRegister && discovered.sso.isEmpty()) {
                            Note(tr(if (registrationRateLimited) "auth.registrationRateLimited" else "auth.registrationUnavailable"))
                        }
                    }
                }

                errorMessage?.let {
                    Text(it, Modifier.fillMaxWidth(), style = wizardFont(WZ.FontSize.sm), color = theme.error, textAlign = TextAlign.Center)
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2, Alignment.CenterHorizontally)) {
                    Text(tr(if (mode == Mode.Login) "auth.noAccount" else "auth.haveAccount"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                    Text(
                        tr(if (mode == Mode.Login) "auth.register" else "auth.login"),
                        Modifier.clickable {
                            mode = if (mode == Mode.Login) Mode.Register else Mode.Login
                            errorMessage = null
                            password = ""
                        },
                        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                        color = theme.accent,
                    )
                }
            }
        }
    }
}

/**
 * Which server the account is on, folded into one quiet line ("matrix.org — Change") like the web's
 * `ServerPicker`, so someone who has never heard of homeservers can ignore it. Opened, it is an address
 * box with the popular servers one tap away and the discovery result under it.
 */
@Composable
private fun ServerPicker(
    input: String,
    onInput: (String) -> Unit,
    label: String,
    state: ServerStep.State,
    software: String,
) {
    var open by remember { mutableStateOf(false) }
    val host = ServerStep.host(input)
    val status = when (state) {
        ServerStep.State.empty -> tr("welcome.serverEmpty")
        // A non-http scheme is refused rather than turned into an https address
        ServerStep.State.invalid -> tr("welcome.serverIncomplete")
        ServerStep.State.checking -> tr("auth.checkingServer")
        ServerStep.State.ok -> if (software.isNotEmpty()) tr("welcome.serverDetected", software) else tr("welcome.serverDetectedPlain")
        ServerStep.State.notMatrix -> tr("welcome.serverNotFound")
        ServerStep.State.unreachable -> tr("auth.serverUnreachable")
    }
    val statusColor = when (state) {
        ServerStep.State.invalid, ServerStep.State.notMatrix, ServerStep.State.unreachable -> theme.error
        ServerStep.State.ok -> theme.success
        else -> theme.textMuted
    }
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        if (!open) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = WZ.Space.space11)
                    .clip(RoundedCornerShape(WZ.Radius.lg))
                    .background(theme.fill)
                    .clickable { open = true }
                    .padding(horizontal = WZ.Space.space5),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                PhIcon("globe-simple", size = WZ.SizeIcon.lg, tint = theme.textMuted)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space0)) {
                    Text(host.ifEmpty { label }, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary, maxLines = 1)
                    Text(status, style = wizardFont(WZ.FontSize.sm), color = statusColor, maxLines = 1)
                }
                Text(
                    tr("welcome.serverChange"),
                    Modifier.clickable { open = true },
                    style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                    color = theme.accent,
                )
            }
        } else {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    tr("welcome.serverAddress"),
                    Modifier.weight(1f),
                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                    color = theme.textMuted,
                )
                Text(
                    tr("welcome.serverDone"),
                    Modifier.clickable { open = false },
                    style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                    color = theme.accent,
                )
            }
            WizardTextField(
                input,
                onInput,
                tr("welcome.serverPlaceholder"),
                keyboardType = KeyboardType.Uri,
                onSubmit = { open = false },
            )
            Text(status, style = wizardFont(WZ.FontSize.sm), color = statusColor)
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                ServerStep.POPULAR.forEach { preset ->
                    Chip(
                        ServerStep.host(preset),
                        ServerStep.host(preset) == host,
                        { onInput(ServerStep.host(preset)) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SsoButtons(info: ServerInfo, afterPassword: Boolean, busy: Boolean, onClick: (IdentityProvider) -> Unit) {
    if (info.sso.isEmpty()) return
    if (afterPassword) LineDivider(tr("common.or"))
    info.sso.forEach { provider ->
        SecondaryButton(
            if (provider.id == null) tr("common.continueWithSso") else tr("auth.continueWithIdp", provider.name),
            { onClick(provider) },
            enabled = !busy,
        )
    }
}

@Composable
private fun usernameHint(state: UsernameState, username: String, serverName: String): String? {
    if (username.isEmpty() || serverName.isEmpty()) return null
    val fullId = "@$username:$serverName"
    return when (state) {
        UsernameState.Taken -> tr("auth.usernameTaken")
        UsernameState.Reserved -> tr("auth.usernameReserved")
        UsernameState.Invalid -> tr("auth.usernameInvalidChars")
        UsernameState.Available -> tr("auth.usernameAvailable", fullId)
        UsernameState.Checking -> tr("auth.usernameChecking", fullId)
        UsernameState.Idle -> tr("auth.usernameHint", fullId)
    }
}
