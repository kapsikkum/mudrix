import Foundation
import WizardChatCore

// The pure rules around installed integrations: what their settings do, which permissions an update widens, what their link
// rules match, and how a refreshed repository is applied (`IntegrationRules.kt` on Android, the web's `integrations/*.ts`).

/// Percent-encoding like JavaScript's `encodeURIComponent`
func encodeUriComponent(_ text: String) -> String {
    var allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    allowed.insert(charactersIn: "-_.!~*'()")
    return text.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
}

/// Percent-decoding like JavaScript's `decodeURIComponent`: nil for a malformed or non-UTF-8 sequence
func decodeUriComponent(_ text: String) -> String? {
    text.removingPercentEncoding
}

/// A link from a message: the parts the rules look at, with the characters a browser would accept percent-encoded
struct LenientLink {
    var scheme: String?
    var user: String?
    var host: String?
    var port: Int?
    /// Percent-encoded, dot segments removed; "/" when empty
    var path: String
}

func lenientLink(_ raw: String) -> LenientLink? {
    var fixed = ""
    for byte in raw.utf8 {
        let c = Int(byte)
        if c < 0x21 || c > 0x7E || "\"<>\\^`{|}".utf8.contains(byte) {
            fixed += String(format: "%%%02X", UInt32(c))
        } else {
            fixed.unicodeScalars.append(Unicode.Scalar(byte))
        }
    }
    if let hash = fixed.firstIndex(of: "#") { fixed = String(fixed[..<hash]) }
    guard let parts = URLComponents(string: fixed) else { return nil }
    var segments: [String] = []
    for segment in parts.percentEncodedPath.components(separatedBy: "/") {
        if segment == "." { continue }
        if segment == ".." {
            if segments.count > 1 { segments.removeLast() }
            continue
        }
        segments.append(segment)
    }
    var path = segments.joined(separator: "/")
    if path.isEmpty { path = "/" }
    return LenientLink(scheme: parts.scheme, user: parts.user ?? parts.password, host: parts.host, port: parts.port, path: path)
}

/// What a user's settings do: check, fill templates, decide what a card shows
enum IntegrationSettings {
    static let none: SettingValues = [:]

    private static func defaultOf(_ def: IntegrationSetting) -> SettingValue {
        switch def.kind {
        case .toggle(let value): return .bool(value)
        case .text(let value, _): return .text(value)
        case .choice(let value, _): return .text(value)
        }
    }

    /// True when `value` is acceptable for this setting as it is declared now
    static func isValid(_ def: IntegrationSetting, _ value: JSONValue?) -> Bool {
        switch def.kind {
        case .toggle: return value?.bool != nil
        case .choice(_, let options):
            guard let v = value?.string else { return false }
            return options.contains { $0.value == v }
        case .text(_, let maxLength):
            guard let v = value?.string else { return false }
            return v.utf16.count <= min(maxLength, maxSettingText) && !IntegrationManifest.hasUnsafeChars(v)
        }
    }

    /// The value of every declared setting: the stored one when it still fits, else the default
    static func resolve(_ defs: [IntegrationSetting]?, _ stored: JSONValue?) -> SettingValues {
        guard let defs, !defs.isEmpty else { return none }
        var out: SettingValues = [:]
        for def in defs {
            let v = stored?.object?[def.id]
            if let v, isValid(def, v) {
                if let flag = v.bool { out[def.id] = .bool(flag) } else if let text = v.string { out[def.id] = .text(text) }
            } else {
                out[def.id] = defaultOf(def)
            }
        }
        return out
    }

    /// What `{setting.<id>}` becomes: the text or choice value, plain and capped; "" otherwise
    static func text(_ values: SettingValues, _ id: String) -> String {
        guard case .text(let value)? = values[id] else { return "" }
        return String(IntegrationManifest.stripUnsafeChars(value).prefix(maxSettingText))
    }

    /// A toggle's value; a missing or non-boolean one counts as off, and no id counts as on
    static func on(_ values: SettingValues, _ id: String?) -> Bool {
        guard let id else { return true }
        return values[id] == .bool(true)
    }

