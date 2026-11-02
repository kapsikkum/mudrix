import SwiftUI

struct SettingsView: View {
    var isTab = false
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    enum Page: Hashable, CaseIterable {
        case account, privacy, emojis, notifications, appearance, accessibility, language, sessions, developer, about

        var title: LocalizedStringKey {
            switch self {
            case .account: return "settings.account.title"
            case .privacy: return "settings.privacy.title"
            case .emojis: return "room.settings.emojis.title"
            case .notifications: return "settings.notifications.title"
            case .appearance: return "settings.appearance.title"
            case .accessibility: return "settings.accessibility.title"
            case .language: return "settings.language.title"
            case .sessions: return "settings.sessions.title"
            case .developer: return "settings.developer.title"
            case .about: return "settings.about.title"
            }
        }

        var icon: String {
            switch self {
            case .account: return "ph-user-regular"
            case .privacy: return "ph-shield-regular"
            case .emojis: return "ph-smiley-sticker-regular"
            case .notifications: return "ph-bell-regular"
            case .appearance: return "ph-palette-regular"
            case .accessibility: return "ph-person-simple-circle-regular"
            case .language: return "ph-globe-simple-regular"
            case .sessions: return "ph-devices-regular"
            case .developer: return "ph-wrench-regular"
            case .about: return "ph-info-regular"
            }
        }
    }

    var body: some View {
        NavigationStack {
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
                                Text(session.userId ?? "")
                                    .font(.wizard(WZ.FontSize.md))
                                    .foregroundStyle(theme.textMuted)
                            }
                            .lineLimit(1)
                        }
                        .padding(.vertical, WZ.Space.space2)
                    }
                }

                Section {
                    ForEach([Page.privacy, .notifications, .emojis]) { pageRow($0) }
                }
                Section {
                    ForEach([Page.appearance, .accessibility, .language]) { pageRow($0) }
                }
                Section {
                    ForEach([Page.sessions, .developer, .about]) { pageRow($0) }
                }

                Section {
                    Button(role: .destructive) {
                        if !isTab { dismiss() }
                        Task { await session.logout() }
                    } label: {
                        Text(String(localized: "settings.account.logout"))
                            .font(.wizard(WZ.FontSize.lg))
                            .foregroundStyle(theme.error)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .clearsBottomBar()
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
                case .emojis: EmojisSettings()
                case .notifications: NotificationSettingsPage()
                case .appearance: AppearanceSettings()
                case .accessibility: AccessibilitySettings()
                case .language: LanguageSettings()
                case .sessions: SessionsSettings()
                case .developer: DeveloperSettings()
                case .about: AboutSettings()
                }
            }
            .tint(theme.accent)
        }
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
        .clearsBottomBar()
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
            .foregroundStyle(theme.accent)
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
