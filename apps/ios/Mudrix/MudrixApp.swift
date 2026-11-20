import SwiftUI
import UIKit

@main
struct MudrixApp: App {
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
    @StateObject private var session = MatrixSession()
    @StateObject private var prefs = AppPreferences()
    @StateObject private var notifier = MessageNotifier()
    @StateObject private var calls = CallManager()
    @StateObject private var recentEmoji = RecentEmoji()
    @StateObject private var verificationRequests = VerificationRequests()
    @State private var syncer: SettingsSyncer?
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.scenePhase) private var scenePhase


    init() {
        // Before any client is restored: the store the notification extension needs is in the app group
        SessionStore.prepare()
        FontRegistry.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            ThemedRoot(prefs: prefs) { theme in
            Group {
                switch session.state {
                case .restoring:
                    ZStack {
                        theme.bgPrimary.ignoresSafeArea()
                        WizardLogo(size: WZ.SizeAvatar.xl)
                    }
                    .task { await session.restore() }
                case .loggedOut:
                    LoginView()
                case .restoreFailed(let message):
                    VStack(spacing: WZ.Space.space6) {
                        WizardLogo(size: WZ.SizeAvatar.xl)
                        Text("auth.sessionLoadFailed")
                            .font(.wizard(WZ.FontSize.xxl, .bold))
                            .foregroundStyle(theme.textPrimary)
                        Text(message)
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                            .multilineTextAlignment(.center)
                        Button("common.retry") { Task { await session.retryRestore() } }
                            .buttonStyle(PrimaryButtonStyle())
                            .frame(maxWidth: WZ.Size.sidebar)
                    }
                    .padding(WZ.Space.space9)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(theme.bgPrimary.ignoresSafeArea())
                case .loggedIn:
                    if let roomList = session.roomList {
                        MainTabView(roomList: roomList)
                            .id(session.userId)
                            .sheet(item: $verificationRequests.presented) { VerificationSheet(model: $0) }
                            .sheet(isPresented: $session.isAddingAccount, onDismiss: {
                                Task { await session.cancelBrowserLogin() }
                            }) { AddAccountSheet() }
                    }
                }
            }
            .font(.wizard(WZ.FontSize.lg))
            .id(dynamicTypeSize)
            .environmentObject(session)
            .environmentObject(prefs)
            .environmentObject(notifier)
            .environmentObject(calls)
            .environmentObject(recentEmoji)
            .environment(\.mediaLoader, session.media)
            }
            .transaction { transaction in
                if prefs.reducesMotion(systemSetting: systemReduceMotion) {
                    transaction.animation = nil
                    transaction.disablesAnimations = true
                }
            }
            .task(id: session.state == .loggedIn ? session.userId : nil) { await onLoginChanged() }
            // A sign-in finished in the browser comes back on the scheme ASWebAuthenticationSession
            // watches; the core checks the nonce in the query, so the URL is passed on whole
            .onOpenURL { url in
                guard url.scheme == MatrixSession.callbackScheme else { return }
                Task { try? await session.finishBrowserLogin(callbackUrl: url) }
            }
            .onChange(of: notifier.accountToOpen) { _, _ in openNotificationAccount() }
            .onChange(of: prefs.theme, initial: true) { _, _ in applyAppIcon() }
            .onChange(of: prefs.followSystemTheme) { _, _ in applyAppIcon() }
            .onChange(of: prefs.themedAppIcon) { _, _ in applyAppIcon() }
            // Streamer mode: integrations and link cards ask nothing on their own (IntegrationNetwork),
            // and the notification service extension shows no text when it is on
            // "Auto" also follows this device sharing its own screen in a call, like the web
            .onChange(of: calls.screenSharing, initial: true) { _, sharing in
                prefs.setOwnScreenSharing(sharing)
            }
            .onChange(of: prefs.streamerModeActive, initial: true) { _, active in
                IntegrationNetwork.setPassiveBlocked(active)
                ShareInbox.saveHideContent(active)
            }
            .onChange(of: prefs.showPresence) { _, visible in
                Task { await session.applyPresence(visible, choice: prefs.presenceChoice) }
            }
            .onChange(of: prefs.presenceChoice) { _, choice in
                Task { await session.applyPresence(prefs.showPresence, choice: choice) }
            }
            // The notification service extension can't read these, and the gateway's alerts would
            // otherwise always play the system sound
            .onChange(of: prefs.notificationSounds, initial: true) { _, on in
                ShareInbox.saveNotificationSounds(on)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                UIApplication.shared.ignoreSnapshotOnNextApplicationLaunch()
                Task { await session.pauseSync(keepRunning: calls.isInCall) }
            case .active:
                Task { await session.resumeSync() }
            default:
                break
            }
        }
    }

    private func onLoginChanged() async {
        notifier.stop()
        SavedMessages.shared.stop()
        Reminders.shared.stop()
        calls.stopWatchingIncoming()
        calls.leave()
        recentEmoji.stop()
        MudrixRoomStates.shared.stop()
        GifFavourites.shared.stop()
        VoiceMoves.stop()
        verificationRequests.stop()
        MemberDirectory.shared.reset()
        PresenceCache.shared.reset()
        syncer?.stop()
        syncer = nil
        guard session.state == .loggedIn, session.client != nil else { return }
        if openNotificationAccount() { return }
        if let client = session.client {
            let next = SettingsSyncer(client: client, prefs: prefs)
            syncer = next
            next.start()
        }
        await session.applyPresence(prefs.showPresence, choice: prefs.presenceChoice)
        await session.ensureMudrixUserFlag()
        if let roomList = session.roomList {
            roomList.prefs = prefs
            notifier.start(roomList: roomList, prefs: prefs)
        }
        Push.client = { [weak session] in session?.client }
        Push.resume = { [weak session] in await session?.resumeSync() }
        Push.pause = { [weak session] in await session?.pauseSync(keepRunning: false) }
        Push.requestToken()
        Push.scheduleRefresh()
        if let client = session.client {
            let notifier = notifier
            calls.watchIncoming(client, session: session) { [weak notifier] call in notifier?.notifyMissedCall(call) }
            SavedMessages.shared.start(client: client)
            GifFavourites.shared.start(client: client)
            Task { await GifFavourites.shared.migrateLegacy() }
            Reminders.shared.start(client: client) { session.roomList?.room(id: $0)?.displayName }
            recentEmoji.start(client: client)
            MudrixRoomStates.shared.start(client: client)
            if let roomList = session.roomList {
                VoiceMoves.start(client: client, calls: calls, session: session, roomList: roomList, prefs: prefs)
            }
            verificationRequests.start(client: client)
        }
    }

    @discardableResult
    private func openNotificationAccount() -> Bool {
        guard let userId = notifier.accountToOpen else { return false }
        guard session.state == .loggedIn, session.userId != userId else {
            if session.userId == userId { notifier.accountToOpen = nil }
            return false
        }
        guard session.accounts.contains(where: { $0.userId == userId }) else {
            notifier.accountToOpen = nil
            return false
        }
        Task { await session.switchAccount(to: userId) }
        return true
    }

    private func applyAppIcon() {
        var name: String?
        if prefs.themedAppIcon && !prefs.followSystemTheme {
            if prefs.theme == WZ.Theme.parrot.name { name = "AppIcon-Parrot" }
            if prefs.theme == WZ.Theme.hallow.name { name = "AppIcon-Hallow" }
        }
        guard UIApplication.shared.supportsAlternateIcons,
              UIApplication.shared.alternateIconName != name else { return }
        UIApplication.shared.setAlternateIconName(name)
    }
}

