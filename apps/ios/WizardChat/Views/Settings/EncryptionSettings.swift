import WizardChatCore
import SwiftUI

struct EncryptionSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @StateObject private var setup = EncryptionSetupModel()

    /// nil while checking
    @State private var hasIdentity: Bool?
    @State private var excludeInsecure = false
    @State private var confirmReset = false
    @State private var confirmReload = false
    @State private var confirmChangeKey = false
    @State private var keyReplaced = false

    private var hasRecoveryKey: Bool {
        session.encryption?.recovery == "enabled" || session.encryption?.recovery == "incomplete"
    }

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
                    Button(String(localized: "verification.session.setupButton")) { setup.run(session) }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(setup.busy)
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
                SettingsSection(title: "settings.encryption.recoveryKey",
                                note: hasRecoveryKey ? "settings.encryption.recoveryKeyActiveNote"
                                                     : "settings.encryption.recoveryKeyMissingNote") {
                    Button {
                        if hasRecoveryKey { confirmChangeKey = true } else { createRecoveryKey(replace: false) }
                    } label: {
                        HStack {
                            if setup.busy { ProgressView().tint(theme.accent) }
                            Text(String(localized: hasRecoveryKey ? "settings.encryption.changeRecoveryKey"
                                                                  : "settings.encryption.setUpRecoveryKey"))
                        }
                    }
                    .disabled(setup.busy)
                }
            }

            if hasIdentity == true {
                SettingsSection(title: "settings.encryption.reset", note: "settings.encryption.resetNote") {
                    Button(role: .destructive) { confirmReset = true } label: {
                        HStack {
                            if setup.busy { ProgressView().tint(theme.danger) }
                            Text(String(localized: "settings.encryption.resetButton"))
                        }
                    }
                    .foregroundStyle(theme.danger)
                    .disabled(setup.busy)
                }
            }

            if let error = setup.error { StatusText(text: error) }
        }
        .task {
            excludeInsecure = session.excludesInsecureDevices
            hasIdentity = await session.hasEncryptionIdentity()
        }
        .onChange(of: setup.recoveryKey) { _, _ in
            Task { hasIdentity = await session.hasEncryptionIdentity() }
        }
        .confirmationDialog(String(localized: "verification.setupOverwritesTitle"), isPresented: $confirmReset, titleVisibility: .visible) {
            Button(String(localized: "settings.encryption.resetButton"), role: .destructive) { setup.run(session) }
        } message: {
            Text(String(localized: "verification.setupOverwritesConfirm"))
        }
        .confirmationDialog(String(localized: "settings.encryption.changeRecoveryKey"), isPresented: $confirmChangeKey, titleVisibility: .visible) {
            Button(String(localized: "settings.encryption.changeRecoveryKey"), role: .destructive) { createRecoveryKey(replace: true) }
        } message: {
            Text(String(localized: "settings.encryption.changeRecoveryKeyConfirm"))
        }
        .alert(String(localized: "settings.encryption.excludeInsecure"), isPresented: $confirmReload) {
            Button(String(localized: "common.reloadNow")) { Task { await session.restart() } }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        } message: {
            Text(String(localized: "settings.encryption.excludeInsecureReload"))
        }
        .modifier(EncryptionSetupPrompts(model: setup))
        .sheet(item: Binding(get: { setup.recoveryKey.map { IdentifiedString(id: $0) } },
                             set: { if $0 == nil { setup.recoveryKey = nil } })) { item in
            ScrollView {
                RecoveryKeyView(recoveryKey: item.id, replaced: keyReplaced) {
                    setup.recoveryKey = nil
                    keyReplaced = false
                }
                    .padding(WZ.Space.space7)
            }
            .background(theme.bgSecondary)
            .interactiveDismissDisabled()
        }
    }

    private func createRecoveryKey(replace: Bool) {
        setup.busy = true
        setup.error = nil
        Task {
            defer { setup.busy = false }
            do {
                let key = replace ? try await session.resetRecoveryKey() : try await session.enableRecovery()
                keyReplaced = replace
                setup.recoveryKey = key
            } catch {
                setup.error = L10n.format("settings.keyBackup.setupFailed", error.localizedDescription)
            }
        }
    }
}
