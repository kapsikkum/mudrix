import Foundation
import WizardChatCore

/// API actions: one fixed-shape POST to the single host the user approved. The UI shows `preview` and asks before `call`.
enum IntegrationApi {
    static let maxApiBodyBytes = 8 * 1024
    static let maxApiResponseBytes = 64 * 1024
    private static let maxResultLink = 500

    struct Context {
        var roomId: String
        /// The composer draft. For a command this equals `args`.
        var text: String
        /// Text after the slash command; empty for a menu action
        var args: String
        /// The integration's setting values; only choice values can appear in a body
        var settings: SettingValues = IntegrationSettings.none
    }

    enum Preview {
        case ok(url: String, host: String, path: String, body: String?)
        case error(String)
    }

    enum CallResult {
        case ok(link: String?)
        case error(String)
    }

    /// Builds exactly what will be sent. Placeholder values are substituted into the template's string values (as data, in one
    /// pass so inserted text is never re-expanded) and the whole object is then serialised, so quotes and newlines in user
    /// text can not break out of the JSON.
    static func preview(_ permissions: IntegrationPerms, _ action: ApiAction, _ ctx: Context) -> Preview {
        guard let api = permissions.api else { return .error("This integration has no API access") }
        let url = "https://\(api.host)\(action.path)"
        guard let parts = URLComponents(string: url) else { return .error("Invalid request URL") }
        if parts.host != api.host || parts.percentEncodedPath != action.path || parts.percentEncodedQuery != nil || parts.fragment != nil || parts.port != nil {
            return .error("Invalid request path")
        }
        var body: String?
        if let template = action.body {
            let values = ["room": ctx.roomId, "text": ctx.text, "args": ctx.args]
            var filled: [String: Any] = [:]
            for (key, value) in template { filled[key] = IntegrationSettings.render(value, vars: values, settings: ctx.settings) }
            guard let data = try? JSONSerialization.data(withJSONObject: filled, options: [.sortedKeys]) else { return .error("Invalid request body") }
            if data.count > maxApiBodyBytes { return .error("The message is too long to send (max 8 KB)") }
            body = String(decoding: data, as: UTF8.self)
        }
        return .ok(url: url, host: api.host, path: action.path, body: body)
    }

    /// The link only if it stays on the api host or one of the integration's own link-card hosts
    private static func safeResultLink(_ raw: JSONValue?, _ perms: IntegrationPerms) -> String? {
        guard let text = raw?.string, text.utf16.count <= maxResultLink, !IntegrationManifest.hasUnsafeChars(text),
              let parts = URLComponents(string: text), parts.scheme?.lowercased() == "https", parts.user == nil, parts.password == nil,
              parts.port == nil, let host = parts.host?.lowercased() else { return nil }
        var hosts = Set((perms.linkCards ?? []).flatMap(\.hosts))
        if let api = perms.api { hosts.insert(api.host) }
        guard hosts.contains(host) else { return nil }
        return text
    }

    /// Sends the request, only to the hosts in `allow`. Never throws; errors only ever name the host and status.
    static func call(_ permissions: IntegrationPerms, _ action: ApiAction, _ ctx: Context, allow: [String],
                     network: IntegrationNetwork = .shared) async -> CallResult {
        guard case .ok(let url, _, _, let body) = preview(permissions, action, ctx) else {
            if case .error(let message) = preview(permissions, action, ctx) { return .error(message) }
            return .error("Request failed")
        }
        let outcome = await network.fetch(IntegrationNetwork.Request(
            url: url, allow: allow, expect: .json, maxBytes: maxApiResponseBytes, post: true, jsonBody: body))
        switch outcome {
        case .failure(let failure):
            // An oversized answer, or one that is not JSON, still means the service responded; there is just no link to read
            if let reason = failure.reason, [.tooLarge, .invalid, .type].contains(reason) { return .ok(link: nil) }
            return .error(failure.error)
        case .success(let success):
            if let field = action.insertResultLink, let object = success.json?.object {
                return .ok(link: safeResultLink(object[field], permissions))
            }
            return .ok(link: nil)
        }
    }
}

/// Link details: what a lookup asks for, and the plain text taken out of the answer. Nothing here renders.
enum IntegrationDetails {
    private static let maxTitle = 120
    private static let maxDescription = 300
    private static let maxFact = 60

    struct Fact: Equatable {
        var label: String
        var value: String
    }

    struct Details: Equatable {
        var title: String?
        var description: String?
        var facts: [Fact]

        static let empty = Details(title: nil, description: nil, facts: [])
    }

    enum LookupUrl {
        case ok(String)
        case error(String)
    }

