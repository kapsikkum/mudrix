import Foundation
import UIKit
import WizardChatCore

@MainActor
final class MatrixSession: ObservableObject {
    enum State: Equatable {
        case restoring
        case loggedOut
        case loggedIn
        case restoreFailed(String)
    }

    @Published private(set) var state: State = .restoring
    @Published private(set) var userId: String?
    @Published var displayName: String?
    @Published var avatarUrl: String?
    @Published private(set) var syncState: SyncState = .idle
    @Published private(set) var encryption: EncryptionStatus?

    private(set) var client: WizardClient?
    private(set) var roomList: RoomListModel?
    private(set) var media: MediaLoader?
    private var stored: StoredSession?
    private var isRestoring = false
    private var subscriptions: [Subscription] = []
    private var pendingLogin: (login: PendingLogin, folder: String, store: StoreConfig)?

    static let deviceName = "WizardChat iOS"
    static let callbackScheme = "org.wizardchat"
    static let app = AppInfo(name: "WizardChat", clientUri: "https://wizardchat.org")

    var requireClient: WizardClient {
        get throws {
            guard let client else { throw WizardError.notSignedIn }
            return client
        }
    }

    func restore() async {
        // The screen and a background refresh can both ask; only restore once
        guard client == nil, !isRestoring else {
            while isRestoring { try? await Task.sleep(for: .milliseconds(100)) }
            return
        }
        isRestoring = true
        defer { isRestoring = false }
        guard let stored = SessionStore.load() else {
            state = .loggedOut
            return
        }
        do {
            let client = try await WizardClient.restore(session: stored.session, store: stored.store)
            start(client, stored: stored)
        } catch let error as WizardError where error.errcode == "M_UNKNOWN_TOKEN" {
            // Only forget the account when the server says it's gone; anything else (offline,
            // a bug) keeps it so the user isn't signed out
            forget(stored)
        } catch {
            state = .restoreFailed(error.localizedDescription)
        }
    }

    func retryRestore() async {
        state = .restoring
        await restore()
    }

    func discover(_ server: String) async throws -> ServerInfo {
        try await WizardClient.discover(server: server)
    }

