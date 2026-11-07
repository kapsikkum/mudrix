import Foundation

/// Integration repositories are data only: nothing from a repo.json is ever executed. These are the types a validated
/// manifest turns into (`IntegrationManifest.kt` on Android, `features/integrations/manifest.ts` on the web). Widgets (pages
/// that run code) are known by name so they get a clear message, but this app does not run them.

let manifestSchema = 1

/// Cap on the raw repo.json text, in bytes
let maxManifestBytes = 256 * 1024
let maxSettingText = 200

let composerIconNames = ["send", "download", "link", "plus"]
let linkFactFormats = ["text", "count", "date"]
let settingTypes = ["toggle", "text", "choice"]

struct LinkCardRule: Codable, Equatable {
    /// Exact lowercase hostnames. No wildcards, no IPs.
    var hosts: [String]
    /// Only links whose path starts with this match. Exclusive with `pathPattern`.
    var pathPrefix: String?
    /// Segment pattern such as "/{owner}/{repo}": literal segments match exactly, each `{name}` takes one segment
    var pathPattern: String?
    var title: String
    var subtitle: String?
    var buttonLabel: String?
    /// Accepted for compatibility but never shown or fetched
    var icon: String?
    /// Id of a lookup in this integration's `linkDetails.lookups`. Needs `pathPattern`.
    var details: String?
    /// Links under any of these paths (whole segments, ignoring case) never match this rule
    var pathExclude: [String]?
}

struct ChoiceOption: Codable, Equatable {
    var value: String
    var label: String
}

/// A per-integration option the person sets on their device (values are plain data, kept on this device only)
struct IntegrationSetting: Codable, Equatable {
    enum Kind: Codable, Equatable {
        case toggle(defaultValue: Bool)
        case text(defaultValue: String, maxLength: Int)
        case choice(defaultValue: String, options: [ChoiceOption])
    }

    var id: String
    var label: String
    var description: String?
    var kind: Kind

    var isToggle: Bool { if case .toggle = kind { true } else { false } }
    var isChoice: Bool { if case .choice = kind { true } else { false } }
    var isText: Bool { if case .text = kind { true } else { false } }
}

struct LinkFact: Codable, Equatable {
    var label: String
    var field: String
    var format: String?
    var ifToggle: String?

    enum CodingKeys: String, CodingKey {
        case label, field, format
        case ifToggle = "if"
    }
}

struct LinkLookup: Codable, Equatable {
    var id: String
    var path: String
    var title: String?
    var description: String?
    var descriptionIf: String?
    var facts: [LinkFact]?
}

struct LinkDetailsPermission: Codable, Equatable {
    var host: String
    var lookups: [LinkLookup]
}

struct ComposerAction: Codable, Equatable {
    var id: String
    var label: String
    var icon: String?
    var insert: String
}

struct ApiAction: Codable, Equatable {
    var id: String
    var label: String
    var path: String
    var body: [String: String]?
    var insertResultLink: String?
}

struct ApiPermission: Codable, Equatable {
    var host: String
    var actions: [ApiAction]
}

struct IntegrationCommand: Codable, Equatable {
    var name: String
    var description: String
    var usage: String?
    var insert: String?
    var api: String?
}

struct IntegrationPerms: Codable, Equatable {
    var linkCards: [LinkCardRule]?
    var linkDetails: LinkDetailsPermission?
    var composerActions: [ComposerAction]?
    var commands: [IntegrationCommand]?
    var api: ApiPermission?

    enum Capability: String, CaseIterable, Codable {
        case linkCards, linkDetails, composerActions, commands, api
    }

    /// True when the permission set actually offers this capability (non-empty)
    func has(_ capability: Capability) -> Bool {
        switch capability {
        case .api: return (api?.actions.count ?? 0) > 0
        case .linkDetails: return (linkDetails?.lookups.count ?? 0) > 0
        case .linkCards: return (linkCards?.count ?? 0) > 0
        case .composerActions: return (composerActions?.count ?? 0) > 0
        case .commands: return (commands?.count ?? 0) > 0
        }
    }
}

struct Integration: Codable, Equatable {
    var id: String
    var name: String
    var description: String
    var version: String
    var icon: String?
    var permissions: IntegrationPerms
    var settings: [IntegrationSetting]?
}

/// An entry of a repository that this version of the app can not use: listed so the person sees why, never installable
struct RejectedIntegration: Codable, Equatable {
    static let unsupported = "unsupported"
    static let invalid = "invalid"

    var index: Int
    var id: String?
    var name: String?
    var error: String
    /// "unsupported": something this app does not know or does not run (a newer one, a widget); "invalid": a plain mistake
    var reason: String
}

struct RepoManifest {
    var key: String
    var serial: Int
    var name: String
    var integrations: [Integration]
    /// Entries left out, each with its reason
    var rejected: [RejectedIntegration]
}

enum ValidationResult<T> {
    case valid(T)
    case invalid(String)
}