    /// Fills `{name}` from `vars` and `{setting.<id>}` from `settings`, in one pass so inserted text is never expanded again.
    /// Unknown `{name}`s are kept as written.
    static func render(_ template: String, vars: [String: String], settings: SettingValues) -> String {
        guard let regex = try? NSRegularExpression(pattern: "\\{([A-Za-z0-9_]+|setting\\.[a-zA-Z0-9]+)\\}") else { return template }
        let ns = template as NSString
        var out = ""
        var last = 0
        for match in regex.matches(in: template, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: match.range.location - last))
            let name = ns.substring(with: match.range(at: 1))
            if name.hasPrefix("setting.") {
                out += text(settings, String(name.dropFirst(8)))
            } else {
                out += vars[name] ?? ns.substring(with: match.range)
            }
            last = match.range.location + match.range.length
        }
        return out + ns.substring(from: last)
    }

    /// Whether a lookup would show anything with these settings (if not, nothing is asked)
    static func lookupShowsAnything(_ lookup: LinkLookup, _ settings: SettingValues) -> Bool {
        lookup.title != nil || (lookup.description != nil && on(settings, lookup.descriptionIf))
            || (lookup.facts ?? []).contains { on(settings, $0.ifToggle) }
    }

    /// True when an update changes a setting in a way that could change what is inserted or sent without the templates
    /// changing: another type, default, or a new choice value.
    static func widened(_ prev: [IntegrationSetting]?, _ next: [IntegrationSetting]?) -> Bool {
        (next ?? []).contains { n in
            guard let p = (prev ?? []).first(where: { $0.id == n.id }) else { return false }
            switch (p.kind, n.kind) {
            case (.toggle(let a), .toggle(let b)): return a != b
            case (.text(let a, _), .text(let b, _)): return a != b
            case (.choice(let a, let old), .choice(let b, let new)):
                return a != b || new.contains { option in !old.contains { $0.value == option.value } }
            default: return true
            }
        }
    }
}

/// Which permissions an update widens, and which hosts an integration can reach
enum IntegrationPermissions {
    private static func ruleCovered(_ next: LinkCardRule, _ old: [LinkCardRule]) -> Bool {
        old.contains { o in
            next.hosts.allSatisfy { o.hosts.contains($0) }
                && (o.pathPrefix == nil || (next.pathPrefix ?? "").hasPrefix(o.pathPrefix ?? ""))
                && o.pathPattern == next.pathPattern
                // Dropping an exclusion lets the rule match more links
                && (o.pathExclude ?? []).allSatisfy { (next.pathExclude ?? []).contains($0) }
                && o.title == next.title && o.subtitle == next.subtitle && o.buttonLabel == next.buttonLabel && o.icon == next.icon
                && (next.details == nil || o.details == next.details)
        }
    }

    private static func linkDetailsCovered(_ next: LinkDetailsPermission, _ old: LinkDetailsPermission?) -> Bool {
        guard let old else { return false }
        return old.host == next.host && next.lookups.allSatisfy { old.lookups.contains($0) }
    }

    private static func actionCovered(_ next: ComposerAction, _ old: [ComposerAction]) -> Bool {
        old.contains { $0.id == next.id && $0.insert == next.insert && $0.label == next.label }
    }

    private static func apiActionCovered(_ next: ApiAction, _ old: [ApiAction]) -> Bool {
        old.contains { o in
            o.id == next.id && o.label == next.label && o.path == next.path && o.insertResultLink == next.insertResultLink && o.body == next.body
        }
    }

    private static func apiCovered(_ next: ApiPermission, _ old: ApiPermission?) -> Bool {
        guard let old else { return false }
        return old.host == next.host && next.actions.allSatisfy { apiActionCovered($0, old.actions) }
    }

    private static func commandCovered(_ next: IntegrationCommand, _ old: [IntegrationCommand]) -> Bool {
        old.contains { o in
            o.name == next.name && o.description == next.description && o.usage == next.usage && o.insert == next.insert && o.api == next.api
        }
    }

    /// True when `next` lets the integration do anything `prev` did not already allow: a new capability, host, rule, action or
    /// command, a broader path, or changed text, request or body the user would see, insert or send. Pure.
    static func widened(_ prev: IntegrationPerms, _ next: IntegrationPerms) -> Bool {
        let oldRules = prev.linkCards ?? []
        if (next.linkCards ?? []).contains(where: { !ruleCovered($0, oldRules) }) { return true }
        if let details = next.linkDetails, !linkDetailsCovered(details, prev.linkDetails) { return true }
        let oldActions = prev.composerActions ?? []
        if (next.composerActions ?? []).contains(where: { !actionCovered($0, oldActions) }) { return true }
        if let api = next.api, !apiCovered(api, prev.api) { return true }
        let oldCommands = prev.commands ?? []
        return (next.commands ?? []).contains { !commandCovered($0, oldCommands) }
    }

