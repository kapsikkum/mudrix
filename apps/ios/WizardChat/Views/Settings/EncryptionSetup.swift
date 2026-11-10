import WizardChatCore
import SwiftUI

@MainActor
final class EncryptionSetupModel: ObservableObject {
    @Published var busy = false
    @Published var askPassword = false
    @Published var password = ""
    @Published var approvalURL: URL?
    @Published var recoveryKey: String?
    @Published var error: String?
    private var cancelled = false

    func run(_ session: MatrixSession, password: String? = nil) {
        busy = true
        error = nil
        cancelled = false
        Task {
            defer {
                busy = false
                approvalURL = nil
                self.password = ""
            }
            do {
                try await session.resetIdentity(password: password) { url in
                    Task { @MainActor in self.approvalURL = url }
                }
                recoveryKey = try await session.enableRecovery()
                session.checkIdentity()
            } catch let failure as WizardError where failure.code == "passwordRequired" {
                askPassword = true
            } catch where !cancelled {
                self.error = L10n.format("settings.keyBackup.setupFailed", error.localizedDescription)
            } catch {}
        }
    }

    func cancelApproval(_ session: MatrixSession) {
        cancelled = true
        approvalURL = nil
        Task { await session.cancelIdentityReset() }
    }
}

struct EncryptionSetupPrompts: ViewModifier {
    @ObservedObject var model: EncryptionSetupModel
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
        content
            .alert(String(localized: "settings.keyBackup.uiaTitle"), isPresented: $model.askPassword) {
                SecureField(String(localized: "settings.keyBackup.uiaPasswordLabel"), text: $model.password)
                Button(String(localized: "common.confirm")) { model.run(session, password: model.password) }
                Button(String(localized: "common.cancel"), role: .cancel) { model.password = "" }
            } message: {
                Text(String(localized: "settings.keyBackup.uiaDescription"))
            }
            .sheet(item: Binding(get: { model.approvalURL.map { IdentifiedString(id: $0.absoluteString) } },
                                 set: { if $0 == nil { model.approvalURL = nil } })) { item in
                approvalSheet(item.id)
            }
    }

    private func approvalSheet(_ url: String) -> some View {
        NavigationStack {
            VStack(spacing: WZ.Space.space6) {
                Text(String(localized: "settings.keyBackup.uiaResetDescription"))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(theme.textMuted)
                Button(String(localized: "settings.keyBackup.uiaResetCta")) {
                    if let url = URL(string: url) { openURL(url) }
                }
                .buttonStyle(PrimaryButtonStyle())
                ProgressView().tint(theme.accent)
                Spacer()
            }
            .font(.wizard(WZ.FontSize.md))
            .padding(WZ.Space.space7)
            .frame(maxWidth: .infinity)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "settings.keyBackup.uiaResetTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { model.cancelApproval(session) }
                }
            }
        }
        .presentationDetents([.medium])
        .interactiveDismissDisabled()
    }
}

struct RecoveryKeyView: View {
    let recoveryKey: String
    var replaced = false
    let onDone: () -> Void
    @Environment(\.theme) private var theme
    @EnvironmentObject private var prefs: AppPreferences
    @State private var saved = false

    var body: some View {
        VStack(spacing: WZ.Space.space6) {
            Image("ph-key-regular")
                .font(.system(size: WZ.SizeIcon.xl))
                .foregroundStyle(theme.accent)
            Text(String(localized: replaced ? "settings.keyBackup.newRecoveryKeyGenerated" : "settings.keyBackup.yourRecoveryKey"))
                .font(.wizard(WZ.FontSize.xl, .bold))
                .multilineTextAlignment(.center)
            Text(String(localized: replaced ? "settings.keyBackup.oldKeyWarningBody" : "settings.keyBackup.storeKeyWarning"))
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.center)
            // Streamer mode keeps the key off the screen; Copy and Share still hand it over
            Text(prefs.streamerModeActive ? "••••" : recoveryKey)
                .font(.system(size: WZ.FontSize.md, design: .monospaced))
                .textSelection(.enabled)
                .multilineTextAlignment(.center)
                .padding(WZ.Space.space5)
                .frame(maxWidth: .infinity)
                .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            HStack(spacing: WZ.Space.space4) {
                Button {
                    UIPasteboard.general.string = recoveryKey
                    saved = true
                } label: {
                    Label(String(localized: "common.copy"), image: "ph-copy-regular").frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
                ShareLink(item: recoveryKey) {
                    Label(String(localized: "common.download"), image: "ph-download-simple-regular").frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
                .simultaneousGesture(TapGesture().onEnded { saved = true })
            }
            Button(String(localized: "settings.keyBackup.savedConfirmButton"), action: onDone)
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!saved)
        }
    }
}

