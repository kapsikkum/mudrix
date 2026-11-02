import WizardChatCore
import SwiftUI

extension DeviceInfo: @retroactive Identifiable {
    public var id: String { deviceId }
    var name: String? { displayName }
    var lastSeen: Date? { lastSeenTs.map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) } }
}

struct SessionsSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    @State private var devices: [DeviceInfo] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showRecoveryKeyEntry = false
    @State private var showVerification = false
    @State private var newRecoveryKey: String?
    @State private var removing: DeviceInfo?
    private var isVerified: Bool { session.encryption?.deviceVerified == true }
    private var recoveryDisabled: Bool { session.encryption?.recovery == "disabled" }

    var body: some View {
        SettingsPage(title: "settings.sessions.title") {
            Text(String(localized: "settings.sessions.devicesDescription"))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)

            encryptionBox

            if loading {
                ProgressView().tint(theme.accent).frame(maxWidth: .infinity)
            }
            if let current = devices.first(where: { $0.id == session.deviceId }) {
                SettingsSection(title: "settings.sessions.currentDevice") {
                    DeviceRow(device: current, isCurrent: true, verified: isVerified,
                              onRename: rename, onRemove: nil)
                }
            }
            let others = devices.filter { $0.id != session.deviceId }
            if !others.isEmpty {
                SettingsSection(title: "settings.sessions.yourDevices") {
                    ForEach(Array(others.enumerated()), id: \.element.id) { index, device in
                        if index > 0 { SettingsDivider() }
                        DeviceRow(device: device, isCurrent: false, verified: nil,
                                  onRename: rename, onRemove: { removing = $0 })
                    }
                }
            } else if !loading && devices.isEmpty {
                Text(String(localized: "settings.sessions.noSessionsFound")).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
            if let error { StatusText(text: error) }
        }
        .task { await reload() }
        .sheet(isPresented: $showRecoveryKeyEntry, onDismiss: refreshState) { RecoveryKeyEntrySheet() }
        .sheet(isPresented: $showVerification, onDismiss: refreshState) { VerificationSheet() }
        .sheet(item: $removing) { device in
            RemoveDeviceSheet(device: device) { await reload() }
        }
        .alert(String(localized: "settings.setUpRecoveryKey"), isPresented: Binding(get: { newRecoveryKey != nil },
                                                          set: { if !$0 { newRecoveryKey = nil } })) {
            Button(String(localized: "common.copy")) { UIPasteboard.general.string = newRecoveryKey }
            Button(String(localized: "common.done"), role: .cancel) {}
        } message: {
            Text(L10n.format("settings.recoveryKeySaveHint", newRecoveryKey ?? ""))
        }
    }

    @ViewBuilder
    private var encryptionBox: some View {
        SettingsSection(title: "settings.encryption.title") {
            HStack(spacing: WZ.Space.space4) {
                Image(isVerified ? "ph-shield-check-regular" : "ph-shield-warning-regular")
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(isVerified ? theme.success : theme.warningColor)
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(isVerified ? String(localized: "settings.sessions.verified") : String(localized: "settings.sessions.unverified"))
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                    if !isVerified {
                        Text(String(localized: "settings.enterYourRecoveryKey"))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            SettingsDivider()
            VStack(spacing: WZ.Space.space4) {
                if !isVerified {
                    Button {
                        showVerification = true
                    } label: {
                        Label(String(localized: "settings.verifyWithAnotherDevice"), image: "ph-devices-regular")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
                if recoveryDisabled {
                    Button {
                        Task { await setUpRecovery(reset: false) }
                    } label: {
                        Label(String(localized: "settings.setUpRecoveryKey"), image: "ph-key-regular")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                } else {
                    Button {
                        showRecoveryKeyEntry = true
                    } label: {
                        Label(String(localized: "settings.keyBackup.enterRecoveryKeyTitle"), image: "ph-lock-open-regular")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    if isVerified {
                        Button {
                            Task { await setUpRecovery(reset: true) }
                        } label: {
                            Label(String(localized: "settings.resetEncryptionKeys"), image: "ph-arrow-counter-clockwise-regular")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                }
            }
        }
    }

    private func refreshState() {}

    private func reload() async {
        refreshState()
        loading = true
        defer { loading = false }
        do {
            devices = try await session.requireClient.devices()
                .sorted { ($0.lastSeen ?? .distantPast) > ($1.lastSeen ?? .distantPast) }
            error = nil
        } catch {
            self.error = L10n.format("settings.couldNotLoadSessions", "\(error.localizedDescription)")
        }
    }

    private func rename(_ device: DeviceInfo, _ name: String) async {
        do {
            try await session.requireClient.renameDevice(deviceId: device.id, name: name)
            await reload()
        } catch {
            self.error = L10n.format("settings.failedToRenameSession", "\(error.localizedDescription)")
        }
    }

    private func setUpRecovery(reset: Bool) async {
        do {
            newRecoveryKey = reset ? try await session.resetRecoveryKey() : try await session.enableRecovery()
            refreshState()
        } catch {
            self.error = L10n.format("settings.setupFailed", "\(error.localizedDescription)")
        }
    }
}

private struct DeviceRow: View {
    let device: DeviceInfo
    let isCurrent: Bool
    let verified: Bool?
    let onRename: (DeviceInfo, String) async -> Void
    let onRemove: ((DeviceInfo) -> Void)?

    @Environment(\.theme) private var theme
    @State private var showDetails = false
    @State private var renaming = false
    @State private var newName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space4) {
            HStack(spacing: WZ.Space.space4) {
                Image(icon)
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textMuted)
                    .frame(width: WZ.Space.space8)
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    HStack(spacing: WZ.Space.space3) {
                        Text(device.name ?? device.id)
                            .font(.wizard(WZ.FontSize.md, .semibold))
                            .foregroundStyle(theme.textPrimary)
                            .lineLimit(1)
                        if let verified {
                            Circle()
                                .fill(verified ? theme.success : theme.warningColor)
                                .frame(width: WZ.Space.space4, height: WZ.Space.space4)
                                .accessibilityLabel(verified ? String(localized: "settings.sessions.verified") : String(localized: "settings.sessions.unverified"))
                        }
                    }
                    if let lastSeen = device.lastSeen {
                        Text(String(localized: "settings.sessions.lastActivity") + " " + lastSeen.formatted(.relative(presentation: .named)))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                Spacer()
                Menu {
                    Button { newName = device.name ?? ""; renaming = true } label: {
                        Label(String(localized: "settings.sessions.renameSession"), image: "ph-pencil-simple-regular")
                    }
                    if let onRemove {
                        Button(role: .destructive) { onRemove(device) } label: {
                            Label(String(localized: "common.remove"), image: "ph-trash-regular")
                        }
                    }
                } label: {
                    Image("ph-dots-three-bold")
                        .foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                }
                .accessibilityLabel(String(localized: "common.menu"))
            }
            if renaming {
                VStack(alignment: .leading, spacing: WZ.Space.space3) {
                    HStack(spacing: WZ.Space.space4) {
                        TextField("", text: $newName).wizardField()
                        Button(String(localized: "common.save")) {
                            Task { await onRename(device, newName); renaming = false }
                        }
                        .buttonStyle(PrimaryButtonStyle()).frame(width: WZ.SizeAvatar.xl)
                        Button(String(localized: "common.cancel")) { renaming = false }
                            .buttonStyle(SecondaryButtonStyle()).frame(width: WZ.SizeAvatar.xl)
                    }
                    Text(String(localized: "settings.sessions.renameSessionHint"))
                        .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                }
            }
            Button(showDetails ? String(localized: "settings.sessions.hideDetails") : String(localized: "settings.sessions.showDetails")) {
                withAnimation { showDetails.toggle() }
            }
            .font(.wizard(WZ.FontSize.sm, .semibold))
            .foregroundStyle(theme.accent)
            if showDetails {
                VStack(alignment: .leading, spacing: WZ.Space.space2) {
                    detail("settings.sessions.deviceId", device.id)
                    if let ip = device.lastSeenIp { detail("settings.sessions.ipAddress", ip) }
                }
            }
        }
    }

    private var icon: String {
        let name = (device.name ?? "").lowercased()
        if name.contains("ios") || name.contains("iphone") || name.contains("android") { return "ph-device-mobile-regular" }
        if name.contains("web") || name.contains("browser") { return "ph-globe-simple-regular" }
        return "ph-desktop-regular"
    }

    private func detail(_ label: LocalizedStringKey, _ value: String) -> some View {
        HStack(spacing: WZ.Space.space3) {
            Text(label).foregroundStyle(theme.textMuted)
            Text(value).foregroundStyle(theme.textPrimary).textSelection(.enabled)
        }
        .font(.wizard(WZ.FontSize.sm))
    }
}

private struct RemoveDeviceSheet: View {
    let device: DeviceInfo
    let onRemoved: () async -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: WZ.Space.space5) {
                Text(L10n.format("settings.removeSessionThatDevice", "\(device.name ?? device.id)"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textPrimary)
                if session.isOAuthAccount {
                    Text(String(localized: "settings.sessions.sessionNotSupported"))
                        .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                    Button(String(localized: "settings.account.manageAccount")) {
                        Task {
                            if let url = await session.accountManagementUrl() {
                                openURL(url)
                            }
                            dismiss()
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                } else {
                    SecureField("", text: $password, prompt: Text(String(localized: "settings.sessions.passwordPlaceholder")).foregroundColor(theme.textMuted))
                        .wizardField()
                    Button(String(localized: "settings.sessions.confirmRemove")) { Task { await remove() } }
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textOnAccent)
                        .frame(maxWidth: .infinity, minHeight: WZ.Space.space10)
                        .background(theme.danger, in: RoundedRectangle(cornerRadius: WizardTheme.radiusMd))
                        .disabled(busy || password.isEmpty)
                }
                if let error { StatusText(text: error) }
                Spacer()
            }
            .padding(WZ.Space.space6)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "settings.sessions.removeSession"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } } }
        }
        .presentationDetents([.medium])
    }

    private func remove() async {
        busy = true; defer { busy = false }
        do {
            try await session.deleteDevices([device.id], password: password)
            await onRemoved()
            dismiss()
        } catch {
            self.error = String(localized: "settings.sessions.incorrectPassword")
        }
    }
}

private struct RecoveryKeyEntrySheet: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: WZ.Space.space5) {
                Text(String(localized: "settings.enterYourRecoveryKey"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                TextField("", text: $key, prompt: Text("EsTc ...").foregroundColor(theme.textMuted), axis: .vertical)
                    .font(.system(size: WZ.SizeIcon.sm, design: .monospaced))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .lineLimit(2...4)
                    .wizardField()
                Button(busy ? "..." : String(localized: "settings.keyBackup.restoreBtn")) {
                    Task {
                        busy = true; defer { busy = false }
                        do {
                            try await session.recover(with: key)
                            dismiss()
                        } catch {
                            self.error = String(localized: "settings.wrongDecryptionKeyPlease")
                        }
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(busy || key.trimmingCharacters(in: .whitespaces).isEmpty)
                if let error { StatusText(text: error) }
                Spacer()
            }
            .padding(WZ.Space.space6)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "settings.keyBackup.enterRecoveryKeyTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}

@MainActor
private final class SelfVerification: ObservableObject {
    enum Step {
        case starting, waitingForOtherDevice, waitingForEmojis
        case compare([VerificationEmoji])
        case done, failed(String), cancelled
    }

    @Published var step = Step.starting
    private var flow: VerificationFlow?
    private var subscription: Subscription?
    private var requested = false
    private var sasStarted = false
    private var sasAccepted = false

    func start(session: MatrixSession) async {
        guard !requested else { return }
        requested = true
        do {
            let flow = try await session.requireClient.requestSelfVerification()
            self.flow = flow
            step = .waitingForOtherDevice
            subscription = flow.watch { [weak self] status in
                MainActor.assumeIsolated { self?.update(status) }
            }
        } catch {
            step = .failed(error.localizedDescription)
        }
    }

    private func update(_ status: VerificationStatus) {
        switch status {
        case .requested, .incoming: step = .waitingForOtherDevice
        case .ready:
            step = .waitingForEmojis
            guard !sasStarted else { return }
            sasStarted = true
            run { try await $0.startSas() }
        case .sasIncoming:
            step = .waitingForEmojis
            guard !sasAccepted else { return }
            sasAccepted = true
            run { try await $0.acceptSas() }
        case .sasStarted, .confirmed: step = .waitingForEmojis
        case .emojis(let sas): step = .compare(sas.emojis)
        case .done: step = .done
        case .cancelled(let cancelled):
            if case .done = step { return }
            step = cancelled.reason.isEmpty ? .cancelled : .failed(cancelled.reason)
        }
    }

    private func run(_ action: @escaping (VerificationFlow) async throws -> Void) {
        guard let flow else { return }
        Task {
            do { try await action(flow) } catch {
                step = .failed(error.localizedDescription)
            }
        }
    }

    func confirm(_ matches: Bool) async {
        do {
            if matches { try await flow?.confirm() } else { try await flow?.mismatch() }
        } catch {
            step = .failed(error.localizedDescription)
        }
    }

    func cancel() async {
        try? await flow?.cancel()
        subscription?.cancel()
    }
}

private struct VerificationSheet: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var flow = SelfVerification()

    var body: some View {
        NavigationStack {
            VStack(spacing: WZ.Space.space6) {
                switch flow.step {
                case .starting, .waitingForOtherDevice:
                    ProgressView().tint(theme.accent)
                    Text(String(localized: "settings.openWizardchatOrAnother"))
                        .multilineTextAlignment(.center)
                case .waitingForEmojis:
                    ProgressView().tint(theme.accent)
                    Text(String(localized: "settings.waitingForTheOther"))
                case .compare(let emojis):
                    Text(String(localized: "settings.checkThatTheseEmojis"))
                        .multilineTextAlignment(.center)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: WZ.Space.space5) {
                        ForEach(Array(emojis.enumerated()), id: \.offset) { _, emoji in
                            VStack(spacing: WZ.Space.space2) {
                                Text(emoji.symbol).font(.system(size: WZ.SizeIcon.xl))
                                Text(emoji.description)
                                    .font(.wizard(WZ.FontSize.xs))
                                    .foregroundStyle(theme.textMuted)
                                    .lineLimit(1)
                            }
                        }
                    }
                    HStack(spacing: WZ.Space.space4) {
                        Button(String(localized: "verification.theyDontMatch")) { Task { await flow.confirm(false) } }
                            .buttonStyle(SecondaryButtonStyle())
                        Button(String(localized: "verification.theyMatch")) { Task { await flow.confirm(true) } }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                case .done:
                    Image("ph-shield-check-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.success)
                    Text(String(localized: "settings.sessions.verified")).font(.wizard(WZ.FontSize.lg, .bold))
                    Button(String(localized: "common.done")) { dismiss() }.buttonStyle(PrimaryButtonStyle())
                case .failed(let message):
                    Image("ph-x-circle-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.error)
                    Text(message).multilineTextAlignment(.center)
                case .cancelled:
                    Text(String(localized: "settings.verificationWasCancelled"))
                }
                Spacer()
            }
            .font(.wizard(WZ.FontSize.md))
            .foregroundStyle(theme.textPrimary)
            .padding(WZ.Space.space7)
            .frame(maxWidth: .infinity)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "settings.verifyWithAnotherDevice"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) {
                        Task { await flow.cancel() }
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await flow.start(session: session) }
    }
}
