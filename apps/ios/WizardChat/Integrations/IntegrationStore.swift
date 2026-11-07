import Foundation
import WizardChatCore

/// What the person approved for a repository they are about to add: shown to them first, nothing stored until they confirm
struct RepositoryPreview {
    var url: String
    var name: String
    var key: String
    var fingerprint: String
    var serial: Int
    var official: Bool
    var integrationCount: Int
    var alreadyAdded: Bool
    /// The verified content, kept so confirming stores exactly what the user was shown
    var integrations: [Integration]
    /// Entries this app can not use; listed, never installable
    var rejected: [RejectedIntegration]
}

enum ActionResult {
    case ok
    case error(String)
}

enum PreviewResult {
    case ok(RepositoryPreview)
    case error(String)
}

/// Repositories, installed integrations, the capabilities the person switched on and their setting values. Everything lives on
/// this device only (its own UserDefaults keys `integrations.*`, like the web app's device-only stores) and is never synced.
/// Failures to read or write must never break the app.
@MainActor
final class IntegrationStore: ObservableObject {
    static let shared = IntegrationStore()

    @Published private(set) var repositories: [RepositoryRecord] = []
    @Published private(set) var installed: [InstalledIntegration] = []
    @Published private(set) var grants: GrantMap = [:]
    /// Per integration id: the setting values as stored (never trusted; see `IntegrationSettings.resolve`)
    @Published private(set) var settings: StoredSettings = [:]

    private static let keyRepositories = "integrations.repositories"
    private static let keyInstalled = "integrations.installed"
    private static let keyGrants = "integrations.grants"
    private static let keySettings = "integrations.settings"

    /// A sanity cap: each repository can hold up to 256 KB of integrations
    static let maxRepositories = 20

    private let defaults: UserDefaults
    private let network: IntegrationNetwork

    init(defaults: UserDefaults = .standard, network: IntegrationNetwork = .shared) {
        self.defaults = defaults
        self.network = network
        repositories = read(Self.keyRepositories) ?? []
        installed = read(Self.keyInstalled) ?? []
        grants = read(Self.keyGrants) ?? [:]
        settings = read(Self.keySettings) ?? [:]
    }

