import SwiftUI

struct SettingsView: View {
    var isTab = false
    /// Changes when the You tab is tapped again, to go back to the list
    var popToRoot = 0
    @State private var path: [Page] = []
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    enum Page: Hashable, CaseIterable {
        case account, privacy, media, emojis, notifications, appearance, accessibility, language, sessions, encryption, developer, about

        var title: LocalizedStringKey {
            switch self {
            case .account: return "settings.account.title"
            case .privacy: return "settings.privacy.title"
            case .media: return "settings.media.title"
            case .emojis: return "room.settings.emojis.title"
            case .notifications: return "settings.notifications.title"
            case .appearance: return "settings.appearance.title"
            case .accessibility: return "settings.accessibility.title"
            case .language: return "settings.language.title"
            case .sessions: return "settings.sessions.title"
            case .encryption: return "settings.encryption.title"
            case .developer: return "settings.developer.title"
            case .about: return "settings.about.title"
            }
        }

        var icon: String {
            switch self {
            case .account: return "ph-user-regular"
            case .privacy: return "ph-shield-regular"
            case .media: return "ph-film-strip-regular"
            case .emojis: return "ph-smiley-sticker-regular"
            case .notifications: return "ph-bell-regular"
            case .appearance: return "ph-palette-regular"
            case .accessibility: return "ph-person-simple-circle-regular"
            case .language: return "ph-globe-simple-regular"
            case .sessions: return "ph-devices-regular"
            case .encryption: return "ph-lock-key-regular"
            case .developer: return "ph-wrench-regular"
            case .about: return "ph-info-regular"
            }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    NavigationLink(value: Page.account) {
                        HStack(spacing: WZ.Space.space5) {
                            let name = session.displayName ?? session.userId ?? ""
                            AvatarView(name: name, url: session.avatarUrl, size: WZ.SizeAvatar.lg)
                            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                                Text(name)
                                    .font(.wizard(WZ.FontSize.xxl, .semibold))
                                    .foregroundStyle(theme.textPrimary)
                                if let status = session.customStatus?.text {
                                    Text(status)
                                        .font(.wizard(WZ.FontSize.sm))
                                        .foregroundStyle(theme.textSecondary)
                                }
                            }
                            .lineLimit(1)
                        }
                        .padding(.vertical, WZ.Space.space2)
                    }
                    AccountSwitcher(onLogout: { if !isTab { dismiss() } })
                }
                .listRowBackground(theme.groupedRow)

                Section {
                    ForEach([Page.privacy, .media, .notifications, .emojis]) { pageRow($0) }
                }
                Section {
                    ForEach([Page.appearance, .accessibility, .language]) { pageRow($0) }
                }
                Section {
                    ForEach([Page.sessions, .encryption, .developer, .about]) { pageRow($0) }
                }

            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .listRowBackground(theme.groupedRow)
            .background(theme.groupedBackground.ignoresSafeArea())
            .navigationTitle(String(localized: "common.settings"))
            .toolbar {
                if !isTab {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.done")) { dismiss() }
                            .fontWeight(.semibold)
                    }
                }
            }
            .navigationDestination(for: Page.self) { page in
                switch page {
                case .account: AccountSettings()
                case .privacy: PrivacySettings()
                case .media: MediaSettings()
                case .emojis: EmojisSettings()
                case .notifications: NotificationSettingsPage()
                case .appearance: AppearanceSettings()
                case .accessibility: AccessibilitySettings()
                case .language: LanguageSettings()
                case .sessions: SessionsSettings()
                case .encryption: EncryptionSettings()
                case .developer: DeveloperSettings()
                case .about: AboutSettings()
                }
            }
            .tint(theme.control)
        }
        .onChange(of: popToRoot) { _, _ in path = [] }
    }

    private func pageRow(_ page: Page) -> some View {
        NavigationLink(value: page) {
            Label {
                Text(page.title)
                    .font(.wizard(WZ.FontSize.lg))
                    .foregroundStyle(theme.textPrimary)
            } icon: {
                Image(page.icon)
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textMuted)
            }
        }
        .listRowBackground(theme.groupedRow)
    }
}

