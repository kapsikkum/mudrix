import SwiftUI
import WizardChatCore

// Building blocks of Settings > Integrations: texts, capability descriptions, the host list and the install / trust sheets.
// Port of the dialogs in `IntegrationsSettings.kt` on Android. Everything here is device-only data.

enum IntegrationText {
    static func t(_ key: String) -> String {
        NSLocalizedString(key, comment: "")
    }

    static func capabilityTitle(_ capability: IntegrationPerms.Capability) -> String {
        t("settings.integrations.cap.\(capability.rawValue).title")
    }

    static func shortFingerprint(_ fingerprint: String) -> String {
        fingerprint.split(separator: " ").prefix(4).joined(separator: " ")
    }

    static func rejected(_ r: RejectedIntegration) -> String {
        if r.reason == RejectedIntegration.unsupported { return L10n.format("settings.integrations.rejected.unsupported", r.error) }
        return L10n.format("settings.integrations.rejected.invalid", r.error)
    }

    static func rejectedName(_ r: RejectedIntegration) -> String {
        r.name ?? r.id ?? t("settings.integrations.rejected.unnamed")
    }

    /// Errors about signatures and keys are security failures; the rest (network, parsing) are not
    static func isSecurityError(_ error: String, keyChanged: Bool) -> Bool {
        if keyChanged { return true }
        if error.lowercased().hasPrefix("could not load") { return false }
        return error.range(of: "signature|signed|signing key|older than|cannot check|cannot be trusted|cannot compute the key",
                           options: [.regularExpression, .caseInsensitive]) != nil
    }

    static func capabilities(of permissions: IntegrationPerms) -> [IntegrationPerms.Capability] {
        IntegrationPerms.Capability.allCases.filter { permissions.has($0) }
    }
}

extension IntegrationPerms {
    /// The same permissions with the capabilities named in `denied` (raw values) removed
    func without(_ denied: Set<String>) -> IntegrationPerms {
        var p = self
        if denied.contains(Capability.linkCards.rawValue) { p.linkCards = nil }
        if denied.contains(Capability.linkDetails.rawValue) { p.linkDetails = nil }
        if denied.contains(Capability.composerActions.rawValue) { p.composerActions = nil }
        if denied.contains(Capability.commands.rawValue) { p.commands = nil }
        if denied.contains(Capability.api.rawValue) { p.api = nil }
        return p
    }
}

/// A fixed-width line of text: addresses, request lines and the text an action inserts
struct IntegrationCodeText: View {
    let text: String
    @Environment(\.theme) private var theme

