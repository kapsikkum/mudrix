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
                          options: [(.modern, "settings.appearance.modern"), (.classic, "settings.appearance.classic"),
                                    (.compact, "settings.appearance.compact")])
                SettingsDivider()
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    HStack {
                        Text(String(localized: "settings.appearance.textSize"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                        Spacer()
                        Text(L10n.format("settings.appearance.textSizePx", "\(Int(prefs.chatFontSize))"))
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
                ToggleRow(label: "settings.appearance.colorUsernames", isOn: $prefs.colorUsernames)
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
                SettingsDivider()
                ToggleRow(label: "settings.appearance.hideMembershipEvents",
                          note: "settings.appearance.hideMembershipEventsNote",
                          isOn: $prefs.hideMembershipEvents)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.hideProfileEvents",
                          note: "settings.appearance.hideProfileEventsNote",
                          isOn: $prefs.hideProfileEvents)
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

    private static let otherId = "@merlin:wizardchat.org"
    private static let otherName = "Merlin"

    var body: some View {
        let now = Date()
        let myId = session.userId ?? "@you:wizardchat.org"
        let myName = session.displayName ?? session.userId ?? "You"
        VStack(spacing: WZ.Space.space0) {
            MessageRow(entry: entry(
                id: "preview-1", text: "settings.appearance.previewOtherMessage",
                mention: MessageMention(label: Self.label(myName), userId: myId, isOwn: true),
                sender: Self.otherId, senderName: Self.otherName, avatarUrl: nil, isOwn: false,
                timestamp: now.addingTimeInterval(-120)))
            MessageRow(entry: entry(
                id: "preview-2", text: "settings.appearance.previewOwnMessage",
                mention: MessageMention(label: Self.label(Self.otherName), userId: Self.otherId, isOwn: false),
                sender: myId, senderName: myName, avatarUrl: session.avatarUrl, isOwn: true,
                timestamp: now.addingTimeInterval(-60)))
        }
        .padding(.vertical, WZ.Space.space4)
        .allowsHitTesting(false)
    }

    private static func label(_ name: String) -> String {
        name.hasPrefix("@") ? name : "@" + name
    }

    private func entry(id: String, text: String, mention: MessageMention, sender: String, senderName: String,
                       avatarUrl: String?, isOwn: Bool, timestamp: Date) -> ChatEntry {
        var entry = ChatEntry(
            id: id, kind: .message(body: L10n.format(text, mention.label), isEmote: false, isNotice: false),
            sender: sender, senderName: senderName, senderAvatarUrl: avatarUrl, isOwn: isOwn,
            timestamp: timestamp, isSending: false, isEdited: false)
        entry.mentions = [mention]
        return entry
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
                ToggleRow(label: "settings.privacy.readReceipts",
                          note: "settings.privacy.readReceiptsNote",
                          isOn: $prefs.sendReadReceipts)
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
                BlockInvitesToggle()
            }
        }
    }
}

/// "Block all invites" (MSC4380), shown only when the homeserver has the setting
private struct BlockInvitesToggle: View {
    @EnvironmentObject private var session: MatrixSession
    @State private var eventType: String?
    @State private var blocked = false