    /// Every host an integration with these permissions may contact, for showing before installing: the lookup host and the api host
    static func contactedHosts(_ p: IntegrationPerms) -> [String] {
        var out: [String] = []
        for host in [p.linkDetails?.host, p.api?.host].compactMap({ $0 }) where !out.contains(host) { out.append(host) }
        return out
    }
}

/// Which integrations are active, and what their rules match
enum IntegrationMatching {
    struct LinkCardMatch {
        var integrationId: String
        var integrationName: String
        var rule: LinkCardRule
        /// What the rule's `pathPattern` captured from the link (decoded); empty without a pattern
        var captures: [String: String]
        /// The rule's texts with the captures filled in
        var title: String
        var subtitle: String?
        /// The integration's setting values (checked; defaults where nothing valid is stored)
        var settings: SettingValues
    }

    struct ActiveComposerAction {
        var action: ComposerAction
        var integrationId: String
        var integrationName: String
        var settings: SettingValues
    }

    struct ActiveApiAction {
        var action: ApiAction
        var integrationId: String
        var integrationName: String
        var host: String
        var settings: SettingValues
    }

    struct ActiveCommand {
        var name: String
        var description: String
        var usage: String?
        /// Template, for an insert command
        var insert: String?
        /// Id of an action in the same integration's api actions, for an api command
        var api: String?
        var integrationId: String
        var integrationName: String
        var settings: SettingValues

        var isApi: Bool { api != nil }
    }

    struct LinkLookupRef {
        var host: String
        var lookup: LinkLookup
        var allow: [String]
    }

    private static func active(_ i: InstalledIntegration, _ grants: GrantMap, _ cap: IntegrationPerms.Capability) -> Bool {
        i.enabled && grants[i.id]?[cap.rawValue] == true
    }

    /// The hosts a request for this capability may reach right now: the one host the person approved for it, and only while the
    /// integration is enabled and the capability is still switched on. This is the allow-list `IntegrationNetwork` receives.
    static func allowedHosts(_ i: InstalledIntegration, _ grants: GrantMap, _ cap: IntegrationPerms.Capability) -> [String] {
        guard cap == .linkDetails || cap == .api, active(i, grants, cap) else { return [] }
        let host = cap == .api ? i.permissions.api?.host : i.permissions.linkDetails?.host
        return host.map { [$0] } ?? []
    }

    /// An installed integration's setting values, checked against what it declares
    static func settings(of i: InstalledIntegration, _ stored: StoredSettings?) -> SettingValues {
        guard i.settings != nil else { return IntegrationSettings.none }
        return IntegrationSettings.resolve(i.settings, stored?[i.id])
    }

    /// `/s` covers `/s` and `/s/...` but not `/sx`
    private static func pathUnder(_ pathname: String, _ prefix: String) -> Bool {
        if prefix == "/" { return true }
        let base = prefix.hasSuffix("/") ? String(prefix.dropLast()) : prefix
        return pathname == base || pathname.hasPrefix(base + "/")
    }

    private static let maxCapture = 100

    /// Matches a link path against a `pathPattern` by whole segments; the link may continue below the pattern. Returns the
    /// decoded captures, or nil. A capture that is empty, "." or "..", too long, not decodable or holds control or invisible
    /// characters makes the rule not match.
    static func matchPathPattern(_ pathname: String, _ pattern: String) -> [String: String]? {
        guard case .ok(let want) = IntegrationManifest.parsePathPattern(pattern) else { return nil }
        let have = pathname.dropFirst().components(separatedBy: "/")
        if have.count < want.count { return nil }
        var out: [String: String] = [:]
        for (i, segment) in want.enumerated() {
            switch segment {
            case .literal(let text):
                if have[i] != text { return nil }
            case .name(let name):
                guard let value = decodeUriComponent(have[i]) else { return nil }
                if value.isEmpty || value == "." || value == ".." || value.utf16.count > maxCapture || IntegrationManifest.hasUnsafeChars(value) { return nil }
                out[name] = value
            }
        }
        return out
    }

    /// Fills `{name}` placeholders from the captures and `{setting.<id>}` from the settings, in one pass
    static func fillCaptures(_ template: String, _ captures: [String: String], _ settings: SettingValues = IntegrationSettings.none) -> String {
        IntegrationSettings.render(template, vars: captures, settings: settings)
    }

