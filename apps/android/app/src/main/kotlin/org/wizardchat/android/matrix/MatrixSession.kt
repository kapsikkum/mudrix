package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.AppInfo
import org.wizardchat.core.EncryptionStatus
import org.wizardchat.core.IdentityProvider
import org.wizardchat.core.Presence
import org.wizardchat.core.PendingLogin
import org.wizardchat.core.ServerInfo
import org.wizardchat.core.SessionEvent
import org.wizardchat.core.StoreConfig
import org.wizardchat.core.Subscription
import org.wizardchat.core.SyncState
import org.wizardchat.core.WizardClient
import org.wizardchat.core.WizardError

/** The signed-in account and its sync */
class MatrixSession(private val scope: CoroutineScope = MainScope()) {
    sealed interface State {
        data object Restoring : State
        data object LoggedOut : State
        data object LoggedIn : State
        data class RestoreFailed(val message: String) : State
    }

    var state by mutableStateOf<State>(State.Restoring)
        private set
    var userId by mutableStateOf<String?>(null)
        private set
    var displayName by mutableStateOf<String?>(null)
    var avatarUrl by mutableStateOf<String?>(null)
    var syncState by mutableStateOf(SyncState.idle)
        private set
    var encryption by mutableStateOf<EncryptionStatus?>(null)
        private set

    var client: WizardClient? = null
        private set
    var roomList by mutableStateOf<RoomListModel?>(null)
        private set
    var media: MediaLoader? = null
        private set

    private var stored: StoredSession? = null
    private var isRestoring = false
    private var subscriptions = listOf<Subscription>()
    private var pendingLogin: Triple<PendingLogin, String, StoreConfig>? = null

    val requireClient: WizardClient
        get() = client ?: throw WizardError("notSignedIn", L10n.format("common.somethingWentWrong"))

    suspend fun restore() {
        // The screen and a background refresh can both ask; only restore once
        if (client != null || isRestoring) {
            while (isRestoring) delay(100)
            return
        }
        isRestoring = true
        try {
            val stored = SessionStore.load()
            if (stored == null) {
                state = State.LoggedOut
                return
            }
            try {
                val client = WizardClient.restore(stored.session, stored.store)
                start(client, stored)
            } catch (error: WizardError) {
                // Only forget the account when the server says it's gone; anything else (offline,
                // a bug) keeps it so the user isn't signed out
                if (error.errcode == "M_UNKNOWN_TOKEN") forget(stored) else state = State.RestoreFailed(error.message)
            }
        } finally {
            isRestoring = false
        }
    }

    suspend fun retryRestore() {
        state = State.Restoring
        restore()
    }

    suspend fun discover(server: String): ServerInfo = WizardClient.discover(server)

