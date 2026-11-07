import Foundation
import WizardChatCore

/// What is kept for installed integrations and repositories (device-only, never synced), as in `IntegrationRules.kt`

struct PendingUpdate: Codable, Equatable {
    var version: String
    var name: String
    var description: String
    var iconUrl: String?
    /// Not in force until approved
    var permissions: IntegrationPerms
    var settings: [IntegrationSetting]?
}

struct BlockedUpdate: Codable, Equatable {
    var reason: String
    var error: String
}

struct InstalledIntegration: Codable, Equatable {
    var id: String
    var repoUrl: String
    var name: String
    var description: String
    var version: String
    /// Exactly what the user approved. Only this is ever acted on.
    var permissions: IntegrationPerms
    /// The setting declarations approved with those permissions (values are kept apart)
    var settings: [IntegrationSetting]?
    var enabled = true
    var approvedAt: Double = 0
    /// The repository it came from was removed
    var sourceGone = false
    /// Fingerprint of the repository's pinned key when installed (kept in sync on refresh)
    var publisherFingerprint: String?
    /// The repository's key was the official one
    var official = false
    var pendingUpdate: PendingUpdate?
    /// Its repository now lists a version this app can not use; the approved one keeps working
    var blockedUpdate: BlockedUpdate?
}

struct RepositoryRecord: Codable, Equatable {
    /// The URL actually fetched (a github.com URL is stored as its raw repo.json URL)
    var url: String
    var name: String
    var addedAt: Double
    var lastFetchedAt: Double?
    var integrations: [Integration]
    var rejected: [RejectedIntegration]?
    /// The pinned signing key (base64 of the raw 32 bytes), trusted on first use
    var key: String
    /// Grouped hex fingerprint of `key`
    var fingerprint: String
    /// Highest serial seen; a lower one is refused
    var serial: Int
    var official = false
    var trustedAt: Double = 0
    /// Why the last fetch failed; the previous integrations are kept
    var error: String?
    /// The last fetch was signed by a different key than the pinned one and was refused
    var keyChanged = false
}

/// Per integration id: capability name -> still granted. Missing means not granted.
typealias GrantMap = [String: [String: Bool]]

/// Integration id -> stored settings object (unchecked; see `IntegrationSettings.resolve`)
typealias StoredSettings = [String: JSONValue]

/// A setting's value on this device
enum SettingValue: Equatable {
    case bool(Bool)
    case text(String)
}

typealias SettingValues = [String: SettingValue]
