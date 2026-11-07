import Foundation
import WizardChatCore

/// One thing a person is playing or listening to (`io.github.kapsikkum.mudrix.activity`)
struct ProfileActivity: Equatable {
    let type: String
    let name: String
    let details: String
    /// Milliseconds since 1970, 0 when unknown
    let startedAt: Int64
    let expiresAt: Int64
}

/// What a profile shows beyond name and picture; `profileFields.ts` and `profileCosmetics.ts` in Swift
struct ExtendedProfile: Equatable {
    var bio = ""
    var pronouns: [String] = []
    var timezone: String?
    var activities: [ProfileActivity] = []
    var accent: String?
    var avatarDecoration: String?
    var nameplate: String?
    var profileFrame: String?
    var isMudrixUser = false
}

enum ProfileFields {
    static let bio = "m.biography"
    static let bioUnstable = "gay.fomx.biography"
    static let pronouns = "m.pronouns"
    static let pronounsUnstable = "io.fsky.nyx.pronouns"
    static let tz = "m.tz"
    static let bioKeys = [bio, bioUnstable]
    static let pronounKeys = [pronouns, pronounsUnstable]

    static let maxBioChars = 2048
    static let maxBioLines = 40
    static let maxPronounEntries = 5
    static let maxPronounChars = 32
    static let maxActivities = 3
    private static let maxActivityChars = 80

    private static func mudrix(_ name: String) -> [String] {
        [Namespace.mudrixKey(name), Namespace.legacyMudrixKey(name)]
    }

    static let accentKeys = mudrix("accent")
    static let decorationKeys = mudrix("avatar_decoration")
    static let nameplateKeys = mudrix("nameplate")
    static let frameKeys = mudrix("profile_frame")
    static let isUserKeys = mudrix("is_user")
    static let activityKeys = mudrix("activity")

    private static func first(_ raw: [String: JSONValue], _ keys: [String]) -> JSONValue? {
        for key in keys {
            if let value = raw[key], value != .null { return value }
        }
        return nil
    }

    private static func isControl(_ scalar: Unicode.Scalar) -> Bool {
        let value = scalar.value
        return value <= 0x09 || (0x0B...0x1F).contains(value) || (0x7F...0x9F).contains(value)
            || (0x202A...0x202E).contains(value) || (0x2066...0x2069).contains(value)
    }

    /// Control and bidi characters become spaces
    private static func stripControl(_ text: String) -> String {
        let space: Unicode.Scalar = " "
        var scalars = String.UnicodeScalarView()
        for scalar in text.unicodeScalars { scalars.append(isControl(scalar) ? space : scalar) }
        return String(scalars)
    }