    suspend fun login(server: String, username: String, password: String) {
        val (folder, store) = StoredSession.newStore()
        try {
            val client = WizardClient.loginPassword(server, username, password, DEVICE_NAME, store)
            remember(client, folder, store)
        } catch (error: Exception) {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    suspend fun register(server: String, username: String, password: String) {
        val (folder, store) = StoredSession.newStore()
        try {
            val client = WizardClient.register(server, username, password, DEVICE_NAME, null, store)
            remember(client, folder, store)
        } catch (error: Exception) {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    /** The server's sign-in page to open in a browser tab; it redirects back to `REDIRECT_URI` */
    suspend fun startBrowserLogin(server: String, sso: IdentityProvider? = null, createAccount: Boolean = false): String {
        cancelBrowserLogin()
        val (folder, store) = StoredSession.newStore()
        try {
            val login = if (sso != null) {
                WizardClient.startSsoLogin(server, store, REDIRECT_URI, sso.id)
            } else {
                WizardClient.startOAuthLogin(server, store, REDIRECT_URI, APP, createAccount)
            }
            pendingLogin = Triple(login, folder, store)
            return login.url
        } catch (error: Exception) {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    val hasPendingBrowserLogin get() = pendingLogin != null

    suspend fun finishBrowserLogin(callbackUrl: String) {
        val (login, folder, store) = pendingLogin
            ?: throw WizardError("expired", L10n.format("auth.popupClosed"))
        pendingLogin = null
        try {
            val client = login.finish(callbackUrl, DEVICE_NAME)
            remember(client, folder, store)
        } catch (error: Exception) {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    suspend fun cancelBrowserLogin() {
        val (login, folder) = pendingLogin ?: return
        pendingLogin = null
        runCatching { login.abort() }
        SessionStore.removeStore(folder)
    }

    /** Leaving the app: stop syncing so coming back starts a fresh connection. Calls keep syncing. */
    suspend fun pauseSync(keepRunning: Boolean) {
        val client = client ?: return
        if (keepRunning || syncState != SyncState.running) return
        runCatching { client.stopSync() }
    }

    suspend fun resumeSync() {
        val client = client ?: return
        if (syncState == SyncState.running) return
        runCatching { client.startSync() }
    }

    /** Sync stops on network errors; try again after a moment */
    private fun syncStateChanged(state: SyncState) {
        syncState = state
        val client = client ?: return
        if (state != SyncState.error && state != SyncState.offline) return
        if (!ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) return
        scope.launch {
            delay(3000)
            if (syncState == SyncState.error || syncState == SyncState.offline) runCatching { client.startSync() }
        }
    }

    suspend fun logout() {
        runCatching { client?.logout() }
        stored?.let(::forget)
    }

    suspend fun loadSyncedSettings(): Map<String, JsonElement>? =
        runCatching { client?.accountData(AppPreferences.SYNCED_ACCOUNT_DATA_TYPE) as? JsonObject }.getOrNull()

    suspend fun saveSyncedSettings(settings: Map<String, JsonElement>) {
        val client = client ?: return
        val content = (loadSyncedSettings() ?: emptyMap()) + settings
        runCatching { client.setAccountData(AppPreferences.SYNCED_ACCOUNT_DATA_TYPE, JsonObject(content)) }
    }

    suspend fun applyPresence(visible: Boolean) {
        runCatching { client?.setPresence(if (visible) Presence.online else Presence.offline) }
    }

    suspend fun refreshProfile() {
        val profile = runCatching { client?.ownProfile() }.getOrNull() ?: return
        displayName = profile.displayName
        avatarUrl = profile.avatarUrl
    }

    private fun remember(client: WizardClient, folder: String, store: StoreConfig) {
        val stored = StoredSession(client.session, folder, store.passphrase ?: "")
        SessionStore.save(stored)
        start(client, stored)
    }

    private fun start(client: WizardClient, stored: StoredSession) {
        this.client = client
        this.stored = stored
        userId = client.userId
        val roomList = RoomListModel(client, scope)
        this.roomList = roomList
        media = MediaLoader(client)
        subscriptions = listOf(
            client.watchSession { sessionChanged(it) },
            client.watchEncryptionStatus { encryption = it },
        )
        scope.launch {
            // The sync state and room list come from the sync service, so start it first; offline
            // at launch, keep trying until it starts
            while (runCatching { client.startSync() }.isFailure) {
                if (this@MatrixSession.client !== client) return@launch
                syncState = SyncState.offline
                delay(3000)
            }
            if (this@MatrixSession.client !== client) return@launch
            subscriptions = subscriptions + client.watchSyncState { syncStateChanged(it) }
            roomList.start()
            encryption = runCatching { client.encryptionStatus() }.getOrNull()
            refreshProfile()
        }
        state = State.LoggedIn
    }

    private fun sessionChanged(event: SessionEvent) {
        when (event) {
            is SessionEvent.Refreshed -> {
                val updated = stored?.copy(session = event.session) ?: return
                stored = updated
                scope.launch(Dispatchers.IO) { SessionStore.save(updated) }
            }
            is SessionEvent.Invalid -> stored?.let(::forget)
        }
    }

    private fun forget(stored: StoredSession) {
        subscriptions.forEach { it.cancel() }
        subscriptions = emptyList()
        roomList?.stop()
        roomList = null
        media = null
        client = null
        this.stored = null
        SessionStore.removeStore(stored.storeFolder)
        SessionStore.clear()
        userId = null
        displayName = null
        avatarUrl = null
        state = State.LoggedOut
    }

    companion object {
        const val DEVICE_NAME = "WizardChat Android"
        const val CALLBACK_SCHEME = "org.wizardchat"
        const val REDIRECT_URI = "$CALLBACK_SCHEME:/callback"
        val APP = AppInfo(name = "WizardChat", clientUri = "https://wizardchat.org")
    }
}
