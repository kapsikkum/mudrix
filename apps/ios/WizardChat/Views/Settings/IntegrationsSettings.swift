import SwiftUI
import WizardChatCore

/// Settings > Integrations: repositories, install and update approval, and what each installed integration may do.
/// Everything is device-only; nothing here is synced.
struct IntegrationsSettings: View {
    @ObservedObject private var store = IntegrationStore.shared
    @Environment(\.theme) private var theme

    @State private var url = ""
    @State private var adding = false
    @State private var addError: String?
    @State private var refreshing: String?
    @State private var preview: RepositoryPreview?
    @State private var consent: ConsentTarget?
    @State private var removing: RepositoryRecord?

    private struct ConsentTarget {
        let integration: Integration
        let repo: RepositoryRecord
    }

    private func repoName(_ repoUrl: String) -> String {
        store.repositories.first(where: { $0.url == repoUrl })?.name ?? IntegrationText.t("settings.integrations.unknownSource")
    }

    var body: some View {
        SettingsPage(title: "settings.integrations.title") {
            Section {
                Text(verbatim: IntegrationText.t("settings.integrations.intro"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            installedSections
            availableSection
            repositoriesSection
        }
        .sheet(isPresented: Binding(get: { consent != nil }, set: { if !$0 { consent = nil } })) {
            if let target = consent {
                IntegrationConsentSheet(integration: target.integration, repo: target.repo, onClose: { consent = nil })
            }
        }
        .sheet(isPresented: Binding(get: { preview != nil }, set: { if !$0 { preview = nil } })) {
            if let current = preview {
                IntegrationTrustSheet(preview: current, onClose: {
                    preview = nil
                    url = ""
                })
            }
        }
        .confirmationDialog(removing?.name ?? "", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                            titleVisibility: .visible, presenting: removing) { repo in
            Button(IntegrationText.t("settings.integrations.remove"), role: .destructive) { store.removeRepository(repo.url) }
        }
    }

    // MARK: Installed

    @ViewBuilder private var installedSections: some View {
        if store.installed.isEmpty {
            SettingsSection(title: "settings.integrations.installed") {
                IntegrationMuted(text: IntegrationText.t("settings.integrations.installedEmpty"))
            }
        } else {
            ForEach(Array(store.installed.enumerated()), id: \.element.id) { index, item in
                IntegrationInstalledSection(item: item, repoName: repoName(item.repoUrl), showTitle: index == 0)
            }
        }
    }

    // MARK: Available

    private var offers: [(integration: Integration, repo: RepositoryRecord)] {
        let installedIds = Set(store.installed.map { $0.id })
        return store.repositories.flatMap { repo in
            repo.integrations.filter { !installedIds.contains($0.id) }.map { (integration: $0, repo: repo) }
        }
    }

    private var unusable: [(entry: RejectedIntegration, repo: RepositoryRecord)] {
        store.repositories.flatMap { repo in
            (repo.rejected ?? [])
                .filter { r in !store.installed.contains(where: { $0.id == r.id }) }
                .map { (entry: $0, repo: repo) }
        }
    }

    private var availableSection: some View {
        SettingsSection(title: "settings.integrations.available") {
            let list = offers
            let blocked = unusable
            if list.isEmpty && blocked.isEmpty {
                IntegrationMuted(text: IntegrationText.t("settings.integrations.availableEmpty"))
            }
            ForEach(Array(list.enumerated()), id: \.offset) { _, offer in
                VStack(alignment: .leading, spacing: WZ.Space.space3) {
                    HStack(spacing: WZ.Space.space4) {
                        IntegrationIconTile(name: offer.integration.name)
                        VStack(alignment: .leading, spacing: WZ.Space.space1) {
                            Text(verbatim: offer.integration.name)
                                .font(.wizard(WZ.FontSize.lg, .semibold))
                                .foregroundStyle(theme.textPrimary)
                            IntegrationMuted(text: L10n.format("settings.integrations.versionSource", offer.integration.version, offer.repo.name))
                        }
                    }
                    IntegrationMuted(text: offer.integration.description)
                    Button {
                        consent = ConsentTarget(integration: offer.integration, repo: offer.repo)
                    } label: {
                        Label {
                            Text(verbatim: IntegrationText.t("settings.integrations.install"))
                        } icon: {
                            Image("ph-plus-regular")
                        }
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(theme.accent)
                }
            }
            // Entries this app can not use are listed, with the reason, and can never be installed
            ForEach(Array(blocked.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(verbatim: IntegrationText.rejectedName(item.entry))
                        .font(.wizard(WZ.FontSize.lg, .semibold))
                        .foregroundStyle(theme.textMuted)
                    IntegrationMuted(text: IntegrationText.rejected(item.entry))
                    IntegrationMuted(text: L10n.format("settings.integrations.rejected.source", item.repo.name))
                }
            }
        }
    }

    // MARK: Repositories

    private var repositoriesSection: some View {
        SettingsSection(title: "settings.integrations.repositories", note: "settings.integrations.repositoriesNote") {
            ForEach(store.repositories, id: \.url) { repo in
                repositoryRow(repo)
            }
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                TextField(IntegrationText.t("settings.integrations.repoUrl"), text: $url)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .onSubmit { add(url) }
                    .onChange(of: url) { _, _ in addError = nil }
                Button {
                    add(url)
                } label: {
                    Label {
                        Text(verbatim: IntegrationText.t("settings.integrations.add"))
                    } icon: {
                        Image("ph-plus-regular")
                    }
                }
                .buttonStyle(.borderless)
                .foregroundStyle(theme.accent)
                .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty || adding)
                if let addError {
                    Text(verbatim: addError)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.error)
                }
            }
            if !store.repositories.contains(where: { $0.official }) {
                Button {
                    url = IntegrationSignature.officialRepoURL
                    add(IntegrationSignature.officialRepoURL)
                } label: {
                    VStack(alignment: .leading, spacing: WZ.Space.space1) {
                        Label {
                            Text(verbatim: IntegrationText.t("settings.integrations.add") + " · " + IntegrationText.t("settings.integrations.official"))
                        } icon: {
                            Image("ph-plus-regular")
                        }
                        IntegrationCodeText(text: IntegrationSignature.officialRepoURL)
                    }
                }
                .buttonStyle(.borderless)
                .foregroundStyle(theme.accent)
                .disabled(adding)
            }
        }
    }

    private func repositoryRow(_ repo: RepositoryRecord) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            Text(verbatim: repo.name)
                .font(.wizard(WZ.FontSize.lg, .semibold))
                .foregroundStyle(theme.textPrimary)
            IntegrationCodeText(text: repo.url)
            IntegrationMuted(text: L10n.plural("settings.integrations.integrationCount", count: repo.integrations.count, repo.integrations.count)
                + " · " + L10n.format("settings.integrations.release", "\(repo.serial)"))
            if repo.official {
                IntegrationHeading(text: IntegrationText.t("settings.integrations.official"), color: theme.success)
            } else {
                IntegrationMuted(text: IntegrationText.t("settings.integrations.publisherKey") + ": " + IntegrationText.shortFingerprint(repo.fingerprint) + "…")
            }
            if repo.keyChanged {
                IntegrationHeading(text: IntegrationText.t("settings.integrations.keyChanged.title"), color: theme.error)
                IntegrationMuted(text: IntegrationText.t("settings.integrations.keyChanged.body"))
            } else if let error = repo.error {
                let key = IntegrationText.isSecurityError(error, keyChanged: false) ? "settings.integrations.securityError" : "settings.integrations.fetchError"
                Text(verbatim: L10n.format(key, error))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: WZ.Space.space6) {
                Button {
                    refresh(repo.url)
                } label: {
                    Text(verbatim: IntegrationText.t("settings.integrations.refresh"))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(theme.accent)
                .disabled(refreshing == repo.url)
                Button(role: .destructive) {
                    removing = repo
                } label: {
                    Label {
                        Text(verbatim: IntegrationText.t("settings.integrations.remove"))
                    } icon: {
                        Image("ph-trash-regular")
                    }
                }
                .buttonStyle(.borderless)
                .foregroundStyle(theme.danger)
            }
        }
    }

