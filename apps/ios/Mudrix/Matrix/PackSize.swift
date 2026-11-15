import Foundation
import MudrixCore

/// How big a pack's state event may get, when the editor warns, and how a too big pack is split: the numbers and
/// rules of the web's `packSize.ts` and Android's `matrix/PackSize.kt`
enum PackSize {
    /// Matrix caps a whole event at 65,536 bytes of canonical JSON
    static let eventCapBytes = 65536
    /// What the pack content may take, leaving room for the envelope
    static let budgetBytes = 60 * 1024
    /// The meter warns from this share of the budget
    static let warnRatio = 0.8

    enum Level: Equatable { case ok, near, over }

    /// The bytes of the pack content as UTF-8 JSON, which is what the server counts
    static func contentBytes(_ content: [String: Any]) -> Int {
        jsonBytes(content)
    }

    private static func jsonBytes(_ value: Any) -> Int {
        if let text = value as? String { return jsonBytes(any: text) }
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.withoutEscapingSlashes]) else { return 0 }
        return data.count
    }

    /// A bare string is not a JSON document for `JSONSerialization`; it is its quoted, escaped form
    private static func jsonBytes(any text: String) -> Int {
        guard let data = try? JSONSerialization.data(withJSONObject: [text], options: [.withoutEscapingSlashes]) else { return 0 }
        // `["…"]` is the string plus two brackets
        return max(data.count - 2, 0)
    }

    /// Where `bytes` stands against `cap`
    static func level(bytes: Int, cap: Int = budgetBytes) -> Level {
        if bytes > cap { return .over }
        if Double(bytes) > Double(cap) * warnRatio { return .near }
        return .ok
    }

    /// One decimal under 10 KB and whole kilobytes above, like the web's `formatKb`
    static func formatKb(_ bytes: Int) -> String {
        bytes < 10 * 1024 ? String(format: "%.1f KB", Double(bytes) / 1024) : String(format: "%.0f KB", Double(bytes) / 1024)
    }

    /// The share of the budget used, 0...1 for a meter
    static func fraction(bytes: Int, cap: Int = budgetBytes) -> Double {
        min(max(Double(bytes) / Double(max(cap, 1)), 0), 1)
    }

    /// The bytes one image takes in the event: its shortcode as a key, its entry and the separators
    static func entryBytes(shortcode: String, entry: Any) -> Int {
        jsonBytes(any: shortcode) + 1 + jsonBytes(entry) + 1
    }

    /// The bytes one new image will add, taking an `mxc://` address of typical length on a server
    static func estimateEntryBytes(shortcode: String, homeserverDomain: String) -> Int {
        let entry: [String: Any] = [
            "url": "mxc://\(homeserverDomain)/\(String(repeating: "x", count: 24))",
            "body": shortcode,
            "info": ["w": 1024, "h": 1024, "mimetype": "image/png"] as [String: Any],
        ]
        return entryBytes(shortcode: shortcode, entry: entry)
    }

    /// Splits a pack into packs that each fit within `budget` bytes: the same header (name, usage, ...) on every
    /// part and a share of the images, in shortcode order. A pack that fits comes back as it is, once.
    static func split(_ content: [String: Any], budget: Int = budgetBytes) -> [[String: Any]] {
        let images = content["images"] as? [String: Any] ?? [:]
        var header = content
        header["images"] = [String: Any]()
        let headerBytes = contentBytes(header) + 32
        var chunks: [[String: Any]] = []
        var current: [String: Any] = [:]
        var used = headerBytes
        for key in images.keys.sorted() {
            guard let entry = images[key] else { continue }
            let bytes = entryBytes(shortcode: key, entry: entry)
            if used + bytes > budget && !current.isEmpty {
                chunks.append(current)
                current = [:]
                used = headerBytes
            }
            current[key] = entry
            used += bytes
        }
        if !current.isEmpty || chunks.isEmpty { chunks.append(current) }
        return chunks.map { chunk in
            var part = content
            part["images"] = chunk
            return part
        }
    }

    /// `Name (2)` for part 2 of several; the name itself when there is one part
    static func numberedName(_ name: String, index: Int, total: Int) -> String {
        total > 1 ? "\(name) (\(index + 1))" : name
    }

    /// The state key of part `index` of a pack saved as `stateKey`: the first part keeps it
    static func partKey(_ stateKey: String, index: Int) -> String {
        index == 0 ? stateKey : "\(stateKey)_\(index + 1)"
    }

    /// The server refused the event for its size (`M_TOO_LARGE`)
    static func isTooLarge(_ error: Error) -> Bool {
        if let wizard = error as? WizardError, wizard.errcode == "M_TOO_LARGE" { return true }
        let text = error.localizedDescription
        return text.range(of: "M_TOO_LARGE|too large", options: [.regularExpression, .caseInsensitive]) != nil
    }
}
