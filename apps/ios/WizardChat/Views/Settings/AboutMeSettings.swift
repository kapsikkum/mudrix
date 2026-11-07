import SwiftUI
import WizardChatCore

/// Settings > Account > About Me: bio, pronouns, timezone and accent colour of the extended profile
struct AboutMeSection: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    @State private var supported = true
    @State private var loaded = false
    @State private var saved = ExtendedProfile()
    @State private var bio = ""
    @State private var pronouns = ""
    @State private var timezone = ""
    @State private var accent = ""
    @State private var busy = false

    private var deviceZone: String { TimeZone.current.identifier }

    private var parsedPronouns: [String] { ProfileFields.parsePronounInput(pronouns) }
    private var accentNormalised: String? { ProfileFields.normalizeHex(accent) }
    private var accentInvalid: Bool { !accent.trimmingCharacters(in: .whitespaces).isEmpty && accentNormalised == nil }

    private var dirty: Bool {
        loaded && (ProfileFields.sanitizeBio(bio) != saved.bio
            || parsedPronouns != saved.pronouns
            || (timezone.isEmpty ? nil : timezone) != saved.timezone
            || accentNormalised != saved.accent)
    }

    private var zoneOptions: [(String, LocalizedStringKey)] {
        var zones = TimeZone.knownTimeZoneIdentifiers
            .filter { $0.contains("/") && !$0.hasPrefix("Etc/") && !$0.hasPrefix("SystemV/") }
            .sorted()
        zones.append("UTC")
        if let current = saved.timezone, !zones.contains(current) { zones.insert(current, at: 0) }
        if !zones.contains(deviceZone) { zones.insert(deviceZone, at: 0) }
        var options: [(String, LocalizedStringKey)] = [("", "settings.account.timezoneUnset")]
        for zone in zones {
            let label = zone.replacingOccurrences(of: "_", with: " ")
            options.append((zone, LocalizedStringKey(zone == deviceZone ? L10n.format("settings.account.timezoneBrowser", label) : label)))
        }
        return options
    }

    var body: some View {
        SettingsSection(title: "settings.account.aboutTitle",
                        note: supported ? nil : "settings.account.extendedProfileUnsupported") {
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                label("settings.account.bio")
                TextField("", text: $bio,
                          prompt: Text(String(localized: "settings.account.bioPlaceholder")).foregroundColor(theme.textMuted),
                          axis: .vertical)
                    .lineLimit(3...10)
                    .wizardField()
                    .onChange(of: bio) { _, value in
                        if value.count > ProfileFields.maxBioChars { bio = String(value.prefix(ProfileFields.maxBioChars)) }
                    }
                hint(L10n.format("settings.account.bioHintTouch", "\(ProfileFields.maxBioChars)", "\(ProfileFields.maxBioLines)"))
            }
            .disabled(!supported)

            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                label("settings.account.pronouns")
                TextField("", text: $pronouns,
                          prompt: Text(String(localized: "settings.account.pronounsPlaceholder")).foregroundColor(theme.textMuted))
                    .textInputAutocapitalization(.never)
                    .wizardField()
                hint(L10n.format("settings.account.pronounsHint", ProfileFields.maxPronounEntries, "\(ProfileFields.maxPronounChars)"))
            }
            .disabled(!supported)

            PickerRow(label: "settings.account.timezone", note: "settings.account.timezoneHint",
                      selection: $timezone, options: zoneOptions)
                .disabled(!supported)

            accentPicker.disabled(!supported)

            Button(String(localized: "common.save")) { Task { await save() } }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!supported || !dirty || busy || accentInvalid)
        }
        .task { await load() }
    }

    private var accentPicker: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            label("profile.accent.title")
            HStack(spacing: WZ.Space.space4) {
                ForEach(ProfileFields.accentPresets, id: \.self) { hex in
                    Button { accent = hex } label: {
                        Circle()
                            .fill(Color(hex: hex))
                            .frame(width: 28, height: 28)
                            .overlay(Circle().strokeBorder(theme.textPrimary, lineWidth: accentNormalised == hex ? 3 : 0))
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(hex)
                }
            }
            HStack(spacing: WZ.Space.space4) {
                TextField("", text: $accent, prompt: Text(String(localized: "profile.accent.hex")).foregroundColor(theme.textMuted))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .wizardField()
                    .onChange(of: accent) { _, value in
                        if value.count > 7 { accent = String(value.prefix(7)) }
                    }
                if !accent.isEmpty {
                    Button(String(localized: "profile.accent.reset")) { accent = "" }
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .buttonStyle(.borderless)
                }
            }
            if accentInvalid {
                Text(String(localized: "profile.accent.invalid")).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
            } else {
                hint(String(localized: "profile.accent.hint"))
            }
        }
    }

    private func label(_ key: LocalizedStringKey) -> some View {
        Text(key).font(.wizard(WZ.FontSize.sm, .semibold)).foregroundStyle(theme.textMuted)
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
    }

    private func load() async {
        guard let client = session.client else { return }
        supported = ((try? await client.supportsExtendedProfiles()) ?? true)
        var profile = ExtendedProfile()
        if let userId = client.userId, let fields = try? await client.profileFields(userId: userId) {
            profile = ProfileFields.parse(fields)
        }
        saved = profile
        bio = profile.bio
        pronouns = profile.pronouns.joined(separator: ", ")
        timezone = profile.timezone ?? ""
        accent = profile.accent ?? ""
        loaded = true
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let cleanBio = ProfileFields.sanitizeBio(bio)
            let pronounList = parsedPronouns
            let normalAccent = accentNormalised
            try await session.writeProfileField(ProfileFields.bioKeys, cleanBio.isEmpty ? nil : ProfileFields.bioValue(cleanBio))
            try await session.writeProfileField(ProfileFields.pronounKeys, pronounList.isEmpty ? nil : ProfileFields.pronounsValue(pronounList))
            try await session.writeProfileField([ProfileFields.tz], timezone.isEmpty ? nil : JSONValue.string(timezone))
            try await session.writeProfileField(ProfileFields.accentKeys, normalAccent.map { JSONValue.string($0) })
            saved.bio = cleanBio
            saved.pronouns = pronounList
            saved.timezone = timezone.isEmpty ? nil : timezone
            saved.accent = normalAccent
            bio = cleanBio
            CopyToast.shared.show(String(localized: "settings.account.profileSaved"))
        } catch {
            CopyToast.shared.show(L10n.format("common.saveFailed", error.localizedDescription))
        }
    }
}