    private func add(_ input: String) {
        if adding { return }
        adding = true
        addError = nil
        Task {
            let result = await store.previewRepository(input)
            switch result {
            case .error(let message):
                addError = message
            case .ok(let found):
                if found.alreadyAdded {
                    addError = IntegrationText.t("settings.integrations.alreadyAdded")
                } else {
                    preview = found
                }
            }
            adding = false
        }
    }

    private func refresh(_ repoUrl: String) {
        refreshing = repoUrl
        Task {
            _ = await store.refreshRepository(repoUrl)
            refreshing = nil
        }
    }
}

/// One installed integration: enable switch, update approval, capability switches, its own settings and uninstall
struct IntegrationInstalledSection: View {
    let item: InstalledIntegration
    let repoName: String
    var showTitle = false
    @ObservedObject private var store = IntegrationStore.shared
    @Environment(\.theme) private var theme
    @State private var showSettings = false
    @State private var confirmUninstall = false
    @State private var denied: Set<String> = []

    var body: some View {
        SettingsSection(title: showTitle ? LocalizedStringKey("settings.integrations.installed") : nil) {
            header
            Toggle(isOn: Binding(get: { item.enabled }, set: { store.setEnabled(item.id, $0) })) {
                Text(verbatim: IntegrationText.t("settings.integrations.enabled"))
                    .font(.wizard(WZ.FontSize.lg))
                    .foregroundStyle(theme.textPrimary)
            }
            .tint(theme.accent)
            if let update = item.pendingUpdate { updateBlock(update) }
            capabilityRows
            if let defs = item.settings, !defs.isEmpty {
                Button {
                    showSettings.toggle()
                } label: {
                    HStack {
                        Text(verbatim: IntegrationText.t("settings.integrations.settings.title"))
                            .font(.wizard(WZ.FontSize.lg))
                            .foregroundStyle(theme.textPrimary)
                        Spacer(minLength: 8)
                        Image(systemName: showSettings ? "chevron.up" : "chevron.down")
                            .foregroundStyle(theme.textMuted)
                    }
                }
                .buttonStyle(.plain)
                if showSettings { IntegrationSettingValues(item: item, defs: defs) }
            }
            Button(role: .destructive) {
                confirmUninstall = true
            } label: {
                Label {
                    Text(verbatim: IntegrationText.t("settings.integrations.uninstall"))
                } icon: {
                    Image("ph-trash-regular")
                }
            }
            .foregroundStyle(theme.danger)
        }
        .confirmationDialog(item.name, isPresented: $confirmUninstall, titleVisibility: .visible) {
            Button(IntegrationText.t("settings.integrations.uninstall"), role: .destructive) { store.uninstall(item.id) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            HStack(spacing: WZ.Space.space4) {
                IntegrationIconTile(name: item.name)
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(verbatim: item.name)
                        .font(.wizard(WZ.FontSize.lg, .semibold))
                        .foregroundStyle(theme.textPrimary)
                    IntegrationMuted(text: L10n.format("settings.integrations.versionSource", item.version, repoName))
                    IntegrationSourceNote(repo: repoName, official: item.official, fingerprint: item.publisherFingerprint)
                }
            }
            IntegrationMuted(text: item.description)
            if item.sourceGone { IntegrationMuted(text: IntegrationText.t("settings.integrations.sourceGone")) }
            if let blocked = item.blockedUpdate {
                IntegrationMuted(text: IntegrationText.t("settings.integrations.rejected.keepsWorking"))
                IntegrationMuted(text: IntegrationText.rejected(RejectedIntegration(index: 0, error: blocked.error, reason: blocked.reason)))
            }
        }
    }

