import SwiftUI
import UIKit

struct AppearanceSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var iconError: String?

    private var themeHasIcon: Bool { !prefs.followSystemTheme && Themes.hasThemedLogo(prefs.theme) }

    private func swatch(for name: String) -> LinearGradient {
        let resolved = Themes.resolve(name, customs: prefs.customThemes)
        return LinearGradient(
            stops: [.init(color: resolved.bgSecondary, location: 0.5), .init(color: resolved.accent, location: 0.5)],
            startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var themeNames: [String] {
        Themes.all.map(\.name) + prefs.customThemes.map(\.themeName)
    }

    var body: some View {
        SettingsPage(title: "settings.appearance.title") {
            ChatPreview()
                .settingsCard()

            SettingsSection {
                ToggleRow(label: "settings.appearance.followSystemTheme",
                          note: "settings.appearance.followSystemThemeNote",
                          isOn: $prefs.followSystemTheme)
                if prefs.followSystemTheme {
                    ThemeMenuRow(label: "settings.appearance.systemDarkTheme", selection: $prefs.systemDarkTheme)
                    ThemeMenuRow(label: "settings.appearance.systemLightTheme", selection: $prefs.systemLightTheme)
                } else {
                    // Thirty themes don't fit beside the label, so it sits above them
                    VStack(alignment: .leading, spacing: WZ.Space.space4) {
                        Text(String(localized: "settings.appearance.theme"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: WZ.Space.space4) {
                                ForEach(themeNames, id: \.self) { name in
                                    Button {
                                        prefs.theme = name
                                    } label: {
                                        Circle()
                                            .fill(swatch(for: name))
                                            .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                                            .overlay(Circle().stroke(prefs.theme == name ? theme.accent : theme.border,
                                                                     lineWidth: prefs.theme == name ? 2.5 : 1))
                                            .padding(WZ.Space.space1)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(Themes.label(name, customs: prefs.customThemes))
                                    .accessibilityAddTraits(prefs.theme == name ? .isSelected : [])
                                }
                            }
                        }
                    }
                    .padding(.vertical, WZ.Space.space4)
                }
                NavigationLink {
                    CustomThemesSettings()
                } label: {
                    Text("settings.appearance.customTheme.title")
                        .font(.wizard(WZ.FontSize.lg))
                        .foregroundStyle(theme.textPrimary)
                }
                SettingsDivider()
                PickerRow(label: "settings.appearance.messageLayout", selection: $prefs.messageLayout,
                          options: [(.modern, "settings.appearance.modern"), (.classic, "settings.appearance.classic")])
                SettingsDivider()
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    HStack {
                        Text(String(localized: "settings.appearance.textSize"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                        Spacer()
                        Text(L10n.format("settings.textSizePx", "\(Int(prefs.chatFontSize))"))
                            .font(.wizard(WZ.FontSize.sm, .medium))
                            .foregroundStyle(theme.textMuted)
                    }
                    Slider(
                        value: Binding(
                            get: { Double(AppPreferences.chatFontSizes.firstIndex(of: prefs.chatFontSize) ?? 2) },
                            set: { prefs.chatFontSize = AppPreferences.chatFontSizes[Int($0.rounded())] }
                        ),
                        in: 0...Double(AppPreferences.chatFontSizes.count - 1),
                        step: 1
                    )
                    .tint(theme.accent)
                    .onTapGesture(count: 2) { prefs.chatFontSize = AppPreferences.defaultChatFontSize }
                }
                .padding(.vertical, WZ.Space.space4)
                SettingsDivider()
                PickerRow(label: "settings.appearance.density", selection: $prefs.chatDensity,
                          options: [(.compact, "settings.appearance.densityCompact"), (.default, "settings.appearance.densityDefault"), (.spacious, "settings.appearance.densitySpacious")])
                SettingsDivider()
                ToggleRow(label: "settings.appearance.prettifyLinks",
                          note: "settings.appearance.prettifyLinksNote",
                          isOn: $prefs.prettifyLinks)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.themedAppIcon",
                          isOn: Binding(get: { themeHasIcon && prefs.themedAppIcon },
                                        set: { prefs.themedAppIcon = $0 }),
                          disabled: !themeHasIcon)
            }
            if let iconError { StatusText(text: iconError) }

            SettingsSection {
                PickerRow(label: "settings.appearance.uiDensity",
                          note: "settings.appearance.uiDensityNote",
                          selection: $prefs.uiDensity,
                          options: [(.compact, "settings.appearance.densityCompact"), (.default, "settings.appearance.densityDefault"), (.spacious, "settings.appearance.densitySpacious")])
                SettingsDivider()
                ToggleRow(label: "settings.appearance.showRoomAvatars", isOn: $prefs.showRoomAvatars)
            }

            SettingsSection {
                PickerRow(label: "settings.appearance.timeFormat", selection: $prefs.timeFormat,
                          options: [(.auto, "settings.appearance.timeFormatAuto"), (.h12, "settings.appearance.timeFormat12h"), (.h24, "settings.appearance.timeFormat24h")])
                PickerRow(label: "settings.appearance.dateFormat", selection: $prefs.dateFormat,
                          options: [(.long, "settings.appearance.dateFormatLong"), (.dmy, "settings.appearance.dateFormatDmy"), (.mdy, "settings.appearance.dateFormatMdy"), (.ymd, "settings.appearance.dateFormatYmd")])
                PickerRow(label: "settings.appearance.emojiOnlySize", note: "settings.appearance.emojiOnlySizeNote",
                          selection: $prefs.emojiOnlySize,
                          options: [(.normal, "settings.appearance.emojiOnlySizeNormal"), (.large, "settings.appearance.emojiOnlySizeLarge"), (.jumbo, "settings.appearance.emojiOnlySizeJumbo")])
                ToggleRow(label: "settings.appearance.emoticonsToEmoji",
                          note: "settings.appearance.emoticonsToEmojiNote",
                          isOn: $prefs.emoticonsToEmoji)
                ToggleRow(label: "settings.appearance.groupImages",
                          note: "settings.appearance.groupImagesNote",
                          isOn: $prefs.groupImages)
            }
        }
    }
}

/// A theme picked from a menu: the built-in ones, then the user's own
struct ThemeMenuRow: View {
    let label: LocalizedStringKey
    @Binding var selection: String
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    private var names: [String] {
        Themes.all.map(\.name) + prefs.customThemes.map(\.themeName)
    }

    var body: some View {
        Picker(selection: $selection) {
            ForEach(names, id: \.self) { name in
                Text(verbatim: Themes.label(name, customs: prefs.customThemes)).tag(name)
            }
        } label: {
            Text(label)
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(theme.textPrimary)
        }
        .pickerStyle(.menu)
        .tint(theme.textMuted)
    }
}

private struct ChatPreview: View {
    @EnvironmentObject private var session: MatrixSession

    var body: some View {
        let now = Date()
        VStack(spacing: WZ.Space.space0) {
            MessageRow(entry: ChatEntry(
                id: "preview-1", kind: .message(body: L10n.format("settings.appearance.previewOtherMessage", session.displayName ?? session.userId ?? ""), isEmote: false, isNotice: false),
                sender: "@merlin:wizardchat.org", senderName: "Merlin", senderAvatarUrl: nil, isOwn: false,
                timestamp: now.addingTimeInterval(-120), isSending: false, isEdited: false))
            MessageRow(entry: ChatEntry(
                id: "preview-2", kind: .message(body: L10n.format("settings.appearance.previewOwnMessage", "Merlin"), isEmote: false, isNotice: false),
                sender: session.userId ?? "", senderName: session.displayName ?? session.userId ?? "",
                senderAvatarUrl: session.avatarUrl, isOwn: true,
                timestamp: now.addingTimeInterval(-60), isSending: false, isEdited: false))
        }
        .padding(.vertical, WZ.Space.space4)
        .allowsHitTesting(false)
    }
}

struct AccessibilitySettings: View {
    @EnvironmentObject private var prefs: AppPreferences

    var body: some View {
        SettingsPage(title: "settings.accessibility.title") {
            SettingsSection {
                PickerRow(label: "settings.accessibility.reducedMotion", note: "settings.accessibility.reducedMotionNote",
                          selection: $prefs.reducedMotion,
                          options: [(.system, "settings.accessibility.reducedMotionSystem"), (.on, "settings.accessibility.reducedMotionOn"), (.off, "settings.accessibility.reducedMotionOff")])
                SettingsDivider()
                ToggleRow(label: "settings.accessibility.autoplayGifs",
                          note: "settings.accessibility.autoplayGifsNote",
                          isOn: $prefs.autoplayGifs)
            }
        }
    }
}

struct PrivacySettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession

    var body: some View {
        SettingsPage(title: "settings.privacy.title") {
            SettingsSection(title: "settings.privacy.chat") {
                ToggleRow(label: "settings.privacy.typingIndicators",
                          note: "settings.privacy.typingIndicatorsNote",
                          isOn: $prefs.typingIndicators)
                SettingsDivider()
                ToggleRow(label: "settings.readReceipts",
                          note: "settings.letOtherUsersKnow",
                          isOn: $prefs.sendReadReceipts)
            }
            SettingsSection(title: "settings.privacy.media") {
                PickerRow(label: "settings.privacy.mediaVisibility", selection: $prefs.mediaVisibility,
                          options: [(.always, "settings.privacy.mediaVisibilityAlways"), (.private, "settings.privacy.mediaVisibilityPrivate"), (.never, "settings.privacy.mediaVisibilityNever")])
            }
            SettingsSection(title: "settings.privacy.streamer.title", note: "settings.privacy.streamer.note") {
                PickerRow(label: "settings.privacy.streamer.mode", selection: $prefs.streamerMode,
                          options: [(.off, "settings.privacy.streamer.off"), (.auto, "settings.privacy.streamer.auto"), (.on, "settings.privacy.streamer.on")])
            }
            SettingsSection(title: "settings.privacy.other") {
                ToggleRow(label: "settings.privacy.showPresence",
                          note: "settings.privacy.showPresenceNote",
                          isOn: $prefs.showPresence)
                ToggleRow(label: "settings.privacy.showHomeserverSoftware",
                          note: "settings.privacy.showHomeserverSoftwareNote",
                          isOn: $prefs.showHomeserverSoftware)
            }
        }
    }
}

struct LanguageSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @State private var changed = false

    /// The languages in `AppPreferences.languages` order, each under its own name
    private static let options: [(String, LocalizedStringKey)] = [
        ("", "settings.language.languageSystem"),
        ("en", "settings.language.languageEn"),
        ("de", "settings.language.languageDe"),
        ("es", "settings.language.languageEs"),
        ("fr", "settings.language.languageFr"),
        ("it", "settings.language.languageIt"),
        ("pt", "settings.language.languagePt"),
        ("ru", "settings.language.languageRu"),
        ("ja", "settings.language.languageJa"),
        ("tr", "settings.language.languageTr"),
        ("nl", "settings.language.languageNl"),
        ("pl", "settings.language.languagePl"),
    ]

    var body: some View {
        SettingsPage(title: "settings.language.title") {
            SettingsSection {
                PickerRow(label: "settings.language.languageDisplay", selection: $prefs.language,
                          options: Self.options)
            }
            if changed {
                StatusText(text: String(localized: "settings.closeAndReopenWizardchat"), isError: false)
            }
        }
        .onChange(of: prefs.language) { _, _ in changed = true }
    }
}