    private static func collapseSpaces(_ text: String) -> String {
        text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// At most `max` code points
    private static func limit(_ text: String, _ max: Int) -> String {
        var scalars = String.UnicodeScalarView()
        scalars.append(contentsOf: text.unicodeScalars.prefix(max))
        return String(scalars)
    }

    private static func trimEnd(_ line: Substring) -> String {
        var text = line
        while let last = text.last, last.isWhitespace { text = text.dropLast() }
        return String(text)
    }

    /// CRLF to LF, control and bidi characters to spaces, blank runs collapsed, trimmed and capped
    static func sanitizeBio(_ text: String) -> String {
        let unified = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        var lines: [String] = []
        var blankRun = 0
        for raw in stripControl(unified).split(separator: "\n", omittingEmptySubsequences: false) {
            let line = trimEnd(raw)
            if line.isEmpty {
                blankRun += 1
                if blankRun > 1 { continue }
            } else {
                blankRun = 0
            }
            lines.append(line)
            if lines.count >= maxBioLines { break }
        }
        while let head = lines.first, head.isEmpty { lines.removeFirst() }
        while let tail = lines.last, tail.isEmpty { lines.removeLast() }
        return limit(lines.joined(separator: "\n"), maxBioChars)
    }

    private static func stripHtml(_ html: String) -> String {
        html
            .replacingOccurrences(of: "<\\s*(br|/p|/div|/li)\\b[^>]*>", with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&amp;", with: "&")
    }

    /// Plain text from an MSC4440 value (`{ "m.text": [{ body, mimetype? }] }`) or a bare string
    static func parseBio(_ value: JSONValue?) -> String {
        if let text = value?.string { return sanitizeBio(text) }
        guard case .array(let entries)? = value?["m.text"] else { return "" }
        var html = ""
        for entry in entries {
            if let bare = entry.string {
                let cleaned = sanitizeBio(bare)
                if !cleaned.isEmpty { return cleaned }
                continue
            }
            guard let body = entry["body"]?.string else { continue }
            if entry["mimetype"]?.string?.lowercased() == "text/html" {
                if html.isEmpty { html = sanitizeBio(stripHtml(body)) }
                continue
            }
            let cleaned = sanitizeBio(body)
            if !cleaned.isEmpty { return cleaned }
        }
        return html
    }

    static func bioValue(_ text: String) -> JSONValue {
        .object(["m.text": .array([.object(["body": .string(text)])])])
    }

    static func sanitizePronoun(_ text: String) -> String {
        limit(collapseSpaces(stripControl(text)), maxPronounChars)
    }

    static func parsePronouns(_ value: JSONValue?) -> [String] {
        guard case .array(let entries)? = value else { return [] }
        var out: [String] = []
        for entry in entries {
            guard let raw = entry.string ?? entry["summary"]?.string else { continue }
            let cleaned = sanitizePronoun(raw)
            if !cleaned.isEmpty, !out.contains(cleaned) { out.append(cleaned) }
            if out.count >= maxPronounEntries { break }
        }
        return out
    }

    static func pronounsValue(_ pronouns: [String]) -> JSONValue {
        .array(pronouns.map { .object(["language": .string("en"), "summary": .string($0)]) })
    }

    /// "she/her, they/them" to a list
    static func parsePronounInput(_ input: String) -> [String] {
        let parts = input.split(whereSeparator: { $0 == "," || $0 == ";" || $0 == "\n" })
        return parsePronouns(.array(parts.map { JSONValue.string(String($0)) }))
    }

    static func isValidTimeZone(_ tz: String?) -> Bool {
        guard let tz, !tz.isEmpty, tz.count <= 64 else { return false }
        return TimeZone(identifier: tz) != nil
    }

    /// `#rrggbb` in lower case from `rgb`, `#rgb`, `rrggbb` or `#rrggbb`
    static func normalizeHex(_ value: String?) -> String? {
        guard var hex = value?.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 3 || hex.count == 6, hex.allSatisfy({ $0.isHexDigit }) else { return nil }
        hex = hex.lowercased()
        if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
        return "#" + hex
    }

    private static func activityText(_ value: JSONValue?) -> String {
        limit(collapseSpaces(stripControl(value?.string ?? "")), maxActivityChars)
    }

    private static func positive(_ value: JSONValue?) -> Int64 {
        guard let number = value?.number, number > 0, number.isFinite else { return 0 }
        return Int64(number)
    }

    static func parseActivities(_ value: JSONValue?) -> [ProfileActivity] {
        let items: [JSONValue]
        switch value {
        case nil, .null?: items = []
        case .array(let list)?: items = list
        case let single?: items = [single]
        }
        var out: [ProfileActivity] = []
        for item in items {
            guard item.object != nil,
                  let type = item["type"]?.string, type == "playing" || type == "listening" else { continue }
            let name = activityText(item["name"])
            // No expiry is a client that does not renew it; showing nothing beats showing it forever
            let expires = positive(item["expires"])
            guard !name.isEmpty, expires > 0 else { continue }
            out.append(ProfileActivity(type: type, name: name, details: activityText(item["details"]),
                                       startedAt: positive(item["started"]), expiresAt: expires))
        }
        return Array(out.prefix(maxActivities))
    }

    /// The activities that have not run out yet
    static func live(_ activities: [ProfileActivity], now: Date = Date()) -> [ProfileActivity] {
        let ms = Int64(now.timeIntervalSince1970 * 1000)
        return activities.filter { $0.expiresAt > ms }
    }

    /// Only an id is read from a profile, never anything that could become a URL
    private static func cosmeticId(_ value: JSONValue?) -> String? {
        let id = (value?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, id.count <= 128, !id.contains("://"), !id.hasPrefix("{") else { return nil }
        return id
    }

    static func parse(_ raw: JSONValue?) -> ExtendedProfile {
        guard let object = raw?.object else { return ExtendedProfile() }
        var profile = ExtendedProfile()
        profile.bio = bioKeys.map { parseBio(object[$0]) }.first { !$0.isEmpty } ?? ""
        profile.pronouns = pronounKeys.map { parsePronouns(object[$0]) }.first { !$0.isEmpty } ?? []
        if let zone = object[tz]?.string, isValidTimeZone(zone) { profile.timezone = zone }
        profile.activities = parseActivities(first(object, activityKeys))
        profile.accent = normalizeHex(first(object, accentKeys)?.string)
        profile.avatarDecoration = cosmeticId(first(object, decorationKeys))
        profile.nameplate = cosmeticId(first(object, nameplateKeys))
        profile.profileFrame = cosmeticId(first(object, frameKeys))
        profile.isMudrixUser = first(object, isUserKeys)?.bool == true
        return profile
    }

    /// The clock in `tz` and how many hours it is ahead of (positive) or behind the viewer's zone
    static func localTime(_ tz: String, now: Date = Date(), viewer: TimeZone = .current) -> (time: String, offsetHours: Double)? {
        guard let zone = TimeZone(identifier: tz) else { return nil }
        let formatter = DateFormatter()
        formatter.timeZone = zone
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        let offset = Double(zone.secondsFromGMT(for: now) - viewer.secondsFromGMT(for: now)) / 3600
        return (formatter.string(from: now), offset)
    }

    // MARK: Known homeserver software

    struct KnownSoftware: Equatable {
        let label: String
        /// 0xRRGGBB
        let color: UInt32
        let glyph: String
    }

    private static let known: [String: KnownSoftware] = [
        "synapse": KnownSoftware(label: "Synapse", color: 0x0DBD8B, glyph: "S"),
        "dendrite": KnownSoftware(label: "Dendrite", color: 0x6C5CE7, glyph: "D"),
        "conduit": KnownSoftware(label: "Conduit", color: 0xF59E0B, glyph: "C"),
        "conduwuit": KnownSoftware(label: "Conduwuit", color: 0xEC008C, glyph: "Cw"),
        "continuwuity": KnownSoftware(label: "Continuwuity", color: 0xF472B6, glyph: "Ct"),
        "tuwunel": KnownSoftware(label: "Tuwunel", color: 0xF472B6, glyph: "T"),
        "grapevine": KnownSoftware(label: "Grapevine", color: 0xA855F7, glyph: "G"),
        "construct": KnownSoftware(label: "Construct", color: 0x64748B, glyph: "Co"),
        "telodendria": KnownSoftware(label: "Telodendria", color: 0x84CC16, glyph: "Te"),
        "palpo": KnownSoftware(label: "Palpo", color: 0xEF4444, glyph: "P"),
    ]

    /// Unknown servers get a neutral badge with their initial
    static func describeSoftware(_ name: String) -> KnownSoftware {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if let found = known[trimmed.lowercased()] { return found }
        let initial = trimmed.first.map { String($0).uppercased() } ?? "?"
        return KnownSoftware(label: String(trimmed.prefix(32)), color: 0x6B7280, glyph: initial)
    }

    static func serverName(of userId: String) -> String {
        userId.split(separator: ":", omittingEmptySubsequences: false).dropFirst().joined(separator: ":")
    }

    // MARK: Private notes (`user_notes` account data)

    static let maxNoteLength = 1000
    static let notesType = Namespace.mudrixKey("user_notes")
    static let legacyNotesType = Namespace.legacyMudrixKey("user_notes")

    static func parseNotes(_ content: JSONValue?) -> [String: String] {
        guard let notes = content?["notes"]?.object else { return [:] }
        var out: [String: String] = [:]
        for (id, value) in notes {
            if let text = value.string, !text.isEmpty { out[id] = String(text.prefix(maxNoteLength)) }
        }
        return out
    }

    static func notesValue(_ notes: [String: String]) -> JSONValue {
        .object(["notes": .object(notes.mapValues { JSONValue.string($0) })])
    }
}
