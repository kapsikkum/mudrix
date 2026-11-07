import BackgroundTasks
import SwiftUI
import UIKit

@main
struct WizardChatApp: App {
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

    static let refreshTask = "org.wizardchat.ios.refresh"

    init() {
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
            .onChange(of: notifier.accountToOpen) { _, _ in openNotificationAccount() }
            .onChange(of: prefs.theme, initial: true) { _, _ in applyAppIcon() }
            .onChange(of: prefs.followSystemTheme) { _, _ in applyAppIcon() }
            .onChange(of: prefs.themedAppIcon) { _, _ in applyAppIcon() }
            .onChange(of: prefs.showPresence) { _, visible in
                Task { await session.applyPresence(visible) }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                UIApplication.shared.ignoreSnapshotOnNextApplicationLaunch()
                Self.scheduleRefresh()
                Task { await session.pauseSync(keepRunning: calls.isInCall) }
            case .active:
                Task { await session.resumeSync() }
            default:
                break
            }
        }
        .backgroundTask(.appRefresh(Self.refreshTask)) {
            await backgroundRefresh()
        }
    }

    private static func scheduleRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTask)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    @MainActor
    private func backgroundRefresh() async {
        Self.scheduleRefresh()
        if session.state == .restoring { await session.restore() }
        guard session.state == .loggedIn, let roomList = session.roomList else { return }
        notifier.start(roomList: roomList, prefs: prefs)
        try? await session.client?.startSync()
        try? await Task.sleep(for: .seconds(20))
    }

    private func onLoginChanged() async {
        notifier.stop()
        SavedMessages.shared.stop()
        Reminders.shared.stop()
        calls.stopWatchingIncoming()
        calls.leave()
        recentEmoji.stop()
        verificationRequests.stop()
        MemberDirectory.shared.reset()
        syncer?.stop()
        syncer = nil
        guard session.state == .loggedIn, session.client != nil else { return }
        if openNotificationAccount() { return }
        if let client = session.client {
            let next = SettingsSyncer(client: client, prefs: prefs)
            syncer = next
            next.start()
        }
        await session.applyPresence(prefs.showPresence)
        await session.ensureMudrixUserFlag()
        if let roomList = session.roomList {
            notifier.start(roomList: roomList, prefs: prefs)
        }
        if let client = session.client {
            calls.watchIncoming(client)
            SavedMessages.shared.start(client: client)
            Reminders.shared.start(client: client) { session.roomList?.room(id: $0)?.displayName }
            recentEmoji.start(client: client)
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
    @ViewBuilder let content: (WizardTheme) -> Content
    @Environment(\.colorScheme) private var systemScheme

    var body: some View {
        let name = prefs.effectiveThemeName(systemDark: systemScheme == .dark)
        let theme = Themes.resolve(name, customs: prefs.customThemes)
        content(theme)
            .environment(\.theme, theme)
            .tint(theme.control)
            .toggleStyle(SwitchToggleStyle(tint: theme.accent))
            .preferredColorScheme(prefs.followSystemTheme ? nil : theme.colorScheme)
            .background(theme.bgPrimary.ignoresSafeArea())
            .onChange(of: theme.id, initial: true) { _, id in ShareInbox.saveTheme(id.rawValue) }
    }
}