    /// The exact URL a lookup requests for these captures, or why there is none. Values are percent-encoded, so they can not add
    /// segments, a query or a fragment; a path that would still contain a "." or ".." segment is refused.
    static func buildLookupUrl(host: String, lookup: LinkLookup, captures: [String: String]) -> LookupUrl {
        guard let regex = try? NSRegularExpression(pattern: "\\{([a-z][a-z0-9_]{0,15})\\}") else { return .error("Invalid lookup path") }
        let ns = lookup.path as NSString
        var path = ""
        var last = 0
        for match in regex.matches(in: lookup.path, range: NSRange(location: 0, length: ns.length)) {
            path += ns.substring(with: NSRange(location: last, length: match.range.location - last))
            guard let value = captures[ns.substring(with: match.range(at: 1))] else { return .error("The link does not fill the lookup path") }
            path += encodeUriComponent(value)
            last = match.range.location + match.range.length
        }
        path += ns.substring(from: last)
        if path.components(separatedBy: "/").contains(where: { $0 == "." || $0 == ".." }) { return .error("Invalid lookup path") }
        let url = "https://\(host)\(path)"
        guard let parts = URLComponents(string: url) else { return .error("Invalid lookup URL") }
        if parts.host != host || parts.percentEncodedPath != path || parts.percentEncodedQuery != nil || parts.fragment != nil || parts.port != nil {
            return .error("Invalid lookup path")
        }
        return .ok(url)
    }

    /// Reads a dotted field from parsed JSON, own properties only
    private static func readField(_ json: JSONValue?, _ field: String) -> JSONValue? {
        var current = json
        for part in field.components(separatedBy: ".") {
            guard let object = current?.object, let next = object[part] else { return nil }
            current = next
        }
        return current
    }

    /// Plain, single-line, capped text; "" when nothing is left
    static func cleanText(_ value: String, _ max: Int) -> String {
        // Newlines are unsafe characters too, so turn whitespace into spaces before stripping the rest
        let spaced = value.unicodeScalars.map { $0.properties.isWhitespace || $0.value == 0xFEFF ? " " : String($0) }.joined()
        var s = IntegrationManifest.stripUnsafeChars(spaced)
        while s.contains("  ") { s = s.replacingOccurrences(of: "  ", with: " ") }
        s = s.trimmingCharacters(in: .whitespaces)
        return s.count > max ? String(s.prefix(max - 1)) + "\u{2026}" : s
    }

    private static func compact(_ value: Double, _ locale: Locale) -> String {
        let suffixes = ["", "K", "M", "B", "T"]
        var n = value
        var index = 0
        while abs(n) >= 1000, index < suffixes.count - 1 {
            n /= 1000
            index += 1
            // A value that rounds up to 1000 belongs to the next unit
            if abs((n * 10).rounded(.toNearestOrEven) / 10) >= 1000, index < suffixes.count - 1 {
                n /= 1000
                index += 1
            }
        }
        let format = NumberFormatter()
        format.locale = locale
        format.numberStyle = .decimal
        format.maximumFractionDigits = 1
        format.minimumFractionDigits = 0
        format.roundingMode = .halfEven
        return (format.string(from: NSNumber(value: n)) ?? "\(n)") + suffixes[index]
    }

    private static func parseDate(_ text: String, _ zone: TimeZone) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: text) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let date = plain.date(from: text) { return date }
        let local = DateFormatter()
        local.locale = Locale(identifier: "en_US_POSIX")
        local.timeZone = zone
        local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        if let date = local.date(from: text) { return date }
        // A bare date is read as UTC, like a browser does
        let bare = DateFormatter()
        bare.locale = Locale(identifier: "en_US_POSIX")
        bare.timeZone = TimeZone(identifier: "UTC")
        bare.dateFormat = "yyyy-MM-dd"
        return bare.date(from: text)
    }

    /// Formats a value for display, or "" when it cannot be shown in that format
    static func formatValue(_ value: JSONValue?, _ format: String, locale: Locale = .current, zone: TimeZone = .current) -> String {
        if format == "count" {
            guard let n = value?.number, n.isFinite else { return "" }
            return compact(n, locale)
        }
        if format == "date" {
            guard let text = value?.string, text.utf16.count <= 40, let date = parseDate(text, zone) else { return "" }
            let out = DateFormatter()
            out.locale = locale
            out.timeZone = zone
            out.dateStyle = .medium
            out.timeStyle = .none
            return out.string(from: date)
        }
        if let text = value?.string { return cleanText(text, maxFact) }
        if let n = value?.number, n.isFinite {
            return n == n.rounded(.down) && abs(n) < 1e15 ? String(Int64(n)) : "\(n)"
        }
        return ""
    }

    /// Picks the approved fields out of an answer. Missing, empty or unusable fields are left out, and so are the ones switched
    /// off in settings.
    static func extract(_ json: JSONValue?, _ lookup: LinkLookup, locale: Locale = .current, settings: SettingValues = IntegrationSettings.none,
                        zone: TimeZone = .current) -> Details {
        var title: String?
        var description: String?
        var facts: [Fact] = []
        if let field = lookup.title, let v = readField(json, field)?.string, !cleanText(v, maxTitle).isEmpty {
            title = cleanText(v, maxTitle)
        }
        if let field = lookup.description, IntegrationSettings.on(settings, lookup.descriptionIf),
           let v = readField(json, field)?.string, !cleanText(v, maxDescription).isEmpty {
            description = cleanText(v, maxDescription)
        }
        for fact in lookup.facts ?? [] where IntegrationSettings.on(settings, fact.ifToggle) {
            let value = formatValue(readField(json, fact.field), fact.format ?? "text", locale: locale, zone: zone)
            if !value.isEmpty { facts.append(Fact(label: fact.label, value: value)) }
        }
        return Details(title: title, description: description, facts: facts)
    }
}