private struct AccountSwitcher: View {
    let onLogout: () -> Void
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    var body: some View {
        Menu {
            Section {
                ForEach(session.accounts) { account in
                    Toggle(isOn: Binding(
                        get: { account.userId == session.userId },
                        set: { _ in Task { await session.switchAccount(to: account.userId) } }
                    )) {
                        Text(account.displayName ?? account.userId)
                        Text(account.userId)
                    }
                }
            }
            Button { session.isAddingAccount = true } label: {
                Label(menu: String(localized: "settings.accounts.add"), icon: "ph-plus-regular")
            }
            Divider()
            Button(role: .destructive) {
                onLogout()
                Task { await session.logout() }
            } label: {
                Label(menu: L10n.format("settings.accounts.logoutOf", session.displayName ?? session.userId ?? ""), icon: "ph-sign-out-regular", destructive: true)
            }
        } label: {
            HStack(spacing: WZ.Space.space5) {
                Image("ph-user-regular")
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textMuted)
                Text(String(localized: "settings.accounts.switch"))
                    .font(.wizard(WZ.FontSize.lg))
                    .foregroundStyle(theme.textPrimary)
                Spacer()
                Image("ph-caret-up-down-regular")
                    .font(.system(size: WZ.SizeIcon.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .contentShape(Rectangle())
        }
        .listRowBackground(theme.groupedRow)
    }
}

struct AddAccountSheet: View {
    @EnvironmentObject private var session: MatrixSession

    var body: some View {
        NavigationStack {
            LoginView()
                .navigationTitle(String(localized: "auth.addAccountTitle"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(String(localized: "common.cancel")) { session.isAddingAccount = false }
                    }
                }
        }
    }
}

extension SettingsView.Page: Identifiable {
    var id: Self { self }
}

struct SettingsPage<Content: View>: View {
    let title: LocalizedStringKey
    @ViewBuilder let content: () -> Content
    @Environment(\.theme) private var theme

    var body: some View {
        Form {
            content()
                .listRowBackground(theme.groupedRow)
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(theme.groupedBackground.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .font(.wizard(WZ.FontSize.lg))
        .foregroundStyle(theme.textPrimary)
    }
}

struct SettingsSection<Content: View>: View {
    var title: LocalizedStringKey?
    var note: LocalizedStringKey?
    @ViewBuilder let content: () -> Content
    @Environment(\.theme) private var theme

    var body: some View {
        Section {
            content()
        } header: {
            if let title {
                Text(title).foregroundStyle(theme.textMuted)
            }
        } footer: {
            if let note {
                Text(note).foregroundStyle(theme.textMuted)
            }
        }
        .listRowBackground(theme.groupedRow)
    }
}

struct SettingsCard<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        SettingsSection(content: content)
    }
}

extension View {
    func settingsCard() -> some View { self }
}

struct SettingsDivider: View {
    var body: some View { EmptyView() }
}

struct SettingRow<Control: View>: View {
    let label: LocalizedStringKey
    var note: LocalizedStringKey?
    @ViewBuilder let control: () -> Control
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            RowLabel(label: label, note: note)
            Spacer(minLength: 8)
            control()
        }
    }
}

private struct RowLabel: View {
    let label: LocalizedStringKey
    var note: LocalizedStringKey?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space1) {
            Text(label)
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(theme.textPrimary)
            if let note {
                Text(note)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct ToggleRow: View {
    let label: LocalizedStringKey
    var note: LocalizedStringKey?
    @Binding var isOn: Bool
    var disabled = false
    @Environment(\.theme) private var theme

    var body: some View {
        Toggle(isOn: $isOn) {
            RowLabel(label: label, note: note)
        }
        .tint(theme.accent)
        .disabled(disabled)
    }
}

struct PickerRow<Value: Hashable>: View {
    let label: LocalizedStringKey
    var note: LocalizedStringKey?
    @Binding var selection: Value
    let options: [(Value, LocalizedStringKey)]
    @Environment(\.theme) private var theme

    var body: some View {
        Picker(selection: $selection) {
            ForEach(options.indices, id: \.self) { index in
                Text(options[index].1).tag(options[index].0)
            }
        } label: {
            RowLabel(label: label, note: note)
        }
        .pickerStyle(.menu)
        .tint(theme.textMuted)
    }
}

struct CopyRow: View {
    let label: LocalizedStringKey
    let value: String
    var secret = false
    @Environment(\.theme) private var theme
    @State private var revealed = false
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            Text(label)
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
            HStack(spacing: WZ.Space.space5) {
                Text(secret && !revealed ? String(repeating: "•", count: 24) : value)
                    .font(.system(size: WZ.SizeIcon.sm, design: .monospaced))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(secret && revealed ? nil : 1)
                    .truncationMode(.middle)
                Spacer(minLength: 4)
                if secret {
                    Button {
                        revealed.toggle()
                    } label: {
                        Image(revealed ? "ph-eye-slash-regular" : "ph-eye-regular")
                    }
                    .accessibilityLabel(revealed ? String(localized: "common.hide") : String(localized: "common.show"))
                }
                Button {
                    UIPasteboard.general.string = value
                    copied = true
                } label: {
                    Image(copied ? "ph-check-bold" : "ph-copy-regular")
                }
                .accessibilityLabel(String(localized: "common.copy"))
            }
            .font(.system(size: WZ.SizeIcon.sm))
            .foregroundStyle(theme.control)
            .buttonStyle(.borderless)
        }
        .padding(.vertical, WZ.Space.space1)
    }
}

struct StatusText: View {
    let text: String
    var isError = true
    @Environment(\.theme) private var theme

    var body: some View {
        Text(text)
            .font(.wizard(WZ.FontSize.sm))
            .foregroundStyle(isError ? theme.error : theme.success)
            .listRowBackground(Color.clear)
    }
}