    private func updateBlock(_ update: PendingUpdate) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            IntegrationHeading(text: L10n.format("settings.integrations.updateAvailableVersion", update.version), color: theme.accent)
            IntegrationMuted(text: IntegrationText.t("settings.integrations.updateRequests"))
            ForEach(IntegrationText.capabilities(of: update.permissions), id: \.self) { capability in
                IntegrationCapabilityChoice(capability: capability, permissions: update.permissions, denied: $denied)
            }
            IntegrationHostList(permissions: update.permissions.without(denied))
            IntegrationSettingNames(settings: update.settings)
            IntegrationMuted(text: IntegrationText.t("settings.integrations.updateOldStays"))
            HStack(spacing: WZ.Space.space6) {
                Button {
                    approve()
                } label: {
                    Label {
                        Text(verbatim: IntegrationText.t("settings.integrations.approveUpdate"))
                    } icon: {
                        Image("ph-check-regular")
                    }
                }
                .buttonStyle(.borderless)
                .foregroundStyle(theme.accent)
                Button {
                    store.dismissUpdate(item.id)
                } label: {
                    Text(verbatim: IntegrationText.t("settings.integrations.dismiss"))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(theme.textMuted)
            }
        }
    }

    /// New permissions take effect; capabilities the person switched off in the approval are then left off
    private func approve() {
        let off = denied
        guard case .ok = store.approveUpdate(item.id) else { return }
        for raw in off {
            if let capability = IntegrationPerms.Capability(rawValue: raw) { store.setGrant(item.id, capability, false) }
        }
        denied = []
    }

    @ViewBuilder private var capabilityRows: some View {
        let capabilities = IntegrationText.capabilities(of: item.permissions)
        if capabilities.isEmpty {
            IntegrationMuted(text: IntegrationText.t("settings.integrations.noPermissions"))
        }
        ForEach(capabilities, id: \.self) { capability in
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                Toggle(isOn: Binding(
                    get: { store.grants[item.id]?[capability.rawValue] == true },
                    set: { store.setGrant(item.id, capability, $0) }
                )) {
                    Text(verbatim: L10n.format("settings.integrations.allowCap", IntegrationText.capabilityTitle(capability)))
                        .font(.wizard(WZ.FontSize.lg))
                        .foregroundStyle(theme.textPrimary)
                }
                .tint(theme.accent)
                IntegrationCapabilityDetail(capability: capability, permissions: item.permissions)
            }
        }
    }
}