    /// True when the path is under one of the rule's `pathExclude` paths (whole segments, any case)
    private static func excluded(_ pathname: String, _ rule: LinkCardRule) -> Bool {
        let p = pathname.lowercased()
        return (rule.pathExclude ?? []).contains { pathUnder(p, $0.lowercased()) }
    }

    /// First enabled, granted link-card rule matching this link by exact host (default port) and path
    static func matchLinkCard(_ url: String, _ installed: [InstalledIntegration], _ grants: GrantMap, stored: StoredSettings? = nil) -> LinkCardMatch? {
        guard let link = lenientLink(url), link.scheme?.lowercased() == "https", link.user == nil, link.port == nil,
              let host = link.host?.lowercased() else { return nil }
        let path = link.path
        for i in installed where active(i, grants, .linkCards) {
            for rule in i.permissions.linkCards ?? [] {
                if !rule.hosts.contains(host) || excluded(path, rule) { continue }
                let values = settings(of: i, stored)
                if let pattern = rule.pathPattern {
                    guard let captures = matchPathPattern(path, pattern) else { continue }
                    return LinkCardMatch(
                        integrationId: i.id, integrationName: i.name, rule: rule, captures: captures,
                        title: fillCaptures(rule.title, captures, values),
                        subtitle: rule.subtitle.flatMap { $0.isEmpty ? nil : fillCaptures($0, captures, values) },
                        settings: values)
                } else if pathUnder(path, rule.pathPrefix ?? "/") {
                    return LinkCardMatch(
                        integrationId: i.id, integrationName: i.name, rule: rule, captures: [:],
                        title: fillCaptures(rule.title, [:], values),
                        subtitle: rule.subtitle.flatMap { $0.isEmpty ? nil : fillCaptures($0, [:], values) },
                        settings: values)
                }
            }
        }
        return nil
    }

    /// The approved lookup for a matched card, if its integration still has the linkDetails grant
    static func findLinkLookup(_ match: LinkCardMatch, _ installed: [InstalledIntegration], _ grants: GrantMap) -> LinkLookupRef? {
        guard let detailsId = match.rule.details, let i = installed.first(where: { $0.id == match.integrationId }),
              let details = i.permissions.linkDetails, active(i, grants, .linkDetails),
              let lookup = details.lookups.first(where: { $0.id == detailsId }) else { return nil }
        return LinkLookupRef(host: details.host, lookup: lookup, allow: allowedHosts(i, grants, .linkDetails))
    }

    /// Composer actions of every enabled integration whose composerActions grant is still on
    static func composerActions(_ installed: [InstalledIntegration], _ grants: GrantMap, stored: StoredSettings? = nil) -> [ActiveComposerAction] {
        installed.filter { active($0, grants, .composerActions) }.flatMap { i in
            let values = settings(of: i, stored)
            return (i.permissions.composerActions ?? []).map { ActiveComposerAction(action: $0, integrationId: i.id, integrationName: i.name, settings: values) }
        }
    }

    /// API actions of every enabled integration whose api grant is still on
    static func apiActions(_ installed: [InstalledIntegration], _ grants: GrantMap, stored: StoredSettings? = nil) -> [ActiveApiAction] {
        installed.filter { active($0, grants, .api) && $0.permissions.api != nil }.flatMap { i -> [ActiveApiAction] in
            guard let api = i.permissions.api else { return [] }
            let values = settings(of: i, stored)
            return api.actions.map { ActiveApiAction(action: $0, integrationId: i.id, integrationName: i.name, host: api.host, settings: values) }
        }
    }

    /// Slash commands of enabled, granted integrations. Names in `reserved` (built-in commands and aliases) are dropped so an
    /// integration can never shadow them; between integrations the first installed wins. Api commands also need the api grant
    /// and an existing target action.
    static func commands(_ installed: [InstalledIntegration], _ grants: GrantMap, reserved: Set<String>, stored: StoredSettings? = nil) -> [ActiveCommand] {
        var seen = Set<String>()
        var out: [ActiveCommand] = []
        for i in installed where active(i, grants, .commands) {
            for c in i.permissions.commands ?? [] {
                let name = c.name.lowercased()
                if reserved.contains(name) || seen.contains(name) { continue }
                if let target = c.api {
                    if !active(i, grants, .api) { continue }
                    if i.permissions.api?.actions.contains(where: { $0.id == target }) != true { continue }
                } else if c.insert == nil {
                    continue
                }
                seen.insert(name)
                out.append(ActiveCommand(name: c.name, description: c.description, usage: c.usage, insert: c.insert, api: c.api,
                                         integrationId: i.id, integrationName: i.name, settings: settings(of: i, stored)))
            }
        }
        return out
    }

