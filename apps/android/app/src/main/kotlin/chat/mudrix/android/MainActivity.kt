package chat.mudrix.android

import chat.mudrix.android.matrix.deviceId
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import chat.mudrix.android.matrix.StreamerSignals
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import chat.mudrix.android.matrix.CallManager
import chat.mudrix.android.matrix.MatrixSession
import chat.mudrix.android.matrix.MessageNotifier
import chat.mudrix.android.ui.settings.AddAccountScreen
import chat.mudrix.android.ui.settings.EncryptionSetupScreen
import chat.mudrix.android.ui.settings.EncryptionSetupState
import chat.mudrix.android.ui.PrimaryButton
import chat.mudrix.android.ui.WizardLogo
import chat.mudrix.android.ui.home.MainScreen
import chat.mudrix.android.ui.login.LoginScreen
import chat.mudrix.android.ui.theme.MudrixThemeRoot
import chat.mudrix.android.ui.theme.rememberAppTheme
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ

class MainActivity : AppCompatActivity() {
    private val app get() = application as MudrixApplication

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handle(intent)
        setContent {
            // Status and navigation bar icons follow the app's theme, not the system's
            val resolved = rememberAppTheme(app.prefs)
            val dark = resolved.isDark
            LaunchedEffect(dark) {
                val style = if (dark) {
                    SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                }
                enableEdgeToEdge(style, style)
            }
            val inCall = CallManager.shared.isInCall
            LaunchedEffect(inCall) {
                if (inCall) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            CompositionLocalProvider(LocalSession provides app.session, LocalPrefs provides app.prefs) {
                MudrixThemeRoot(resolved) { Root() }
            }
        }
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) {
                lifecycleScope.launch { app.session.pauseSync(keepRunning = CallManager.shared.isInCall || app.prefs.keepAlive) }
            }

            override fun onStart(owner: LifecycleOwner) {
                lifecycleScope.launch { app.session.resumeSync() }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private val recordingWatcher = java.util.function.Consumer<Int> { StreamerSignals.recording = StreamerSignals.recordingFrom(it) }

    override fun onStart() {
        super.onStart()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            StreamerSignals.recording = StreamerSignals.recordingFrom(windowManager.addScreenRecordingCallback(mainExecutor, recordingWatcher))
        }
    }

    override fun onStop() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            windowManager.removeScreenRecordingCallback(recordingWatcher)
            StreamerSignals.recording = false
        }
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        BrowserLogin.resumed()
    }

    private fun handle(intent: Intent?) {
        val uri = intent?.data ?: return
        // Only the server's sign-in redirect may reach the pending login. Room, space and user
        // permalinks are known routes too, but they have no navigator at the activity level yet;
        // everything else (including unknown paths on a callback scheme) is dropped.
        val link = AppLinks.parse(uri) ?: return
        if (link is AppLink.Callback) BrowserLogin.callback(uri)
    }
}

/** An external link the app knows, once its scheme, host and path have been checked */
internal sealed interface AppLink {
    /** The server's sign-in redirect: `chat.mudrix:/callback`, `chat.mudrix://callback`, or the legacy scheme */
    data object Callback : AppLink
    data class Room(val id: String) : AppLink
    data class Space(val id: String) : AppLink
    data class User(val id: String) : AppLink
}

/**
 * The links the app accepts from outside, with the exact routes it knows: permalinks on `matrix.to`
 * and the two app schemes' room, space and user routes, plus the sign-in callback. A link that does
 * not match one of those is rejected as a whole, so no arbitrary URI reaches the browser or login.
 */
internal object AppLinks {
    private const val MATRIX_TO = "matrix.to"
    private val ROOM_ROUTES = setOf("room", "r")
    private val SPACE_ROUTES = setOf("space")
    private val USER_ROUTES = setOf("user", "dm")

    fun parse(uri: Uri): AppLink? = when (uri.scheme?.lowercase()) {
        "https" -> matrixTo(uri)
        in MatrixSession.CALLBACK_SCHEMES -> callback(uri) ?: appRoute(uri)
        else -> null
    }

    /**
     * The callback route only: `<scheme>:/callback` (the registered redirect) or
     * `<scheme>://callback` (a URL parser's reading of it). A host or path beyond that is another
     * route, not a sign-in, even on a callback scheme.
     */
    private fun callback(uri: Uri): AppLink.Callback? {
        if (uri.userInfo != null || uri.port != -1) return null
        val callback = when (uri.host?.lowercase()) {
            null, "" -> uri.path == "/callback"
            "callback" -> uri.path.isNullOrEmpty() || uri.path == "/"
            else -> false
        }
        return if (callback) AppLink.Callback else null
    }