struct DeveloperSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var tokenExpanded = false

    var body: some View {
        SettingsPage(title: "settings.developer.title") {
            SettingsSection {
                ToggleRow(label: "settings.developer.enable",
                          note: "settings.developer.enableDescription",
                          isOn: $prefs.developerMode)
            }
            if prefs.developerMode {
                SettingsSection {
                    DisclosureGroup(isExpanded: $tokenExpanded) {
                        VStack(alignment: .leading, spacing: WZ.Space.space4) {
                            Label(String(localized: "settings.developer.accessTokenWarning"),
                                  image: "ph-warning-regular")
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.warningColor)
                            CopyRow(label: "settings.developer.accessToken", value: session.client?.session.accessToken ?? "", secret: true)
                        }
                        .padding(.top, WZ.Space.space4)
                    } label: {
                        Text(String(localized: "settings.developer.accessToken"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                    }
                    SettingsDivider()
                    CopyRow(label: "settings.developer.homeserverUrl", value: session.client?.session.homeserverUrl ?? "")
                    if let deviceId = session.deviceId {
                        SettingsDivider()
                        CopyRow(label: "settings.sessions.deviceId", value: deviceId)
                    }
                }
                SettingsSection {
                    NavigationLink {
                        AccountDataExplorer()
                    } label: {
                        Text(String(localized: "settings.developer.accountData"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                    }
                }
            }
        }
    }
}

extension WizardTheme {
}

struct AboutSettings: View {
    @Environment(\.theme) private var theme
    @State private var showWhatsNew = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        return "v\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }

    var body: some View {
        SettingsPage(title: "settings.about.title") {
            VStack(spacing: WZ.Space.space4) {
                WizardLogo(size: WZ.Space.space12)
                Text(String(localized: "app.name"))
                    .font(.wizard(WZ.FontSize.xxl, .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(String(localized: "welcome.tagline"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                Text(version)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, WZ.Space.space4)

            VStack(spacing: WZ.Space.space4) {
                Link(destination: URL(string: "https://wizardchat.org")!) {
                    Label(String(localized: "settings.downloadWizardchatForDesktop"), image: "ph-download-simple-regular")
                }
                .buttonStyle(SecondaryButtonStyle())
                Link(destination: URL(string: "https://gitlab.com/wizardchat/wizardchat")!) {
                    Label(String(localized: "settings.about.viewSourceOnGitLab"), image: "ph-code-regular")
                }
                .buttonStyle(SecondaryButtonStyle())
                if let entry = WhatsNew.latest() {
                    Button { showWhatsNew = true } label: {
                        Label(String(localized: "whatsNew.title"), image: "ph-sparkle-fill")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .sheet(isPresented: $showWhatsNew) { WhatsNewSheet(entry: entry) }
                }
            }

            SettingsSection(title: "settings.about.credits") {
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    credit("matrix-rust-sdk", url: "https://github.com/matrix-org/matrix-rust-sdk",
                           text: String(localized: "settings.about.creditMatrix"))
                    credit("Roboto", url: "https://fonts.google.com/specimen/Roboto",
                           text: String(localized: "settings.about.creditRoboto"))
                }
            }
        }
    }

    private func credit(_ name: String, url: String, text: String) -> some View {
        (Text(.init("[\(name)](\(url))")).foregroundColor(theme.accent)
         + Text(" ") + Text(LocalizedStringKey(text)).foregroundColor(theme.textMuted))
            .font(.wizard(WZ.FontSize.sm))
    }
}