    var body: some View {
        Group {
            if let eventType {
                SettingsDivider()
                ToggleRow(label: "settings.privacy.blockInvites",
                          note: "settings.privacy.blockInvitesNote",
                          isOn: Binding(get: { blocked }, set: { next in
                              blocked = next
                              Task { await save(next, eventType: eventType) }
                          }))
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard let client = session.client,
              let type = (try? await client.serverFeatures()).flatMap({
                  InviteBlocking.eventType(unstableFeatures: $0.unstableFeatures)
              }) else { return }
        blocked = InviteBlocking.isBlocked((try? await client.accountData(eventType: type)) ?? nil)
        eventType = type
    }

    private func save(_ next: Bool, eventType: String) async {
        guard let client = session.client else { return }
        let before = blocked
        do {
            try await client.setAccountData(eventType: eventType, content: InviteBlocking.content(blocked: next))
        } catch {
            blocked = before
            CopyToast.shared.show(L10n.format("settings.privacy.blockInvitesFailed", error.localizedDescription))
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
                StatusText(text: String(localized: "settings.language.restartHint"), isError: false)
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
        SettingsPage(title: "developer.title") {
            SettingsSection {
                ToggleRow(label: "developer.enable",
                          note: "developer.enableDescription",
                          isOn: $prefs.developerMode)
            }
            if prefs.developerMode {
                SettingsSection {
                    DisclosureGroup(isExpanded: $tokenExpanded) {
                        VStack(alignment: .leading, spacing: WZ.Space.space4) {
                            Label(String(localized: "developer.accessTokenWarning"),
                                  image: "ph-warning-regular")
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.warningColor)
                            CopyRow(label: "developer.accessToken", value: session.client?.session.accessToken ?? "", secret: true)
                        }
                        .padding(.top, WZ.Space.space4)
                    } label: {
                        Text(String(localized: "developer.accessToken"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                    }
                    SettingsDivider()
                    CopyRow(label: "developer.homeserverUrl", value: session.client?.session.homeserverUrl ?? "")
                    if let deviceId = session.deviceId {
                        SettingsDivider()
                        CopyRow(label: "settings.sessions.deviceId", value: deviceId)
                    }
                }
                SettingsSection {
                    NavigationLink {
                        AccountDataExplorer()
                    } label: {
                        Text(String(localized: "developer.accountData.title"))
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
                Text(String(localized: "auth.tagline"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                Text(version)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, WZ.Space.space4)
            .listRowSeparator(.hidden)

            Link(destination: URL(string: "https://github.com/kapsikkum/mudrix/releases/latest")!) {
                Label(String(localized: "settings.downloadMudrixForDesktop"), image: "ph-download-simple-regular")
            }
            .buttonStyle(SecondaryButtonStyle())
            .listRowSeparator(.hidden)

            Link(destination: URL(string: "https://github.com/kapsikkum/mudrix")!) {
                Label(String(localized: "settings.about.viewSourceOnGitHub"), image: "ph-code-regular")
            }
            .buttonStyle(SecondaryButtonStyle())
            .listRowSeparator(.hidden)

            SettingsSection(title: "settings.about.credits") {
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    credit("matrix-rust-sdk", url: "https://github.com/matrix-org/matrix-rust-sdk",
                           text: String(localized: "settings.about.creditMatrix"))
                    credit("Roboto", url: "https://fonts.google.com/specimen/Roboto",
                           text: String(localized: "settings.about.creditRoboto"))
                }
            }

            HStack(spacing: WZ.Space.space7) {
                if let entry = WhatsNew.latest() {
                    Button { showWhatsNew = true } label: {
                        Label(String(localized: "whatsNew.title"), image: "ph-sparkle-regular")
                    }
                    .sheet(isPresented: $showWhatsNew) { WhatsNewSheet(entry: entry) }
                }
                Link(destination: URL(string: "https://github.com/kapsikkum/mudrix")!) {
                    Label(String(localized: "settings.about.privacyPolicy"), image: "ph-shield-check-regular")
                }
            }
            .labelStyle(FooterLinkLabelStyle())
            .buttonStyle(.borderless)
            .font(.wizard(WZ.FontSize.sm))
            .foregroundStyle(theme.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, WZ.Space.space7)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private struct FooterLinkLabelStyle: LabelStyle {
        func makeBody(configuration: Configuration) -> some View {
            HStack(spacing: WZ.Space.space3) {
                configuration.icon
                configuration.title
            }
        }
    }

    private func credit(_ name: String, url: String, text: String) -> some View {
        (Text(.init("[\(name)](\(url))")).foregroundColor(theme.accent)
         + Text(" ") + Text(LocalizedStringKey(text)).foregroundColor(theme.textMuted))
            .font(.wizard(WZ.FontSize.sm))
    }
}