private struct ThemedRoot<Content: View>: View {
    @ObservedObject var prefs: AppPreferences
    @ViewBuilder let content: (MudrixTheme) -> Content
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let name = prefs.effectiveThemeName(systemDark: systemScheme == .dark)
        let theme = Themes.resolve(name, customs: prefs.customThemes)
        content(theme)
            .environment(\.theme, theme)
            .tint(theme.control)
            .toggleStyle(SwitchToggleStyle(tint: theme.accent))
            .preferredColorScheme(prefs.followSystemTheme ? nil : theme.colorScheme)
            .background(theme.bgPrimary.ignoresSafeArea())
            // The switcher thumbnail is taken while the app is inactive: cover everything before that
            .overlay {
                if scenePhase != .active {
                    PrivacyCover(theme: theme)
                }
            }
            .onChange(of: theme.id, initial: true) { _, id in ShareInbox.saveTheme(id.rawValue) }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    PrivacyCoverWindow.hide()
                } else {
                    PrivacyCoverWindow.show(theme: theme)
                }
            }
    }
}

/// An opaque cover over the app while it is not active, so the app switcher thumbnail never shows a chat
private struct PrivacyCover: View {
    let theme: MudrixTheme

    var body: some View {
        ZStack {
            theme.bgPrimary
            WizardLogoShape()
                .frame(width: WZ.SizeAvatar.xl, height: WZ.SizeAvatar.xl)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// The cover in a window above every screen, sheets included, which the root view's overlay cannot cover
@MainActor
private enum PrivacyCoverWindow {
    private static var window: UIWindow?

    static func show(theme: MudrixTheme) {
        guard window == nil else { return }
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState != .background }) else { return }
        let background = UIColor(theme.bgPrimary)
        let host = UIHostingController(rootView: PrivacyCover(theme: theme))
        host.view.backgroundColor = background
        let window = CoverWindow(windowScene: scene)
        window.rootViewController = host
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
        window.backgroundColor = background
        window.isUserInteractionEnabled = false
        window.isHidden = false
        self.window = window
    }

    static func hide() {
        window?.isHidden = true
        window = nil
    }
}

/// A cover window is only there to be seen: it must not take key status or focus from the app
private final class CoverWindow: UIWindow {
    override var canBecomeKey: Bool { false }
}
