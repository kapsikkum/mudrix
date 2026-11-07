import Foundation
import WizardChatCore

/// A strict hand-written validator, the same rules as the web app's `features/integrations/manifest.ts` (and
/// `IntegrationManifest.kt` on Android). Anything unknown is rejected rather than ignored, so a manifest can never carry a
/// capability the app does not know how to show for approval. An entry that asks for a widget is listed and never installable.
enum IntegrationManifest {
    private static let maxRepoName = 60
    private static let maxIntegrations = 50
    static let maxName = 40
    private static let maxDescription = 400
    private static let maxVersion = 20
    private static let maxURL = 500
    private static let maxLinkRules = 10
    private static let maxHosts = 10
    private static let maxActions = 6
    private static let maxLabel = 24
    private static let maxInsert = 500
    private static let maxText = 120
    private static let maxPathPrefix = 200
    private static let maxApiActions = 4
    private static let maxApiPath = 200
    private static let maxBodyKeys = 16
    private static let maxBodyValue = 200
    private static let maxCommands = 6
    private static let maxCommandDescription = 80
    private static let maxCommandUsage = 60
    private static let maxLookups = 4
    private static let maxFacts = 6
    private static let maxPathExcludes = 30
    private static let maxPathExclude = 100
    private static let maxSettings = 8
    private static let maxSettingLabel = 40
    private static let maxSettingDescription = 120
    private static let defaultSettingText = 100
    private static let maxChoices = 8
    private static let maxPatternSegments = 8
    private static let widgetUnsupported = "widgets are not supported in this app"

    /// Placeholders usable inside `api` action body values
    static let apiPlaceholders = ["room", "text", "args"]

    // MARK: Small helpers

    /// Whether the whole text matches (patterns end in `\z`, so a trailing newline never slips through)
    private static func rx(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }

    private static func contains(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }

    private static func isUnsafe(_ scalar: Unicode.Scalar) -> Bool {
        let v = scalar.value
        return v <= 0x1F || (0x7F...0x9F).contains(v) || v == 0xAD || v == 0x61C || v == 0x180E || (0x200B...0x200F).contains(v)
            || (0x2028...0x202E).contains(v) || (0x2060...0x206F).contains(v) || v == 0xFEFF || (0xFFF9...0xFFFB).contains(v)
    }

    /// Control characters (newlines included) and invisible or bidi formatting characters that can make text read differently
    static func hasUnsafeChars(_ value: String) -> Bool {
        value.unicodeScalars.contains(where: isUnsafe)
    }

    /// Removes the characters `hasUnsafeChars` rejects (for text that did not come from a manifest)
    static func stripUnsafeChars(_ value: String) -> String {
        String(String.UnicodeScalarView(value.unicodeScalars.filter { !isUnsafe($0) }))
    }

    /// JavaScript's `.length`
    private static func length(_ text: String) -> Int { text.utf16.count }

    private struct Fail: Error {
        let message: String
    }

    private static func fail(_ path: String, _ message: String) -> Fail {
        Fail(message: "\(path): \(message)")
    }

    private static func asObject(_ value: JSONValue?, _ path: String, _ allowed: [String]) throws -> [String: JSONValue] {
        guard let object = value?.object else { throw fail(path, "must be an object") }
        for key in object.keys.sorted() where !allowed.contains(key) { throw fail("\(path).\(key)", "unknown key") }
        return object
    }

    private static func asArray(_ value: JSONValue?, _ path: String, _ max: Int) throws -> [JSONValue] {
        guard let array = value?.array else { throw fail(path, "must be an array") }
        if array.count > max { throw fail(path, "at most \(max) entries") }
        return array
    }

    private static func asString(_ value: JSONValue?, _ path: String, _ max: Int, min: Int = 1) throws -> String {
        guard let s = value?.string else { throw fail(path, "must be a string") }
        if length(s) < min { throw fail(path, "must not be empty") }
        if length(s) > max { throw fail(path, "at most \(max) characters") }
        if hasUnsafeChars(s) { throw fail(path, "contains control or invisible characters") }
        return s
    }

    /// A string value without the length and character rules (a type name or reference that is compared, not shown)
    private static func plainString(_ value: JSONValue?) -> String? { value?.string }