    func login(server: String, username: String, password: String) async throws {
        let (folder, store) = StoredSession.newStore()
        do {
            let client = try await WizardClient.loginPassword(
                server: server, username: username, password: password,
                deviceName: Self.deviceName, store: store
            )
            remember(client, folder: folder, store: store)
        } catch {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    func register(server: String, username: String, password: String) async throws {
        let (folder, store) = StoredSession.newStore()
        do {
            let client = try await WizardClient.register(
                server: server, username: username, password: password,
                deviceName: Self.deviceName, token: nil, store: store
            )
            remember(client, folder: folder, store: store)
        } catch {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    func startBrowserLogin(server: String, sso: IdentityProvider? = nil, createAccount: Bool = false) async throws -> URL {
        await cancelBrowserLogin()
        let (folder, store) = StoredSession.newStore()
        let redirect = "\(Self.callbackScheme):/callback"
        do {
            let login: PendingLogin
            if let sso {
                login = try await WizardClient.startSsoLogin(server: server, store: store, redirectUri: redirect, idpId: sso.id)
            } else {
                login = try await WizardClient.startOAuthLogin(
                    server: server, store: store, redirectUri: redirect, app: Self.app, createAccount: createAccount
                )
            }
            guard let url = URL(string: login.url) else { throw WizardError.invalidLoginUrl }
            pendingLogin = (login, folder, store)
            return url
        } catch {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    func finishBrowserLogin(callbackUrl: URL) async throws {
        guard let pending = pendingLogin else { throw WizardError.noPendingLogin }
        pendingLogin = nil
        do {
            let client = try await pending.login.finish(callbackUrl: callbackUrl.absoluteString, deviceName: Self.deviceName)
            remember(client, folder: pending.folder, store: pending.store)
        } catch {
            SessionStore.removeStore(pending.folder)
            throw error
        }
    }

    func cancelBrowserLogin() async {
        guard let pending = pendingLogin else { return }
        pendingLogin = nil
        try? await pending.login.abort()
        SessionStore.removeStore(pending.folder)
    }

    /// Leaving the app: stop syncing so coming back starts a fresh connection (iOS freezes the
    /// app and its open connection goes stale). Calls keep syncing, they need room events.
    func pauseSync(keepRunning: Bool) async {
        guard !keepRunning, let client, syncState == .running else { return }
        try? await client.stopSync()
    }

    func resumeSync() async {
        guard let client, syncState != .running else { return }
        try? await client.startSync()
    }

    /// Sync stops on network errors; try again after a moment
    private func syncStateChanged(_ state: SyncState) {
        syncState = state
        guard state == .error || state == .offline, let client else { return }
        guard UIApplication.shared.applicationState != .background else { return }
        Task {
            try? await Task.sleep(for: .seconds(3))
            if self.syncState == .error || self.syncState == .offline { try? await client.startSync() }
        }
    }

    func logout() async {
        try? await client?.logout()
        if let stored { forget(stored) }
    }

    func loadSyncedSettings() async -> [String: JSONValue]? {
        guard case .object(let content) = try? await client?.accountData(eventType: AppPreferences.syncedAccountDataType)
        else { return nil }
        return content
    }

    func saveSyncedSettings(_ settings: [String: JSONValue]) async {
        guard let client else { return }
        var content = await loadSyncedSettings() ?? [:]
        content.merge(settings) { _, new in new }
        try? await client.setAccountData(eventType: AppPreferences.syncedAccountDataType, content: .object(content))
    }

    func applyPresence(_ visible: Bool) async {
        try? await client?.setPresence(presence: visible ? .online : .offline)
    }

    func refreshProfile() async {
        guard let profile = try? await client?.ownProfile() else { return }
        displayName = profile.displayName
        avatarUrl = profile.avatarUrl
    }

    private func remember(_ client: WizardClient, folder: String, store: StoreConfig) {
        let stored = StoredSession(session: client.session, storeFolder: folder, passphrase: store.passphrase ?? "")
        SessionStore.save(stored)
        start(client, stored: stored)
    }

    private func start(_ client: WizardClient, stored: StoredSession) {
        self.client = client
        self.stored = stored
        userId = client.userId
        roomList = RoomListModel(client: client)
        media = MediaLoader(client: client)
        subscriptions = [
            client.watchSession { [weak self] event in
                MainActor.assumeIsolated { self?.sessionChanged(event) }
            },
            client.watchEncryptionStatus { [weak self] status in
                MainActor.assumeIsolated { self?.encryption = status }
            },
        ]
        Task { [weak self] in
            guard let self else { return }
            // The sync state and room list come from the sync service, so start it first;
            // offline at launch, keep trying until it starts
            while (try? await client.startSync()) == nil {
                guard self.client === client else { return }
                syncState = .offline
                try? await Task.sleep(for: .seconds(3))
            }
            guard self.client === client else { return }
            subscriptions.append(client.watchSyncState { [weak self] state in
                MainActor.assumeIsolated { self?.syncStateChanged(state) }
            })
            roomList?.start()
            encryption = try? await client.encryptionStatus()
            await refreshProfile()
        }
        state = .loggedIn
    }

    private func sessionChanged(_ event: SessionEvent) {
        switch event {
        case .refreshed(let refreshed):
            guard var stored else { return }
            stored.session = refreshed.session
            self.stored = stored
            SessionStore.save(stored)
        case .invalid:
            if let stored { forget(stored) }
        }
    }

    private func forget(_ stored: StoredSession) {
        subscriptions.forEach { $0.cancel() }
        subscriptions = []
        roomList?.stop()
        roomList = nil
        media = nil
        client = nil
        self.stored = nil
        SessionStore.removeStore(stored.storeFolder)
        SessionStore.clear()
        userId = nil
        displayName = nil
        avatarUrl = nil
        state = .loggedOut
    }
}

extension WizardError {
    static let notSignedIn = WizardError(code: "notSignedIn", message: String(localized: "common.somethingWentWrong"))
    static let invalidLoginUrl = WizardError(code: "homeserver", message: String(localized: "welcome.oidcLoginFailed"))
    static let noPendingLogin = WizardError(code: "expired", message: String(localized: "auth.popupClosed"))
}