    private func read<T: Decodable>(_ key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func write<T: Encodable>(_ key: String, _ value: T) {
        if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: key) }
    }

    private func saveRepositories(_ list: [RepositoryRecord]) {
        repositories = list
        write(Self.keyRepositories, list)
    }

    private func saveInstalled(_ list: [InstalledIntegration]) {
        installed = list
        write(Self.keyInstalled, list)
    }

    private func saveGrants(_ map: GrantMap) {
        grants = map
        write(Self.keyGrants, map)
    }

    private func saveSettings(_ map: StoredSettings) {
        settings = map
        write(Self.keySettings, map)
    }

    // MARK: Repositories

    /// Step 1 of adding: fetch and verify, store nothing. The UI shows the key fingerprint.
    func previewRepository(_ input: String) async -> PreviewResult {
        guard case .ok(let url) = IntegrationRepository.parseRepoUrl(input) else {
            if case .error(let message) = IntegrationRepository.parseRepoUrl(input) { return .error(message) }
            return .error("Not a valid URL")
        }
        switch await IntegrationRepository.fetch(url, network: network) {
        case .error(let message): return .error(message)
        case .ok(let value, let key, let fingerprint, let serial, let official):
            return .ok(RepositoryPreview(url: url, name: value.name, key: key, fingerprint: fingerprint, serial: serial, official: official,
                                         integrationCount: value.integrations.count, alreadyAdded: repositories.contains { $0.url == url },
                                         integrations: value.integrations, rejected: value.rejected))
        }
    }

    /// Step 2 of adding: the user accepted the fingerprint, so the key is pinned
    func confirmRepository(_ preview: RepositoryPreview, now: Double = Date().timeIntervalSince1970 * 1000) -> ActionResult {
        if repositories.contains(where: { $0.url == preview.url }) { return .error("That repository is already added") }
        if repositories.count >= Self.maxRepositories { return .error("You can add at most \(Self.maxRepositories) repositories. Remove one first.") }
        saveRepositories(repositories + [RepositoryRecord(
            url: preview.url, name: preview.name, addedAt: now, lastFetchedAt: now, integrations: preview.integrations,
            rejected: preview.rejected.isEmpty ? nil : preview.rejected, key: preview.key, fingerprint: preview.fingerprint,
            serial: preview.serial, official: preview.official, trustedAt: now)])
        // A repository that returns after being removed re-adopts integrations installed from it, but only those approved
        // under exactly this key. Anything installed under another key stays cut off.
        saveInstalled(installed.map { i in
            guard i.repoUrl == preview.url, i.publisherFingerprint == preview.fingerprint else { return i }
            var next = i
            next.sourceGone = false
            next.official = preview.official
            return next
        })
        return .ok
    }

    /// Removes the repository only. Installed integrations stay, marked as having lost their source.
    func removeRepository(_ url: String) {
        saveRepositories(repositories.filter { $0.url != url })
        saveInstalled(installed.map { i in
            guard i.repoUrl == url else { return i }
            var next = i
            next.sourceGone = true
            return next
        })
    }

    func refreshRepository(_ url: String, now: Double = Date().timeIntervalSince1970 * 1000) async -> ActionResult {
        guard let current = repositories.first(where: { $0.url == url }) else { return .error("Unknown repository") }
        func refuse(_ error: String, keyChanged: Bool = false) -> ActionResult {
            saveRepositories(repositories.map { r in
                guard r.url == url else { return r }
                var next = r
                next.error = error
                next.keyChanged = r.keyChanged || keyChanged
                return next
            })
            return .error(error)
        }
        let fetched = await IntegrationRepository.fetch(url, network: network)
        guard case .ok(let value, let key, _, let serial, let official) = fetched else {
            if case .error(let message) = fetched { return refuse(message) }
            return refuse("could not load the file")
        }
        // The repository may have been removed, or removed and added again under another key, while the request was in
        // flight; what was fetched was checked against the old pin.
        guard let still = repositories.first(where: { $0.url == url }), still.key == current.key, still.addedAt == current.addedAt else {
            return .error("The repository changed while it was being refreshed")
        }
        if case .failed(let message, let keyChanged) = IntegrationSignature.checkUpdate(previous: (current.key, current.serial), next: (key, serial)) {
            return refuse(message, keyChanged: keyChanged)
        }
        saveRepositories(repositories.map { r in
            guard r.url == url else { return r }
            return RepositoryRecord(url: url, name: value.name, addedAt: r.addedAt, lastFetchedAt: now, integrations: value.integrations,
                                    rejected: value.rejected.isEmpty ? nil : value.rejected, key: r.key, fingerprint: r.fingerprint,
                                    serial: serial, official: official, trustedAt: r.trustedAt)
        })
        saveInstalled(installed.map { i in
            guard i.repoUrl == url, i.publisherFingerprint == current.fingerprint else { return i }
            var next = IntegrationUpdates.reconcile(i, fresh: value.integrations.first { $0.id == i.id },
                                                    rejected: value.rejected.first { $0.id == i.id })
            next.publisherFingerprint = current.fingerprint
            next.official = official
            return next
        })
        return .ok
    }

    // MARK: Integrations

    /// Installs with exactly the permissions the user approved (which may be fewer than offered)
    func install(_ integration: Integration, repoUrl: String, approved: IntegrationPerms, now: Double = Date().timeIntervalSince1970 * 1000) -> ActionResult {
        if IntegrationPermissions.widened(integration.permissions, approved) { return .error("Approved permissions exceed what the integration offers") }
        guard let repo = repositories.first(where: { $0.url == repoUrl }) else { return .error("Unknown repository") }
        // Only an entry that passed validation as part of this repository can be installed
        if !repo.integrations.contains(where: { $0.id == integration.id }) { return .error("This integration is not offered by that repository") }
        if let clash = installed.first(where: { $0.id == integration.id }), clash.repoUrl != repoUrl, !clash.sourceGone {
            return .error("\"\(clash.name)\" with the same id is already installed from another repository. Uninstall it first.")
        }
        let entry = InstalledIntegration(
            id: integration.id, repoUrl: repoUrl, name: integration.name, description: integration.description, version: integration.version,
            permissions: approved, settings: integration.settings, enabled: true, approvedAt: now, publisherFingerprint: repo.fingerprint,
            official: repo.official)
        saveInstalled(installed.filter { $0.id != entry.id } + [entry])
        var map = grants
        map[entry.id] = IntegrationUpdates.grantsFor(approved)
        saveGrants(map)
        return .ok
    }

    func uninstall(_ id: String) {
        saveInstalled(installed.filter { $0.id != id })
        var s = settings
        s[id] = nil
        saveSettings(s)
        var g = grants
        g[id] = nil
        saveGrants(g)
    }

    func setEnabled(_ id: String, _ enabled: Bool) {
        saveInstalled(installed.map { i in
            guard i.id == id else { return i }
            var next = i
            next.enabled = enabled
            return next
        })
    }

    /// Turns one capability off (granted = false) or back on, only if it was approved
    func setGrant(_ id: String, _ capability: IntegrationPerms.Capability, _ granted: Bool) {
        guard let inst = installed.first(where: { $0.id == id }), inst.permissions.has(capability) else { return }
        var map = grants
        var own = map[id] ?? [:]
        own[capability.rawValue] = granted
        map[id] = own
        saveGrants(map)
    }

    /// Accepts the pending update: new permissions take effect and new capabilities are granted
    func approveUpdate(_ id: String, now: Double = Date().timeIntervalSince1970 * 1000) -> ActionResult {
        guard let pending = installed.first(where: { $0.id == id })?.pendingUpdate else { return .error("No update pending") }
        saveInstalled(installed.map { i in
            guard i.id == id else { return i }
            var next = i
            next.version = pending.version
            next.name = pending.name
            next.description = pending.description
            next.permissions = pending.permissions
            next.settings = pending.settings
            next.approvedAt = now
            next.pendingUpdate = nil
            return next
        })
        var own = grants[id] ?? [:]
        for capability in IntegrationPerms.Capability.allCases {
            // Capabilities the user had switched off stay off; new ones start granted
            let offered = pending.permissions.has(capability)
            if offered, own[capability.rawValue] == nil { own[capability.rawValue] = true }
            if !offered { own[capability.rawValue] = nil }
        }
        var map = grants
        map[id] = own
        saveGrants(map)
        return .ok
    }

    /// Drops a pending update without applying it
    func dismissUpdate(_ id: String) {
        saveInstalled(installed.map { i in
            guard i.id == id else { return i }
            var next = i
            next.pendingUpdate = nil
            return next
        })
    }

    // MARK: Setting values

    /// Stores one setting value, only if the installed integration declares it and the value fits
    func setSetting(_ id: String, _ settingId: String, _ value: JSONValue) {
        guard let def = installed.first(where: { $0.id == id })?.settings?.first(where: { $0.id == settingId }),
              IntegrationSettings.isValid(def, value) else { return }
        var own = settings[id]?.object ?? [:]
        own[settingId] = value
        var map = settings
        map[id] = .object(own)
        saveSettings(map)
    }

    /// Back to the declared defaults
    func resetSettings(_ id: String) {
        var map = settings
        map[id] = nil
        saveSettings(map)
    }
}