    private static func asHttpsURL(_ value: JSONValue?, _ path: String) throws -> String {
        let s = try asString(value, path, maxURL)
        guard let parts = URLComponents(string: s) else { throw fail(path, "not a valid URL") }
        if parts.scheme?.lowercased() != "https" { throw fail(path, "must be an https URL") }
        if parts.user != nil || parts.password != nil { throw fail(path, "must not contain credentials") }
        if (parts.host ?? "").isEmpty { throw fail(path, "missing host") }
        return s
    }

    private static func isIpLike(_ host: String) -> Bool {
        host.contains(":") || host.hasPrefix("[") || rx(host, "^[0-9.]+\\z")
    }

    private static func asHost(_ value: JSONValue?, _ path: String) throws -> String {
        let s = try asString(value, path, 253)
        if s != s.lowercased() { throw fail(path, "must be lowercase") }
        if isIpLike(s) { throw fail(path, "IP addresses are not allowed") }
        let labels = s.components(separatedBy: ".")
        if labels.count < 2 || !labels.allSatisfy({ rx($0, "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\z") }) {
            throw fail(path, "not a valid hostname (no wildcards or ports)")
        }
        return s
    }

    // MARK: Templates and path patterns

    /// Finds `{room}`-style placeholders and `{setting.<id>}` ones; the closure returns the text to put in their place
    private static func replacingPlaceholders(_ text: String, _ transform: (String, String) -> String) -> String {
        guard let regex = try? NSRegularExpression(pattern: "\\{([A-Za-z0-9_]+|setting\\.[a-zA-Z0-9]+)\\}") else { return text }
        let ns = text as NSString
        var out = ""
        var last = 0
        for match in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: match.range.location - last))
            out += transform(ns.substring(with: match.range(at: 1)), ns.substring(with: match.range))
            last = match.range.location + match.range.length
        }
        out += ns.substring(from: last)
        return out
    }

    /// The placeholder names (`room`, `setting.x`) a template mentions
    static func placeholders(in text: String) -> [String] {
        var names: [String] = []
        _ = replacingPlaceholders(text) { name, whole in
            names.append(name)
            return whole
        }
        return names
    }

    private static func asTemplate(_ value: JSONValue?, _ path: String, _ max: Int, _ allowed: [String], min: Int = 1,
                                   settingIds: [String] = []) throws -> String {
        let s = try asString(value, path, max, min: min)
        var failure: Fail?
        let rest = replacingPlaceholders(s) { name, whole in
            if name.hasPrefix("setting.") {
                if !settingIds.contains(String(name.dropFirst(8))) {
                    failure = fail(path, "{\(name)} is not a setting that can be used here (declare it in \"settings\"; toggles only work in \"if\", and only choice settings can be sent in an api body)")
                }
                return ""
            }
            return allowed.contains(name) ? "" : whole
        }
        if let failure { throw failure }
        if rest.contains("{") || rest.contains("}") {
            let names = allowed.map { "{\($0)}" } + settingIds.map { "{setting.\($0)}" }
            throw fail(path, "only the \(names.isEmpty ? "no" : names.joined(separator: ", ")) placeholder(s) are allowed")
        }
        return s
    }

    /// A plain text that may still use `{setting.<id>}` (other braces are kept as written)
    private static func asTextWithSettings(_ value: JSONValue?, _ path: String, _ max: Int, _ settingIds: [String]) throws -> String {
        let s = try asString(value, path, max)
        for name in placeholders(in: s) where name.hasPrefix("setting.") && !settingIds.contains(String(name.dropFirst(8))) {
            throw fail(path, "{\(name)} is not a declared text or choice setting")
        }
        return s
    }

    enum PatternSegment: Equatable {
        case literal(String)
        case name(String)
    }

    /// Parsed "/{owner}/{repo}" segments, or an error text for a pattern that is not allowed
    enum PatternParse {
        case ok([PatternSegment])
        case error(String)
    }

    static func parsePathPattern(_ pattern: String) -> PatternParse {
        guard pattern.hasPrefix("/") else { return .error("must start with \"/\"") }
        let parts = pattern.dropFirst().components(separatedBy: "/")
        if parts.count > maxPatternSegments { return .error("at most \(maxPatternSegments) segments") }
        var names = Set<String>()
        var out: [PatternSegment] = []
        for part in parts {
            if part.hasPrefix("{"), part.hasSuffix("}"), part.count >= 2 {
                let name = String(part.dropFirst().dropLast())
                if name.contains("{") || name.contains("}") {
                    return .error("each segment must be {name} or plain text (letters, digits, . _ ~ -)")
                }
                if !rx(name, "^[a-z][a-z0-9_]{0,15}\\z") { return .error("invalid placeholder name \"\(name)\"") }
                if !names.insert(name).inserted { return .error("placeholder {\(name)} is used twice") }
                out.append(.name(name))
            } else {
                if !rx(part, "^[A-Za-z0-9._~-]+\\z") || part == "." || part == ".." {
                    return .error("each segment must be {name} or plain text (letters, digits, . _ ~ -)")
                }
                out.append(.literal(part))
            }
        }
        return .ok(out)
    }

    /// Placeholder names a pattern captures
    static func patternNames(_ pattern: String) -> [String] {
        guard case .ok(let segments) = parsePathPattern(pattern) else { return [] }
        return segments.compactMap { if case .name(let name) = $0 { name } else { nil } }
    }

    /// Placeholder names used in a lookup path
    static func lookupNames(_ lookupPath: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: "\\{([a-z][a-z0-9_]{0,15})\\}") else { return [] }
        let ns = lookupPath as NSString
        return regex.matches(in: lookupPath, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range(at: 1)) }
    }

    // MARK: Settings

    private struct SettingIds {
        var text: [String] = []
        var choice: [String] = []
        var toggle: [String] = []
    }

    private static func settingIds(of settings: [IntegrationSetting]?) -> SettingIds {
        let all = settings ?? []
        return SettingIds(text: all.filter { $0.isText || $0.isChoice }.map(\.id), choice: all.filter(\.isChoice).map(\.id),
                          toggle: all.filter(\.isToggle).map(\.id))
    }

    private static func asToggleRef(_ value: JSONValue?, _ path: String, _ ids: SettingIds) throws -> String {
        let s = try asString(value, path, 24)
        if !ids.toggle.contains(s) { throw fail(path, "must be the id of a toggle setting in \"settings\"") }
        return s
    }

    private static func validateSetting(_ value: JSONValue?, _ path: String) throws -> IntegrationSetting {
        let o = try asObject(value, path, ["id", "label", "description", "type", "default", "maxLength", "options"])
        let id = try asString(o["id"], "\(path).id", 24)
        if !rx(id, "^[a-z][a-zA-Z0-9]{0,23}\\z") { throw fail("\(path).id", "must start with a lowercase letter, then letters and digits (up to 24)") }
        let label = try asString(o["label"], "\(path).label", maxSettingLabel)
        let description = try o["description"].map { try asString($0, "\(path).description", maxSettingDescription) }
        guard let type = plainString(o["type"]), settingTypes.contains(type) else {
            throw fail("\(path).type", "must be one of \(settingTypes.joined(separator: ", "))")
        }
        func only(_ key: String, _ forType: String) throws {
            if o[key] != nil { throw fail("\(path).\(key)", "only for \"\(forType)\" settings") }
        }
        if type == "toggle" {
            try only("maxLength", "text")
            try only("options", "choice")
            guard let flag = o["default"]?.bool else { throw fail("\(path).default", "must be true or false") }
            return IntegrationSetting(id: id, label: label, description: description, kind: .toggle(defaultValue: flag))
        }
        if type == "text" {
            try only("options", "choice")
            var maxLength = defaultSettingText
            if o["maxLength"] != nil {
                guard let n = o["maxLength"]?.number, n == n.rounded(.down), n >= 1, n <= Double(maxSettingText) else {
                    throw fail("\(path).maxLength", "must be a whole number from 1 to \(maxSettingText)")
                }
                maxLength = Int(n)
            }
            let text = try asString(o["default"], "\(path).default", maxLength, min: 0)
            return IntegrationSetting(id: id, label: label, description: description, kind: .text(defaultValue: text, maxLength: maxLength))
        }
        try only("maxLength", "text")
        var options: [ChoiceOption] = []
        for (i, raw) in try asArray(o["options"], "\(path).options", maxChoices).enumerated() {
            let co = try asObject(raw, "\(path).options[\(i)]", ["value", "label"])
            let optionValue = try asString(co["value"], "\(path).options[\(i)].value", 40)
            if !rx(optionValue, "^[A-Za-z0-9._~-]{1,40}\\z") { throw fail("\(path).options[\(i)].value", "letters, digits and . _ ~ - only (up to 40)") }
            options.append(ChoiceOption(value: optionValue, label: try asString(co["label"], "\(path).options[\(i)].label", maxSettingLabel)))
        }
        if options.count < 2 { throw fail("\(path).options", "needs at least two options") }
        if Set(options.map(\.value)).count != options.count { throw fail("\(path).options", "duplicate option value") }
        guard let chosen = plainString(o["default"]), options.contains(where: { $0.value == chosen }) else {
            throw fail("\(path).default", "must be the value of one of the options")
        }
        return IntegrationSetting(id: id, label: label, description: description, kind: .choice(defaultValue: chosen, options: options))
    }

    private static func validateSettings(_ value: JSONValue?, _ path: String) throws -> [IntegrationSetting] {
        var list: [IntegrationSetting] = []
        for (i, raw) in try asArray(value, path, maxSettings).enumerated() { list.append(try validateSetting(raw, "\(path)[\(i)]")) }
        if Set(list.map(\.id)).count != list.count { throw fail(path, "duplicate setting id") }
        return list
    }

    // MARK: Capabilities

    private static func validatePathExclude(_ value: JSONValue?, _ path: String) throws -> [String] {
        var list: [String] = []
        for (i, raw) in try asArray(value, path, maxPathExcludes).enumerated() {
            let p = try asString(raw, "\(path)[\(i)]", maxPathExclude)
            if !p.hasPrefix("/") || p == "/" { throw fail("\(path)[\(i)]", "must start with \"/\" and not be \"/\"") }
            if contains(p, "[?#\\s\\\\{}]") { throw fail("\(path)[\(i)]", "must be a plain path") }
            list.append(p)
        }
        if list.isEmpty { throw fail(path, "leave it out instead of giving an empty list") }
        if Set(list.map { $0.lowercased() }).count != list.count { throw fail(path, "duplicate path") }
        return list
    }

    private static func validateLinkCard(_ value: JSONValue?, _ path: String, _ details: LinkDetailsPermission?, _ ids: SettingIds) throws -> LinkCardRule {
        let o = try asObject(value, path, ["hosts", "pathPrefix", "pathPattern", "pathExclude", "title", "subtitle", "buttonLabel", "icon", "details"])
        var hosts: [String] = []
        for (i, raw) in try asArray(o["hosts"], "\(path).hosts", maxHosts).enumerated() { hosts.append(try asHost(raw, "\(path).hosts[\(i)]")) }
        if hosts.isEmpty { throw fail("\(path).hosts", "needs at least one host") }
        if Set(hosts).count != hosts.count { throw fail("\(path).hosts", "duplicate host") }
        if o["pathPrefix"] != nil, o["pathPattern"] != nil { throw fail(path, "use either \"pathPrefix\" or \"pathPattern\", not both") }
        var pathPattern: String?
        if let raw = o["pathPattern"] {
            let p = try asString(raw, "\(path).pathPattern", maxPathPrefix)
            if case .error(let message) = parsePathPattern(p) { throw fail("\(path).pathPattern", message) }
            pathPattern = p
        }
        // With a pattern, the texts may show what it captured; without one they are plain text
        let names = pathPattern.map { patternNames($0) }
        func text(_ raw: JSONValue?, _ at: String) throws -> String {
            if let names { return try asTemplate(raw, at, maxText, names, settingIds: ids.text) }
            return try asTextWithSettings(raw, at, maxText, ids.text)
        }
        let title = try text(o["title"], "\(path).title")
        var pathPrefix: String?
        if let raw = o["pathPrefix"] {
            let p = try asString(raw, "\(path).pathPrefix", maxPathPrefix)
            if !p.hasPrefix("/") { throw fail("\(path).pathPrefix", "must start with \"/\"") }
            if contains(p, "[?#\\s\\\\]") { throw fail("\(path).pathPrefix", "must be a plain path") }
            pathPrefix = p
        }
        let pathExclude = try o["pathExclude"].map { try validatePathExclude($0, "\(path).pathExclude") }
        let subtitle = try o["subtitle"].map { try text($0, "\(path).subtitle") }
        var detailsId: String?
        if let raw = o["details"] {
            let id = try asString(raw, "\(path).details", 32)
            guard let lookup = details?.lookups.first(where: { $0.id == id }) else {
                throw fail("\(path).details", "no such lookup in permissions.linkDetails.lookups")
            }
            guard let names else { throw fail("\(path).details", "needs a \"pathPattern\"") }
            let missing = lookupNames(lookup.path).filter { !names.contains($0) }
            if !missing.isEmpty {
                throw fail("\(path).details", "the lookup path uses \(missing.map { "{\($0)}" }.joined(separator: ", ")), which this pathPattern does not capture")
            }
            detailsId = id
        }
        let buttonLabel = try o["buttonLabel"].map { try asString($0, "\(path).buttonLabel", maxLabel) }
        let icon = try o["icon"].map { try asHttpsURL($0, "\(path).icon") }
        return LinkCardRule(hosts: hosts, pathPrefix: pathPrefix, pathPattern: pathPattern, title: title, subtitle: subtitle,
                            buttonLabel: buttonLabel, icon: icon, details: detailsId, pathExclude: pathExclude)
    }

    private static func validateApiAction(_ value: JSONValue?, _ path: String, _ ids: SettingIds) throws -> ApiAction {
        let o = try asObject(value, path, ["id", "label", "path", "body", "insertResultLink"])
        let id = try asString(o["id"], "\(path).id", 32)
        if !rx(id, "^[a-z0-9][a-z0-9._-]{0,31}\\z") { throw fail("\(path).id", "invalid id") }
        let apiPath = try asString(o["path"], "\(path).path", maxApiPath)
        if !rx(apiPath, "^/[A-Za-z0-9._~/-]*\\z") || apiPath.components(separatedBy: "/").contains(where: { $0 == ".." || $0 == "." }) {
            throw fail("\(path).path", "must start with \"/\" and be a plain path (letters, digits, . _ ~ / -)")
        }
        let label = try asString(o["label"], "\(path).label", maxLabel)
        var body: [String: String]?
        if let raw = o["body"] {
            guard let object = raw.object else { throw fail("\(path).body", "must be an object") }
            if object.count > maxBodyKeys { throw fail("\(path).body", "at most \(maxBodyKeys) keys") }
            var out: [String: String] = [:]
            for key in object.keys.sorted() {
                if !rx(key, "^[A-Za-z0-9_-]{1,32}\\z") || key == "__proto__" { throw fail("\(path).body.\(key)", "invalid key") }
                // Only choice values may be sent: a free-text setting must never carry a secret to a host
                out[key] = try asTemplate(object[key], "\(path).body.\(key)", maxBodyValue, apiPlaceholders, min: 0, settingIds: ids.choice)
            }
            body = out
        }
        var link: String?
        if let raw = o["insertResultLink"] {
            guard let s = plainString(raw), rx(s, "^[A-Za-z0-9_]{1,32}\\z") else {
                throw fail("\(path).insertResultLink", "must be a plain JSON field name")
            }
            link = s
        }
        return ApiAction(id: id, label: label, path: apiPath, body: body, insertResultLink: link)
    }

    private static func validateApi(_ value: JSONValue?, _ path: String, _ ids: SettingIds) throws -> ApiPermission {
        let o = try asObject(value, path, ["host", "actions"])
        let host = try asHost(o["host"], "\(path).host")
        var actions: [ApiAction] = []
        for (i, raw) in try asArray(o["actions"], "\(path).actions", maxApiActions).enumerated() {
            actions.append(try validateApiAction(raw, "\(path).actions[\(i)]", ids))
        }
        if actions.isEmpty { throw fail("\(path).actions", "needs at least one action") }
        if Set(actions.map(\.id)).count != actions.count { throw fail("\(path).actions", "duplicate action id") }
        return ApiPermission(host: host, actions: actions)
    }

    private static func asField(_ value: JSONValue?, _ path: String) throws -> String {
        let s = try asString(value, path, 140)
        let parts = s.components(separatedBy: ".")
        if parts.count > 4 || !parts.allSatisfy({ rx($0, "^[A-Za-z0-9_]{1,32}\\z") && !["__proto__", "constructor", "prototype"].contains($0) }) {
            throw fail(path, "must be a JSON field name, or up to 4 of them joined with \".\" (such as owner.login)")
        }
        return s
    }

    private static func validateFact(_ value: JSONValue?, _ path: String, _ ids: SettingIds) throws -> LinkFact {
        let o = try asObject(value, path, ["label", "field", "format", "if"])
        let label = try asString(o["label"], "\(path).label", maxLabel)
        let field = try asField(o["field"], "\(path).field")
        var format: String?
        if let raw = o["format"] {
            guard let s = plainString(raw), linkFactFormats.contains(s) else {
                throw fail("\(path).format", "must be one of \(linkFactFormats.joined(separator: ", "))")
            }
            format = s
        }
        let cond = try o["if"].map { try asToggleRef($0, "\(path).if", ids) }
        return LinkFact(label: label, field: field, format: format, ifToggle: cond)
    }

    private static func validateLookup(_ value: JSONValue?, _ path: String, _ ids: SettingIds) throws -> LinkLookup {
        let o = try asObject(value, path, ["id", "path", "title", "description", "descriptionIf", "facts"])
        let id = try asString(o["id"], "\(path).id", 32)
        if !rx(id, "^[a-z0-9][a-z0-9._-]{0,31}\\z") { throw fail("\(path).id", "invalid id") }
        let lookupPath = try asString(o["path"], "\(path).path", maxApiPath)
        let rest = lookupPath.replacingOccurrences(of: "\\{[a-z][a-z0-9_]{0,15}\\}", with: "x", options: .regularExpression)
        if !rx(rest, "^/[A-Za-z0-9._~/-]*\\z") || rest.components(separatedBy: "/").contains(where: { $0 == ".." || $0 == "." })
            || lookupPath.components(separatedBy: "/").contains(where: { $0 == "." || $0 == ".." }) {
            throw fail("\(path).path", "must start with \"/\" and be a plain path (letters, digits, . _ ~ / -) with {name} placeholders")
        }
        let title = try o["title"].map { try asField($0, "\(path).title") }
        let description = try o["description"].map { try asField($0, "\(path).description") }
        var descriptionIf: String?
        if let raw = o["descriptionIf"] {
            if description == nil { throw fail("\(path).descriptionIf", "only makes sense together with \"description\"") }
            descriptionIf = try asToggleRef(raw, "\(path).descriptionIf", ids)
        }
        var facts: [LinkFact]?
        if let raw = o["facts"] {
            var list: [LinkFact] = []
            for (i, fact) in try asArray(raw, "\(path).facts", maxFacts).enumerated() { list.append(try validateFact(fact, "\(path).facts[\(i)]", ids)) }
            facts = list.isEmpty ? nil : list
        }
        if title == nil, description == nil, facts == nil {
            throw fail(path, "shows nothing: give it a \"title\", a \"description\" or \"facts\"")
        }
        return LinkLookup(id: id, path: lookupPath, title: title, description: description, descriptionIf: descriptionIf, facts: facts)
    }

    private static func validateLinkDetails(_ value: JSONValue?, _ path: String, _ ids: SettingIds) throws -> LinkDetailsPermission {
        let o = try asObject(value, path, ["host", "lookups"])
        let host = try asHost(o["host"], "\(path).host")
        var lookups: [LinkLookup] = []
        for (i, raw) in try asArray(o["lookups"], "\(path).lookups", maxLookups).enumerated() {
            lookups.append(try validateLookup(raw, "\(path).lookups[\(i)]", ids))
        }
        if lookups.isEmpty { throw fail("\(path).lookups", "needs at least one lookup") }
        if Set(lookups.map(\.id)).count != lookups.count { throw fail("\(path).lookups", "duplicate lookup id") }
        return LinkDetailsPermission(host: host, lookups: lookups)
    }

    private static func validateCommand(_ value: JSONValue?, _ path: String, _ api: ApiPermission?, _ ids: SettingIds) throws -> IntegrationCommand {
        let o = try asObject(value, path, ["name", "description", "usage", "insert", "api", "widget"])
        let name = try asString(o["name"], "\(path).name", 24)
        if !rx(name, "^[a-z][a-z0-9-]{1,23}\\z") { throw fail("\(path).name", "invalid command name") }
        let description = try asString(o["description"], "\(path).description", maxCommandDescription)
        var usage: String?
        if let raw = o["usage"] {
            let u = try asString(raw, "\(path).usage", maxCommandUsage)
            if u != "/\(name)" && !u.hasPrefix("/\(name) ") { throw fail("\(path).usage", "must start with \"/\(name)\"") }
            usage = u
        }
        if [o["insert"], o["api"], o["widget"]].compactMap({ $0 }).count != 1 { throw fail(path, "needs exactly one of \"insert\" or \"api\"") }
        if o["widget"] != nil { throw fail("\(path).widget", widgetUnsupported) }
        if o["insert"] != nil {
            let insert = try asTemplate(o["insert"], "\(path).insert", maxInsert, ["room", "args"], settingIds: ids.text)
            return IntegrationCommand(name: name, description: description, usage: usage, insert: insert, api: nil)
        }
        let target = try asString(o["api"], "\(path).api", 32)
        guard api?.actions.contains(where: { $0.id == target }) == true else { throw fail("\(path).api", "no such action in permissions.api.actions") }
        return IntegrationCommand(name: name, description: description, usage: usage, insert: nil, api: target)
    }

    private static func validateAction(_ value: JSONValue?, _ path: String, _ ids: SettingIds) throws -> ComposerAction {
        let o = try asObject(value, path, ["id", "label", "icon", "insert"])
        let id = try asString(o["id"], "\(path).id", 32)
        if !rx(id, "^[a-z0-9][a-z0-9._-]{0,31}\\z") { throw fail("\(path).id", "invalid id") }
        let label = try asString(o["label"], "\(path).label", maxLabel)
        let insert = try asTemplate(o["insert"], "\(path).insert", maxInsert, ["room"], settingIds: ids.text)
        var icon: String?
        if let raw = o["icon"] {
            guard let s = plainString(raw), composerIconNames.contains(s) else {
                throw fail("\(path).icon", "must be one of \(composerIconNames.joined(separator: ", "))")
            }
            icon = s
        }
        return ComposerAction(id: id, label: label, icon: icon, insert: insert)
    }

    private static func validatePermissions(_ value: JSONValue?, _ path: String, _ ids: SettingIds) throws -> IntegrationPerms {
        let o = try asObject(value, path, IntegrationPerms.Capability.allCases.map(\.rawValue) + ["widget"])
        if o["widget"] != nil { throw fail("\(path).widget", widgetUnsupported) }
        // linkDetails first: link cards cross-check their `details` against it
        let details = try o["linkDetails"].map { try validateLinkDetails($0, "\(path).linkDetails", ids) }
        var linkCards: [LinkCardRule]?
        if let cards = o["linkCards"] {
            var list: [LinkCardRule] = []
            for (i, raw) in try asArray(cards, "\(path).linkCards", maxLinkRules).enumerated() {
                list.append(try validateLinkCard(raw, "\(path).linkCards[\(i)]", details, ids))
            }
            linkCards = list
        }
        for (i, lookup) in (details?.lookups ?? []).enumerated() where linkCards?.contains(where: { $0.details == lookup.id }) != true {
            throw fail("\(path).linkDetails.lookups[\(i)]", "no link card uses lookup \"\(lookup.id)\"")
        }
        var composerActions: [ComposerAction]?
        if let list = o["composerActions"] {
            var actions: [ComposerAction] = []
            for (i, raw) in try asArray(list, "\(path).composerActions", maxActions).enumerated() {
                actions.append(try validateAction(raw, "\(path).composerActions[\(i)]", ids))
            }
            if Set(actions.map(\.id)).count != actions.count { throw fail("\(path).composerActions", "duplicate action id") }
            composerActions = actions
        }
        // api first: commands cross-check their targets against it
        let api = try o["api"].map { try validateApi($0, "\(path).api", ids) }
        var commands: [IntegrationCommand]?
        if let list = o["commands"] {
            var found: [IntegrationCommand] = []
            for (i, raw) in try asArray(list, "\(path).commands", maxCommands).enumerated() {
                found.append(try validateCommand(raw, "\(path).commands[\(i)]", api, ids))
            }
            if Set(found.map(\.name)).count != found.count { throw fail("\(path).commands", "duplicate command name") }
            commands = found
        }
        return IntegrationPerms(linkCards: linkCards, linkDetails: details, composerActions: composerActions, commands: commands, api: api)
    }

    private static func validateIntegration(_ value: JSONValue?, _ path: String) throws -> Integration {
        let o = try asObject(value, path, ["id", "name", "description", "version", "icon", "permissions", "settings"])
        let id = try asString(o["id"], "\(path).id", 64)
        if !rx(id, "^[a-z0-9][a-z0-9._-]{0,63}\\z") { throw fail("\(path).id", "invalid id") }
        // Settings first: the permissions' templates may only use settings that exist
        let settings = try o["settings"].map { try validateSettings($0, "\(path).settings") }
        let name = try asString(o["name"], "\(path).name", maxName)
        let description = try asString(o["description"], "\(path).description", maxDescription)
        let version = try asString(o["version"], "\(path).version", maxVersion)
        let permissions = try validatePermissions(o["permissions"], "\(path).permissions", settingIds(of: settings))
        let icon = try o["icon"].map { try asHttpsURL($0, "\(path).icon") }
        // An empty list is the same as none; one canonical shape
        return Integration(id: id, name: name, description: description, version: version, icon: icon, permissions: permissions,
                           settings: (settings?.isEmpty ?? true) ? nil : settings)
    }

    /// Something this app does not know or does not do (an unknown key or value, a widget), as opposed to a plain mistake
    private static func looksNewer(_ error: String) -> Bool {
        error.hasSuffix(" unknown key") || error.contains(" must be one of ") || error.contains("widgets are not supported")
    }

    /// The entry's id and name for listing it, only when they are well-formed
    private static func describeRejected(_ value: JSONValue, _ index: Int, _ error: String) -> RejectedIntegration {
        let o = value.object
        let id = o?["id"]?.string.flatMap { rx($0, "^[a-z0-9][a-z0-9._-]{0,63}\\z") ? $0 : nil }
        let name = o?["name"]?.string.map { String(stripUnsafeChars($0).trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxName)) }
            .flatMap { $0.isEmpty ? nil : $0 }
        return RejectedIntegration(index: index, id: id, name: name, error: error,
                                   reason: looksNewer(error) ? RejectedIntegration.unsupported : RejectedIntegration.invalid)
    }

    /// Validates an already parsed value. Never throws. The repository itself (schema, key, serial, name, the list) must be
    /// valid or the whole file is refused; each integration is then checked on its own, and one this app can not use is listed
    /// in `rejected` instead of failing the rest.
    static func validate(_ raw: JSONValue) -> ValidationResult<RepoManifest> {
        do {
            let o = try asObject(raw, "repo", ["schema", "key", "serial", "name", "integrations"])
            guard o["schema"]?.number == Double(manifestSchema) else { throw fail("repo.schema", "must be \(manifestSchema)") }
            let key = try asString(o["key"], "repo.key", 44, min: 44)
            if !IntegrationSignature.isValidKey(key) { throw fail("repo.key", "must be base64 of a 32-byte public key") }
            guard let serial = o["serial"]?.number, serial == serial.rounded(.down), serial >= 1,
                  serial <= Double(IntegrationSignature.maxSerial) else {
                throw fail("repo.serial", "must be an integer from 1 to \(IntegrationSignature.maxSerial)")
            }
            let name = try asString(o["name"], "repo.name", maxRepoName)
            var integrations: [Integration] = []
            var rejected: [RejectedIntegration] = []
            var seen = Set<String>()
            for (i, entry) in try asArray(o["integrations"], "repo.integrations", maxIntegrations).enumerated() {
                let path = "repo.integrations[\(i)]"
                do {
                    let integration = try validateIntegration(entry, path)
                    // The first entry with an id wins; a later one with the same id is never offered
                    if !seen.insert(integration.id).inserted { throw fail("\(path).id", "duplicate integration id") }
                    integrations.append(integration)
                } catch let error as Fail {
                    rejected.append(describeRejected(entry, i, error.message))
                }
            }
            return .valid(RepoManifest(key: key, serial: Int(serial), name: name, integrations: integrations, rejected: rejected))
        } catch let error as Fail {
            return .invalid(error.message)
        } catch {
            return .invalid("invalid repository file")
        }
    }

    /// Size-checks and parses raw repo.json text, then validates it. Never throws.
    static func parseText(_ text: String) -> ValidationResult<RepoManifest> {
        if text.utf8.count > maxManifestBytes { return .invalid("repository file is too large (max 256 KB)") }
        guard let json = IntegrationNetwork.parseJSON(text) else { return .invalid("repository file is not valid JSON") }
        return validate(json)
    }
}