    private static let maxArgs = 500

    /// Fills `{room}` (URL-encoded), `{args}` (what was typed after the command, as plain text minus control and invisible
    /// characters, capped) and `{setting.<id>}`. The result is plain text for the composer, in one pass.
    static func renderInsert(_ insert: String, roomId: String, args: String = "", settings: SettingValues = IntegrationSettings.none) -> String {
        IntegrationSettings.render(insert, vars: ["room": encodeUriComponent(roomId), "args": String(IntegrationManifest.stripUnsafeChars(args).prefix(maxArgs))],
                                   settings: settings)
    }
}

/// Updating, versions and what to do when a repository is refreshed
enum IntegrationUpdates {
    /// Compares dotted versions numerically where possible; > 0 means `a` is newer
    static func compareVersions(_ a: String, _ b: String) -> Int {
        func parts(_ v: String) -> [String] {
            var text = v
            if text.lowercased().hasPrefix("v") { text.removeFirst() }
            return text.components(separatedBy: CharacterSet(charactersIn: ".-+"))
        }
        let pa = parts(a), pb = parts(b)
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : "0"
            let y = i < pb.count ? pb[i] : "0"
            let nx = !x.isEmpty && x.allSatisfy { $0.isASCII && $0.isNumber }
            let ny = !y.isEmpty && y.allSatisfy { $0.isASCII && $0.isNumber }
            let d: Int
            if nx && ny {
                // Longer digit strings (no leading zeros) are bigger numbers; same length compares as text
                let sx = String(x.drop { $0 == "0" }), sy = String(y.drop { $0 == "0" })
                d = sx.count != sy.count ? (sx.count < sy.count ? -1 : 1) : (sx == sy ? 0 : (sx < sy ? -1 : 1))
            } else {
                d = x == y ? 0 : (x < y ? -1 : 1)
            }
            if d != 0 { return d }
        }
        return 0
    }

    /// The capabilities an integration with these permissions asks to be granted
    static func grantsFor(_ permissions: IntegrationPerms) -> [String: Bool] {
        var out: [String: Bool] = [:]
        for cap in IntegrationPerms.Capability.allCases where permissions.has(cap) { out[cap.rawValue] = true }
        return out
    }

    /// Applies a refreshed repository's integration to an installed one. Permissions only change if not widened.
    static func reconcile(_ inst: InstalledIntegration, fresh: Integration?, rejected: RejectedIntegration? = nil) -> InstalledIntegration {
        var next = inst
        guard let fresh else {
            // Listed, but in a form this app can not use: keep the approved version as it is
            if let rejected {
                let blocked = BlockedUpdate(reason: rejected.reason, error: rejected.error)
                if inst.blockedUpdate == blocked && !inst.sourceGone { return inst }
                next.sourceGone = false
                next.blockedUpdate = blocked
                return next
            }
            // No longer offered by its repository: it keeps working but is flagged, like a removed source
            if inst.sourceGone { return inst }
            next.sourceGone = true
            return next
        }
        // Settings travel with the permissions their templates were approved with: both or neither
        let widened = IntegrationPermissions.widened(inst.permissions, fresh.permissions) || IntegrationSettings.widened(inst.settings, fresh.settings)
        if widened {
            // Keep the approved permissions in force until the user re-approves (even if the version did not change)
            next.sourceGone = false
            next.blockedUpdate = nil
            next.pendingUpdate = PendingUpdate(version: fresh.version, name: fresh.name, description: fresh.description, iconUrl: fresh.icon,
                                               permissions: fresh.permissions, settings: fresh.settings)
            return next
        }
        let unchanged = inst.pendingUpdate == nil && inst.blockedUpdate == nil && !inst.sourceGone && fresh.version == inst.version
            && fresh.name == inst.name && fresh.description == inst.description && fresh.permissions == inst.permissions
            && fresh.settings == inst.settings
        if unchanged { return inst }
        // Narrower or equal: safe to take as is. This does not depend on the version string, so a publisher can always
        // withdraw a permission, even by re-using or lowering the version.
        next.pendingUpdate = nil
        next.blockedUpdate = nil
        next.sourceGone = false
        next.version = fresh.version
        next.name = fresh.name
        next.description = fresh.description
        next.permissions = fresh.permissions
        next.settings = fresh.settings
        return next
    }
}
