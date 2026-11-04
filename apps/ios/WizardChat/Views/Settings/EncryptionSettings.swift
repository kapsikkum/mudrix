import WizardChatCore
import SwiftUI

struct EncryptionSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    /// nil while checking
    @State private var hasIdentity: Bool?
    @State private var excludeInsecure = false
    @State private var busy = false
    @State private var confirmReset = false
    @State private var confirmReload = false
    @State private var askPassword = false
    @State private var password = ""
    @State private var approvalURL: URL?
    @State private var newRecoveryKey: String?
    @State private var error: String?
    @State private var cancelled = false

    var body: some View {
        SettingsPage(title: "settings.encryption.title") {
            SettingsSection {
                HStack(spacing: WZ.Space.space5) {
                    VStack(alignment: .leading, spacing: WZ.Space.space1) {
                        Text(String(localized: "settings.encryption.endToEnd"))
                        Text(hasIdentity == false ? String(localized: "settings.encryption.notSetUpNote")
                                                  : String(localized: "settings.encryption.activeNote"))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                    Spacer(minLength: WZ.Space.space4)
                    switch hasIdentity {
                    case nil:
                        ProgressView().tint(theme.accent)
                    case false?:
                        EmptyView()
                    case true?:
                        Label(String(localized: "settings.encryption.active"), image: "ph-check-circle-fill")
                            .font(.wizard(WZ.FontSize.sm, .semibold))
                            .foregroundStyle(theme.success)
                    }
                }
                if hasIdentity == false {
                    Button(String(localized: "verifySession.setupButton")) { reset(password: nil) }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(busy)
                }
            }

            SettingsSection {
                ToggleRow(label: "settings.encryption.excludeInsecure",
                          note: "settings.encryption.excludeInsecureNote",
                          isOn: Binding(get: { excludeInsecure }, set: { value in
                              excludeInsecure = value
                              session.setExcludeInsecureDevices(value)
                              confirmReload = true
                          }))
            }

            if hasIdentity == true {
                SettingsSection(title: "settings.encryption.reset", note: "settings.encryption.resetNote") {
                    Button(role: .destructive) { confirmReset = true } label: {
                        HStack {
                            if busy { ProgressView().tint(theme.danger) }
                            Text(String(localized: "settings.encryption.resetButton"))
                        }
                    }
                    .foregroundStyle(theme.danger)
                    .disabled(busy)
                }
            }

            if let error { StatusText(text: error) }
        }
        .task {
            excludeInsecure = session.excludesInsecureDevices
            hasIdentity = await session.hasEncryptionIdentity()
        }
        .confirmationDialog(String(localized: "crypto.setupOverwritesTitle"), isPresented: $confirmReset, titleVisibility: .visible) {
            Button(String(localized: "settings.encryption.resetButton"), role: .destructive) { reset(password: nil) }
        } message: {
            Text(String(localized: "crypto.setupOverwritesConfirm"))
        }
        .alert(String(localized: "settings.encryption.excludeInsecure"), isPresented: $confirmReload) {
            Button(String(localized: "auth.reloadNow")) { Task { await session.restart() } }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        } message: {
            Text(String(localized: "settings.encryption.excludeInsecureReload"))
        }
        .alert(String(localized: "settings.keyBackup.uiaTitle"), isPresented: $askPassword) {
            SecureField(String(localized: "settings.keyBackup.uiaPasswordLabel"), text: $password)
            Button(String(localized: "settings.keyBackup.uiaConfirm")) { reset(password: password) }
            Button(String(localized: "common.cancel"), role: .cancel) { password = "" }
        } message: {
            Text(String(localized: "settings.keyBackup.uiaDescription"))
        }
        .alert(String(localized: "settings.setUpRecoveryKey"), isPresented: Binding(get: { newRecoveryKey != nil },
                                                                                  set: { if !$0 { newRecoveryKey = nil } })) {
            Button(String(localized: "common.copy")) { UIPasteboard.general.string = newRecoveryKey }
            Button(String(localized: "common.done"), role: .cancel) {}
        } message: {
            Text(L10n.format("settings.recoveryKeySaveHint", newRecoveryKey ?? ""))
        }
        .sheet(item: Binding(get: { approvalURL.map { IdentifiedString(id: $0.absoluteString) } }, set: { if $0 == nil { approvalURL = nil } })) { item in
            approvalSheet(item.id)
        }
    }

    /// OAuth accounts approve the reset on their account page; the reset carries on by itself
    /// once it's approved there
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
                    Button(String(localized: "common.cancel")) {
                        cancelled = true
                        approvalURL = nil
                        Task { await session.cancelIdentityReset() }
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .interactiveDismissDisabled()
    }

    private func reset(password: String?) {
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
                    Task { @MainActor in approvalURL = url }
                }
                newRecoveryKey = try await session.enableRecovery()
                hasIdentity = await session.hasEncryptionIdentity()
            } catch let failure as WizardError where failure.code == "passwordRequired" {
                askPassword = true
            } catch where !cancelled {
                self.error = L10n.format("settings.keyBackup.setupFailed", error.localizedDescription)
            } catch {}
        }
    }
}