    /** `https://matrix.to/#/!room:server`, `/#/@user:server`, and their `room/`, `user/`, `space/` forms */
    private fun matrixTo(uri: Uri): AppLink? {
        if (uri.host?.lowercase() != MATRIX_TO || uri.userInfo != null || uri.port != -1) return null
        if (!uri.path.isNullOrEmpty() && uri.path != "/") return null
        val fragment = uri.fragment ?: return null
        if (!fragment.startsWith("/")) return null
        val route = fragment.removePrefix("/").substringBefore('?')
        val parts = route.split('/').filter { it.isNotEmpty() }.map { Uri.decode(it) }
        if (parts.isEmpty()) return null
        val first = parts.first().lowercase()
        return when (first) {
            in ROOM_ROUTES -> {
                val id = parts.getOrNull(1) ?: return null
                // `/#/room/!id:server/event` is still the room; deeper paths are not
                if (parts.size > 3 || !roomId(id)) null else AppLink.Room(id)
            }
            in SPACE_ROUTES -> {
                val id = parts.getOrNull(1) ?: return null
                if (parts.size == 2 && roomId(id)) AppLink.Space(id) else null
            }
            in USER_ROUTES -> {
                val id = parts.getOrNull(1) ?: return null
                if (parts.size == 2 && userId(id)) AppLink.User(id) else null
            }
            else -> {
                if (parts.size > 2) return null
                val id = parts.first()
                when {
                    roomId(id) -> AppLink.Room(id)
                    parts.size == 1 && userId(id) -> AppLink.User(id)
                    else -> null
                }
            }
        }
    }

    /** `chat.mudrix://room/!id:server`, `:/user/@id:server`, and the legacy scheme's same routes */
    private fun appRoute(uri: Uri): AppLink? {
        if (uri.userInfo != null || uri.port != -1) return null
        val host = uri.host?.lowercase()
        val path = uri.pathSegments.orEmpty().map { Uri.decode(it) }
        // `://app/r/...` is the desktop shell's spelling; `://room/...` puts the route in the host
        val parts = when (host) {
            null, "", "app" -> path
            in ROOM_ROUTES, in SPACE_ROUTES, in USER_ROUTES -> listOf(host) + path
            else -> return null
        }
        if (parts.isEmpty() || parts.size > 2) return null
        val route = parts.first().lowercase()
        val id = parts.getOrNull(1) ?: return null
        return when {
            route in ROOM_ROUTES && roomId(id) -> AppLink.Room(id)
            route in SPACE_ROUTES && roomId(id) -> AppLink.Space(id)
            route in USER_ROUTES && userId(id) -> AppLink.User(id)
            else -> null
        }
    }

    private fun roomId(id: String) = (id.startsWith("!") || id.startsWith("#")) && id.length > 1 && ':' in id
    private fun userId(id: String) = id.startsWith("@") && id.length > 1 && ':' in id
}

/** The server's sign-in page in a Custom Tab: `open` returns the redirect, or null if the tab was closed */
object BrowserLogin {
    private var waiting: CompletableDeferred<Uri?>? = null
    private var leftAt = 0L

    suspend fun open(context: android.content.Context, url: String): Uri? {
        waiting?.complete(null)
        val result = CompletableDeferred<Uri?>()
        waiting = result
        leftAt = System.currentTimeMillis()
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(url))
        return result.await()
    }

    fun callback(uri: Uri) {
        waiting?.complete(uri)
        waiting = null
    }

    /** Back in the app without a redirect: the tab was closed */
    fun resumed() {
        val pending = waiting ?: return
        if (System.currentTimeMillis() - leftAt < 1000) return
        kotlinx.coroutines.MainScope().launch {
            // The redirect intent arrives just before or after onResume
            delay(600)
            if (waiting === pending) {
                pending.complete(null)
                waiting = null
            }
        }
    }
}

@Composable
private fun Root() {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    when (val state = session.state) {
        MatrixSession.State.Restoring -> {
            Box(Modifier.fillMaxSize().background(theme.bgPrimary), contentAlignment = Alignment.Center) {
                WizardLogo(WZ.SizeAvatar.xl)
            }
            LaunchedEffect(Unit) { session.restore() }
        }
        MatrixSession.State.LoggedOut -> LoginScreen()
        is MatrixSession.State.RestoreFailed -> {
            Column(
                Modifier.fillMaxSize().background(theme.bgPrimary).padding(WZ.Space.space9),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space6, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                WizardLogo(WZ.SizeAvatar.xl)
                Text(tr("auth.sessionLoadFailed"), style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary)
                Text(state.message, style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
                PrimaryButton(tr("common.retry"), { scope.launch { session.retryRestore() } }, Modifier.widthIn(max = WZ.Size.sidebar))
            }
        }
        MatrixSession.State.LoggedIn -> {
            val roomList = session.roomList
            if (roomList != null) {
                CompositionLocalProvider(LocalMedia provides session.media) {
                    key(session.userId) { MainScreen(roomList) }
                }
            }
            val encryptionSetup = remember(session.userId) { EncryptionSetupState() }
            val prefs = LocalPrefs.current
            val verifyPending = session.needsVerification && prefs.verifySkippedDevice != session.deviceId
            if (session.needsEncryptionSetup || encryptionSetup.recoveryKey != null || verifyPending) {
                EncryptionSetupScreen(encryptionSetup)
            }
            if (session.isAddingAccount) AddAccountScreen()
        }
    }
    val notifier = MessageNotifier.shared
    LaunchedEffect(notifier.accountToOpen, session.state, session.userId) {
        val userId = notifier.accountToOpen ?: return@LaunchedEffect
        if (session.state != MatrixSession.State.LoggedIn || session.userId == null) return@LaunchedEffect
        if (session.userId == userId || session.accounts.none { it.userId == userId }) {
            notifier.accountToOpen = null
        } else {
            scope.launch { session.switchAccount(userId) }
        }
    }
}