    var body: some View {
        Text(verbatim: text)
            .font(.system(size: WZ.SizeIcon.sm, design: .monospaced))
            .foregroundStyle(theme.textPrimary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct IntegrationMuted: View {
    let text: String
    @Environment(\.theme) private var theme

    var body: some View {
        Text(verbatim: text)
            .font(.wizard(WZ.FontSize.sm))
            .foregroundStyle(theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct IntegrationHeading: View {
    let text: String
    var color: Color?
    @Environment(\.theme) private var theme

    var body: some View {
        Text(verbatim: text)
            .font(.wizard(WZ.FontSize.md, .semibold))
            .foregroundStyle(color ?? theme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct IntegrationIconTile: View {
    let name: String
    @Environment(\.theme) private var theme

    var body: some View {
        let letter = String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()
        ZStack {
            RoundedRectangle(cornerRadius: 8).fill(theme.textMuted.opacity(0.15))
            Text(verbatim: letter.isEmpty ? "?" : letter)
                .font(.wizard(WZ.FontSize.lg, .semibold))
                .foregroundStyle(theme.textMuted)
        }
        .frame(width: WZ.SizeAvatar.md, height: WZ.SizeAvatar.md)
    }
}

/// Who published an integration. `full` shows the whole fingerprint, for the consent sheet.
struct IntegrationSourceNote: View {
    let repo: String
    let official: Bool
    let fingerprint: String?
    var full = false

    var body: some View {
        if official {
            IntegrationMuted(text: L10n.format("settings.integrations.fromOfficial", repo))
        } else if let fingerprint {
            if full {
                IntegrationMuted(text: L10n.format("settings.integrations.fromPublisherFull", repo))
                IntegrationCodeText(text: fingerprint)
            } else {
                IntegrationMuted(text: L10n.format("settings.integrations.fromPublisher", repo, IntegrationText.shortFingerprint(fingerprint)))
            }
        }
    }
}

/// Plain-language description of one capability of a permission set
struct IntegrationCapabilityDetail: View {
    let capability: IntegrationPerms.Capability
    let permissions: IntegrationPerms

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            IntegrationHeading(text: IntegrationText.capabilityTitle(capability))
            switch capability {
            case .linkCards: linkCards
            case .linkDetails: linkDetails
            case .composerActions: composerActions
            case .commands: commands
            case .api: api
            }
        }
    }

    @ViewBuilder private var linkCards: some View {
        ForEach(Array((permissions.linkCards ?? []).enumerated()), id: \.offset) { _, rule in
            IntegrationMuted(text: Self.ruleText(rule))
        }
    }

    private static func ruleText(_ rule: LinkCardRule) -> String {
        var parts = [L10n.format("settings.integrations.cap.linkCards.rule", rule.hosts.joined(separator: ", "), rule.title)]
        if let prefix = rule.pathPrefix { parts.append(L10n.format("settings.integrations.cap.linkCards.path", prefix)) }
        if let pattern = rule.pathPattern { parts.append(L10n.format("settings.integrations.cap.linkCards.pattern", pattern)) }
        if let exclude = rule.pathExclude, !exclude.isEmpty {
            parts.append(L10n.format("settings.integrations.cap.linkCards.exclude", exclude.joined(separator: ", ")))
        }
        return parts.joined(separator: " ")
    }

    @ViewBuilder private var linkDetails: some View {
        if let details = permissions.linkDetails {
            IntegrationMuted(text: L10n.format("settings.integrations.cap.linkDetails.summary", details.host))
            ForEach(Array(details.lookups.enumerated()), id: \.offset) { _, lookup in
                IntegrationCodeText(text: "GET \(details.host)\(lookup.path)")
                IntegrationMuted(text: L10n.format("settings.integrations.cap.linkDetails.shows", Self.shown(lookup).joined(separator: ", ")))
            }
        }
    }

    private static func shown(_ lookup: LinkLookup) -> [String] {
        var out: [String] = []
        if lookup.title != nil { out.append(IntegrationText.t("settings.integrations.cap.linkDetails.shownTitle")) }
        if lookup.description != nil { out.append(IntegrationText.t("settings.integrations.cap.linkDetails.shownDescription")) }
        out.append(contentsOf: (lookup.facts ?? []).map { $0.label })
        return out
    }

    @ViewBuilder private var composerActions: some View {
        ForEach(Array((permissions.composerActions ?? []).enumerated()), id: \.offset) { _, action in
            IntegrationMuted(text: "\(action.label): \(IntegrationText.t("settings.integrations.cap.composerActions.inserts"))")
            IntegrationCodeText(text: action.insert)
        }
    }

    @ViewBuilder private var commands: some View {
        ForEach(Array((permissions.commands ?? []).enumerated()), id: \.offset) { _, cmd in
            IntegrationCodeText(text: cmd.usage ?? "/\(cmd.name)")
            IntegrationMuted(text: cmd.description)
            if let apiId = cmd.api {
                let label = permissions.api?.actions.first(where: { $0.id == apiId })?.label ?? apiId
                IntegrationMuted(text: L10n.format("settings.integrations.cap.commands.runsApi", label))
            } else {
                IntegrationMuted(text: IntegrationText.t("settings.integrations.cap.commands.inserts"))
                IntegrationCodeText(text: cmd.insert ?? "")
            }
        }
    }

    @ViewBuilder private var api: some View {
        if let api = permissions.api {
            IntegrationMuted(text: L10n.format("settings.integrations.cap.api.summary", api.host, api.actions.map { $0.label }.joined(separator: ", ")))
            ForEach(Array(api.actions.enumerated()), id: \.offset) { _, action in
                IntegrationCodeText(text: "\(action.label): POST \(api.host)\(action.path)")
                IntegrationMuted(text: Self.sendsText(action))
                if let body = action.body { IntegrationCodeText(text: Self.bodyText(body)) }
            }
        }
    }

    private static func sendsText(_ action: ApiAction) -> String {
        var text = action.body != nil
            ? IntegrationText.t("settings.integrations.cap.api.sends")
            : IntegrationText.t("settings.integrations.cap.api.sendsNothing")
        if action.insertResultLink != nil { text += " " + IntegrationText.t("settings.integrations.cap.api.link") }
        return text
    }

    private static func bodyText(_ body: [String: String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return "" }
        return text
    }
}

/// The servers an integration may contact, shown before it is installed or updated: every other address is refused
struct IntegrationHostList: View {
    let permissions: IntegrationPerms

    var body: some View {
        let hosts = IntegrationPermissions.contactedHosts(permissions)
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            IntegrationHeading(text: IntegrationText.t("settings.integrations.hosts.title"))
            if hosts.isEmpty {
                IntegrationMuted(text: IntegrationText.t("settings.integrations.hosts.none"))
            } else {
                ForEach(hosts, id: \.self) { IntegrationCodeText(text: $0) }
                IntegrationMuted(text: IntegrationText.t("settings.integrations.hosts.note"))
            }
        }
    }
}

/// The settings an integration offers, by name, for the install and update views
struct IntegrationSettingNames: View {
    let settings: [IntegrationSetting]?

    var body: some View {
        if let settings, !settings.isEmpty {
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                IntegrationHeading(text: IntegrationText.t("settings.integrations.settings.offered"))
                IntegrationMuted(text: settings.map { $0.label }.joined(separator: ", "))
            }
        }
    }
}

/// One capability the person can switch on or off while approving
struct IntegrationCapabilityChoice: View {
    let capability: IntegrationPerms.Capability
    let permissions: IntegrationPerms
    @Binding var denied: Set<String>
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            Toggle(isOn: Binding(
                get: { !denied.contains(capability.rawValue) },
                set: { on in
                    if on { denied.remove(capability.rawValue) } else { denied.insert(capability.rawValue) }
                }
            )) {
                Text(verbatim: L10n.format("settings.integrations.allowCap", IntegrationText.capabilityTitle(capability)))
                    .font(.wizard(WZ.FontSize.lg))
                    .foregroundStyle(theme.textPrimary)
            }
            .tint(theme.accent)
            IntegrationCapabilityDetail(capability: capability, permissions: permissions)
        }
    }
}

/// Install consent: what it asks for, a switch per capability, the servers it may contact. Installs only what is switched on.
struct IntegrationConsentSheet: View {
    let integration: Integration
    let repo: RepositoryRecord
    let onClose: () -> Void
    @ObservedObject private var store = IntegrationStore.shared
    @Environment(\.theme) private var theme
    @State private var denied: Set<String> = []
    @State private var error: String?

    var body: some View {
        let approved = integration.permissions.without(denied)
        NavigationStack {
            Form {
                Section {
                    IntegrationMuted(text: integration.description)
                    IntegrationSourceNote(repo: repo.name, official: repo.official, fingerprint: repo.fingerprint, full: true)
                    Text(verbatim: IntegrationText.t("settings.integrations.consent.intro"))
                        .font(.wizard(WZ.FontSize.md))
                        .foregroundStyle(theme.textPrimary)
                }
                .listRowBackground(theme.groupedRow)
                Section {
                    ForEach(IntegrationText.capabilities(of: integration.permissions), id: \.self) { capability in
                        IntegrationCapabilityChoice(capability: capability, permissions: integration.permissions, denied: $denied)
                    }
                }
                .listRowBackground(theme.groupedRow)
                Section {
                    IntegrationHostList(permissions: approved)
                    IntegrationSettingNames(settings: integration.settings)
                    IntegrationMuted(text: IntegrationText.t(Self.safetyKey(integration.permissions)))
                    if let error {
                        Text(verbatim: error)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.error)
                    }
                }
                .listRowBackground(theme.groupedRow)
            }
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
            .navigationTitle(L10n.format("settings.integrations.consent.title", integration.name))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { onClose() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(IntegrationText.t("settings.integrations.install")) { install(approved) }
                        .fontWeight(.semibold)
                }
            }
        }
        .tint(theme.control)
    }

    private static func safetyKey(_ permissions: IntegrationPerms) -> String {
        if permissions.api != nil { return "settings.integrations.consent.safetyApi" }
        if permissions.linkDetails != nil { return "settings.integrations.consent.safetyDetails" }
        return "settings.integrations.consent.safety"
    }

    private func install(_ approved: IntegrationPerms) {
        switch store.install(integration, repoUrl: repo.url, approved: approved) {
        case .ok: onClose()
        case .error(let message): error = message
        }
    }
}

/// Step 2 of adding a repository: the person sees who signed it and accepts the key, which is then pinned
struct IntegrationTrustSheet: View {
    let preview: RepositoryPreview
    let onClose: () -> Void
    @ObservedObject private var store = IntegrationStore.shared
    @Environment(\.theme) private var theme
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(verbatim: preview.name)
                        .font(.wizard(WZ.FontSize.lg, .semibold))
                        .foregroundStyle(theme.textPrimary)
                    IntegrationCodeText(text: preview.url)
                    IntegrationMuted(text: L10n.format("settings.integrations.release", "\(preview.serial)"))
                    if preview.official {
                        IntegrationHeading(text: IntegrationText.t("settings.integrations.official"), color: theme.success)
                    }
                }
                .listRowBackground(theme.groupedRow)
                if !preview.integrations.isEmpty {
                    Section {
                        IntegrationHeading(text: L10n.plural("settings.integrations.trust.lists", count: preview.integrations.count, preview.integrations.count))
                        ForEach(Array(preview.integrations.enumerated()), id: \.offset) { _, item in
                            IntegrationMuted(text: "\(item.name) \(item.version)")
                        }
                    }
                    .listRowBackground(theme.groupedRow)
                }
                if !preview.rejected.isEmpty {
                    Section {
                        IntegrationHeading(text: L10n.plural("settings.integrations.trust.rejected", count: preview.rejected.count, preview.rejected.count))
                        ForEach(Array(preview.rejected.enumerated()), id: \.offset) { _, item in
                            IntegrationMuted(text: "\(IntegrationText.rejectedName(item)): \(IntegrationText.rejected(item))")
                        }
                    }
                    .listRowBackground(theme.groupedRow)
                }
                Section {
                    IntegrationHeading(text: IntegrationText.t("settings.integrations.trust.fingerprint"))
                    IntegrationCodeText(text: preview.fingerprint)
                    IntegrationMuted(text: IntegrationText.t("settings.integrations.trust.explain"))
                    if let error {
                        Text(verbatim: error)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.error)
                    }
                }
                .listRowBackground(theme.groupedRow)
            }
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
            .navigationTitle(IntegrationText.t("settings.integrations.trust.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { onClose() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(IntegrationText.t("settings.integrations.trust.confirm")) { trust() }
                        .fontWeight(.semibold)
                }
            }
        }
        .tint(theme.control)
    }

    private func trust() {
        switch store.confirmRepository(preview) {
        case .ok: onClose()
        case .error(let message): error = message
        }
    }
}