struct EncryptionSetupScreen: View {
    @ObservedObject var model: EncryptionSetupModel
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @AppStorage(EncryptionSetupScreen.skippedKey) private var skippedDevice = ""
    @State private var hasOtherVerifiedSession = false
    @State private var verification: VerificationModel?
    @State private var showRecoveryKeyEntry = false
    @State private var confirmReset = false
    @State private var confirmSkip = false

    static let skippedKey = "verifySkippedDevice"

    private var hasRecoveryKey: Bool {
        session.encryption?.recovery == "enabled" || session.encryption?.recovery == "incomplete"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: WZ.Space.space6) {
                Spacer(minLength: WZ.Space.space10)
                if let key = model.recoveryKey {
                    RecoveryKeyView(recoveryKey: key) { model.recoveryKey = nil }
                } else if session.needsEncryptionSetup {
                    header(title: "verification.session.setupTitle", body: "verification.session.setupBody")
                    primaryButton("verification.session.setupButton") { model.run(session) }
                    footer(skippable: false)
                } else {
                    verify
                }
                if let error = model.error { StatusText(text: error) }
            }
            .padding(WZ.Space.space7)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(theme.bgPrimary.ignoresSafeArea())
        .modifier(EncryptionSetupPrompts(model: model))
        .interactiveDismissDisabled()
        .task(id: session.needsVerification) {
            guard session.needsVerification,
                  let devices = try? await session.requireClient.devices() else { return }
            hasOtherVerifiedSession = devices.contains { !$0.isCurrent && $0.crossSignedByOwner }
        }
        .sheet(isPresented: $showRecoveryKeyEntry) { RecoveryKeyEntrySheet() }
        .sheet(item: $verification) { VerificationSheet(model: $0) }
        .confirmationDialog(String(localized: "verification.setupOverwritesTitle"), isPresented: $confirmReset, titleVisibility: .visible) {
            Button(String(localized: "settings.encryption.resetButton"), role: .destructive) { model.run(session) }
        } message: {
            Text(String(localized: "verification.setupOverwritesConfirm"))
        }
        .confirmationDialog(String(localized: "verification.session.skipConfirmTitle"), isPresented: $confirmSkip, titleVisibility: .visible) {
            Button(String(localized: "verification.session.skipConfirm"), role: .destructive) {
                skippedDevice = session.deviceId ?? ""
            }
        } message: {
            Text(String(localized: "verification.session.skipConfirmBody"))
        }
    }

    @ViewBuilder
    private var verify: some View {
        let cannotVerify = !hasOtherVerifiedSession && !hasRecoveryKey
        header(title: "verification.session.title",
               body: cannotVerify ? "verification.session.noWayToVerify" : "verification.session.body")
        if cannotVerify {
            primaryButton("verification.session.resetAndSetUp") { model.run(session) }
        } else {
            if hasOtherVerifiedSession {
                primaryButton("verification.session.useOtherDevice", icon: "ph-devices-regular") {
                    verification = VerificationModel(.ownDevice)
                }
            }
            if hasRecoveryKey {
                if hasOtherVerifiedSession {
                    recoveryKeyButton.buttonStyle(SecondaryButtonStyle())
                } else {
                    recoveryKeyButton.buttonStyle(PrimaryButtonStyle())
                }
            }
            Button(String(localized: "verification.session.reset")) { confirmReset = true }
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.danger)
                .disabled(model.busy)
        }
        footer(skippable: true)
    }

    private var recoveryKeyButton: some View {
        Button {
            showRecoveryKeyEntry = true
        } label: {
            Label(String(localized: "verification.session.useRecoveryKey"), image: "ph-key-regular")
        }
        .disabled(model.busy)
    }

    private func header(title: String, body: String) -> some View {
        VStack(spacing: WZ.Space.space6) {
            Image("ph-shield-check-regular")
                .font(.system(size: WZ.SizeIcon.xl))
                .foregroundStyle(theme.accent)
            Text(String(localized: String.LocalizationValue(title)))
                .font(.wizard(WZ.FontSize.xl, .bold))
                .multilineTextAlignment(.center)
            Text(String(localized: String.LocalizationValue(body)))
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.center)
        }
    }

    private func primaryButton(_ title: String, icon: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                if model.busy {
                    ProgressView().tint(theme.textOnAccent)
                } else if let icon {
                    Image(icon)
                }
                Text(String(localized: String.LocalizationValue(title)))
            }
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(model.busy)
    }

    private func footer(skippable: Bool) -> some View {
        HStack(spacing: WZ.Space.space4) {
            if skippable {
                Button(String(localized: "verification.session.skip")) { confirmSkip = true }
                Text(verbatim: "·")
            }
            Button(String(localized: "settings.account.logout")) { Task { await session.logout() } }
        }
        .font(.wizard(WZ.FontSize.sm))
        .foregroundStyle(theme.textMuted)
        .disabled(model.busy)
    }
}