/// The integration's own settings. Values stay on this device.
struct IntegrationSettingValues: View {
    let item: InstalledIntegration
    let defs: [IntegrationSetting]
    @ObservedObject private var store = IntegrationStore.shared
    @Environment(\.theme) private var theme

    private func defaultValue(_ def: IntegrationSetting) -> SettingValue {
        switch def.kind {
        case .toggle(let value): return .bool(value)
        case .text(let value, _): return .text(value)
        case .choice(let value, _): return .text(value)
        }
    }

    var body: some View {
        let values = IntegrationSettings.resolve(item.settings, store.settings[item.id])
        ForEach(defs, id: \.id) { def in
            settingRow(def, values)
        }
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            IntegrationMuted(text: IntegrationText.t("settings.integrations.settings.note"))
            Button {
                store.resetSettings(item.id)
            } label: {
                Text(verbatim: IntegrationText.t("settings.integrations.settings.reset"))
            }
            .buttonStyle(.borderless)
            .foregroundStyle(theme.accent)
            .disabled(!defs.contains { values[$0.id] != defaultValue($0) })
        }
    }

    @ViewBuilder private func settingRow(_ def: IntegrationSetting, _ values: SettingValues) -> some View {
        switch def.kind {
        case .toggle:
            Toggle(isOn: Binding(
                get: { values[def.id] == .bool(true) },
                set: { store.setSetting(item.id, def.id, .bool($0)) }
            )) {
                labelBlock(def)
            }
            .tint(theme.accent)
        case .choice(let fallback, let options):
            Picker(selection: Binding(
                get: {
                    if case .text(let current)? = values[def.id] { return current }
                    return fallback
                },
                set: { store.setSetting(item.id, def.id, .string($0)) }
            )) {
                ForEach(options, id: \.value) { option in
                    Text(verbatim: option.label).tag(option.value)
                }
            } label: {
                labelBlock(def)
            }
            .pickerStyle(.menu)
            .tint(theme.textMuted)
        case .text(let fallback, let maxLength):
            IntegrationTextSetting(itemId: item.id, def: def, maxLength: maxLength, value: textValue(values[def.id], fallback))
        }
    }

    private func textValue(_ stored: SettingValue?, _ fallback: String) -> String {
        if case .text(let text)? = stored { return text }
        return fallback
    }

    private func labelBlock(_ def: IntegrationSetting) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space1) {
            Text(verbatim: def.label)
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(theme.textPrimary)
            if let note = def.description {
                IntegrationMuted(text: note)
            }
        }
    }
}

/// A free-text setting: saved when editing ends, only if it is valid
struct IntegrationTextSetting: View {
    let itemId: String
    let def: IntegrationSetting
    let maxLength: Int
    let value: String
    @ObservedObject private var store = IntegrationStore.shared
    @Environment(\.theme) private var theme
    @State private var draft: String
    @FocusState private var focused: Bool

    init(itemId: String, def: IntegrationSetting, maxLength: Int, value: String) {
        self.itemId = itemId
        self.def = def
        self.maxLength = maxLength
        self.value = value
        _draft = State(initialValue: value)
    }

    private var valid: Bool {
        IntegrationSettings.isValid(def, .string(draft))
    }

    private func commit() {
        if valid && draft != value { store.setSetting(itemId, def.id, .string(draft)) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            Text(verbatim: def.label)
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(theme.textPrimary)
            if let note = def.description { IntegrationMuted(text: note) }
            TextField(def.label, text: $draft)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit { commit() }
                .onChange(of: draft) { _, next in
                    if next.count > maxLength { draft = String(next.prefix(maxLength)) }
                }
                .onChange(of: focused) { _, isFocused in
                    if !isFocused { commit() }
                }
                .onChange(of: value) { _, next in draft = next }
            if !valid {
                Text(verbatim: IntegrationText.t("settings.integrations.settings.invalidText"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.error)
            }
        }
    }
}
