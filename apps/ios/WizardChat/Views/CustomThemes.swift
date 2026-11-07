import Foundation
import SwiftUI
import WizardChatCore

/// The nine colours a user picks for a custom theme (`#rrggbb`); everything else is derived
struct ThemeSpec: Equatable {
    var bgPrimary: String
    var bgSecondary: String
    var bgTertiary: String
    var accent: String
    var textPrimary: String
    var textMuted: String
    var border: String
    var msgMineBg: String
    var msgOtherBg: String

    /// The colours by their key in the synced event and in a shared theme
    static let keys = ["bgPrimary", "bgSecondary", "bgTertiary", "accent", "textPrimary", "textMuted",
                       "border", "msgMineBg", "msgOtherBg"]

    /// What a new theme starts from when there is nothing to copy
    static let starter = ThemeSpec(
        bgPrimary: "#1a1b1e", bgSecondary: "#131416", bgTertiary: "#232428", accent: "#5865f2",
        textPrimary: "#dbdee1", textMuted: "#949ba4", border: "#2b2d31",
        msgMineBg: "#2e3036", msgOtherBg: "#131416")

    subscript(key: String) -> String {
        get {
            switch key {
            case "bgPrimary": return bgPrimary
            case "bgSecondary": return bgSecondary
            case "bgTertiary": return bgTertiary
            case "accent": return accent
            case "textPrimary": return textPrimary
            case "textMuted": return textMuted
            case "border": return border
            case "msgMineBg": return msgMineBg
            case "msgOtherBg": return msgOtherBg
            default: return ""
            }
        }
        set {
            switch key {
            case "bgPrimary": bgPrimary = newValue
            case "bgSecondary": bgSecondary = newValue
            case "bgTertiary": bgTertiary = newValue
            case "accent": accent = newValue
            case "textPrimary": textPrimary = newValue
            case "textMuted": textMuted = newValue
            case "border": border = newValue
            case "msgMineBg": msgMineBg = newValue
            case "msgOtherBg": msgOtherBg = newValue
            default: break
            }
        }
    }

    var json: JSONValue {
        var fields: [String: JSONValue] = [:]
        for key in Self.keys { fields[key] = .string(self[key]) }
        return .object(fields)
    }

    /// The colours of a theme in editable form (used to start a custom theme from it)
    static func of(_ theme: WizardTheme) -> ThemeSpec {
        ThemeSpec(
            bgPrimary: ThemeDerive.hexOf(theme.bgPrimary),
            bgSecondary: ThemeDerive.hexOf(theme.bgSecondary),
            bgTertiary: ThemeDerive.hexOf(theme.bgTertiary),
            accent: ThemeDerive.hexOf(theme.accent),
            textPrimary: ThemeDerive.hexOf(theme.textPrimary),
            textMuted: ThemeDerive.hexOf(theme.textMuted),
            border: ThemeDerive.hexOf(theme.border),
            msgMineBg: ThemeDerive.hexOf(theme.msgMineBg),
            msgOtherBg: ThemeDerive.hexOf(theme.msgOtherBg))
    }
}

/// A theme made by the user: a name and a handful of colours. Chosen as `custom:<id>`.
struct CustomTheme: Equatable, Identifiable {
    var id: String
    var name: String
    var colors: ThemeSpec

    var themeName: String { CustomThemes.prefix + id }

    var json: JSONValue {
        .object(["id": .string(id), "name": .string(name), "colors": colors.json])
    }
}

/// Custom themes, compatible with the web (`theme/customThemes.ts`): the same limits, ids and shared-theme format
enum CustomThemes {
    static let prefix = "custom:"
    static let limit = 20
    static let maxNameLength = 40

    static func isCustomName(_ name: String) -> Bool {
        name.hasPrefix(prefix)
    }

    static func isValidId(_ id: String) -> Bool {
        let count = id.utf8.count
        guard count >= 6 && count <= 32 else { return false }
        return id.utf8.allSatisfy { ch in (ch >= 48 && ch <= 57) || (ch >= 97 && ch <= 122) }
    }

    /// Whether `value` is the name of a custom theme (`custom:` and an id), whether or not it exists
    static func isCustomThemeName(_ value: String) -> Bool {
        value.hasPrefix(prefix) && isValidId(String(value.dropFirst(prefix.count)))
    }

    static func newId() -> String {
        var id = ""
        for _ in 0..<6 {
            let byte = UInt8.random(in: 0...255)
            id += byte < 16 ? "0" + String(byte, radix: 16) : String(byte, radix: 16)
        }
        return id
    }

    static func cleanName(_ raw: String) -> String {
        let words = raw.split(whereSeparator: { $0.isWhitespace })
        return String(words.joined(separator: " ").prefix(maxNameLength))
    }

    private static func colorsOf(_ raw: JSONValue?) -> ThemeSpec? {
        guard let fields = SettingsSync.object(raw) else { return nil }
        var spec = ThemeSpec.starter
        for key in ThemeSpec.keys {
            guard let text = fields[key]?.string, ThemeDerive.isHexColor(text) else { return nil }
            spec[key] = text.lowercased()
        }
        return spec
    }

    /// Keeps well-formed custom themes only (used for synced and stored data alike)
    static func sanitize(_ raw: JSONValue?) -> [CustomTheme] {
        guard case .array(let list)? = raw else { return [] }
        var out: [CustomTheme] = []
        var seen = Set<String>()
        for entry in list {
            if out.count >= limit { break }
            guard let fields = SettingsSync.object(entry),
                  let id = fields["id"]?.string,
                  isValidId(id), !seen.contains(id),
                  let colors = colorsOf(fields["colors"]) else { continue }
            let name = cleanName(fields["name"]?.string ?? "")
            if name.isEmpty { continue }
            seen.insert(id)
            out.append(CustomTheme(id: id, name: name, colors: colors))
        }
        return out
    }

    static func toJson(_ themes: [CustomTheme]) -> JSONValue {
        .array(themes.map { $0.json })
    }

    /// A theme pasted from another person: `{ "name": "...", "colors": { ... } }`
    static func parseShared(_ text: String) -> (name: String, colors: ThemeSpec)? {
        guard let data = text.data(using: .utf8),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data),
              let fields = SettingsSync.object(value),
              let colors = colorsOf(fields["colors"]) else { return nil }
        let name = cleanName(fields["name"]?.string ?? "")
        if name.isEmpty { return nil }
        return (name, colors)
    }

    /// The text of "Copy to share"
    static func serialize(_ theme: CustomTheme) -> String {
        let nameData = (try? JSONEncoder().encode(theme.name)) ?? Data("\"\"".utf8)
        let name = String(decoding: nameData, as: UTF8.self)
        var lines = ["{", "  \"name\": \(name),", "  \"colors\": {"]
        let keys = ThemeSpec.keys
        for (index, key) in keys.enumerated() {
            let comma = index == keys.count - 1 ? "" : ","
            lines.append("    \"\(key)\": \"\(theme.colors[key])\"\(comma)")
        }
        lines.append("  }")
        lines.append("}")
        return lines.joined(separator: "\n")
    }

    /// The theme `name` refers to, if it is a custom theme in `themes`
    static func find(_ name: String, in themes: [CustomTheme]) -> CustomTheme? {
        guard isCustomName(name) else { return nil }
        return themes.first { $0.themeName == name }
    }
}
