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
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.scenePhase) private var scenePhase

    static let refreshTask = "org.wizardchat.ios.refresh"

    init() {
        FontRegistry.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            ThemedRoot(setting: prefs.theme) { theme in
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
            .onChange(of: prefs.themedAppIcon) { _, _ in applyAppIcon() }
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
        calls.stopWatchingIncoming()
        calls.leave()
        recentEmoji.stop()
        verificationRequests.stop()
        MemberDirectory.shared.reset()
        prefs.onSyncedSettingsChange = nil
        guard session.state == .loggedIn, session.client != nil else { return }
        if openNotificationAccount() { return }
        if let synced = await session.loadSyncedSettings() {
            prefs.applySynced(synced)
        }
        prefs.onSyncedSettingsChange = { [weak session] settings in
            Task { await session?.saveSyncedSettings(settings) }
        }
        await session.applyPresence(prefs.showPresence)
        if let roomList = session.roomList {
            notifier.start(roomList: roomList, prefs: prefs)
        }
        if let client = session.client {
            let notifier = notifier
            calls.watchIncoming(client) { [weak notifier] call in notifier?.notifyMissedCall(call) }
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
        let name: String?
        switch (prefs.themedAppIcon, prefs.theme) {
        case (true, .fixed(.parrot)): name = "AppIcon-Parrot"
        case (true, .fixed(.hallow)): name = "AppIcon-Hallow"
        default: name = nil
        }
        guard UIApplication.shared.supportsAlternateIcons,
              UIApplication.shared.alternateIconName != name else { return }
        UIApplication.shared.setAlternateIconName(name)
    }
}

private struct ThemedRoot<Content: View>: View {
    let setting: ThemeSetting
    @ViewBuilder let content: (WizardTheme) -> Content
    @Environment(\.colorScheme) private var systemScheme

    var body: some View {
        let theme = WizardTheme(setting.resolved(systemScheme))
        content(theme)
            .environment(\.theme, theme)
            .tint(theme.control)
            .toggleStyle(SwitchToggleStyle(tint: theme.accent))
            .preferredColorScheme(setting == .system ? nil : theme.colorScheme)
            .background(theme.bgPrimary.ignoresSafeArea())
            .onChange(of: theme.id, initial: true) { _, id in ShareInbox.saveTheme(id.rawValue) }
    }
}
