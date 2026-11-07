import Foundation
import WizardChatCore

/// A bundled clip; the ids are what other clients know them by, and the files are `sb_<id>` in the app bundle
struct BuiltInClip {
    let id: String
    let name: String
    let emoji: String
    let durationMs: Int64

    var resource: String { "sb_" + id.replacingOccurrences(of: "-", with: "_") }
}

/// A custom clip of a personal or room board: stored in account data or room state
struct SoundboardSound: Equatable {
    let id: String
    let name: String
    let emoji: String?
    let url: String
    let mimetype: String
    let durationMs: Int64
    let size: Int64
    let volume: Float
}

/// What the UI lists: a bundled clip (`url` empty) or a custom one
struct SoundboardClip: Identifiable, Equatable {
    let id: String
    let name: String
    let emoji: String?
    let builtIn: Bool
    let url: String
    let mimetype: String
    let durationMs: Int64
    let volume: Float
    var resource: String?
}

/// What a received press asks for
struct SoundboardPress: Equatable {
    let id: String
    let name: String
    let emoji: String?
    let volume: Float
    let builtIn: Bool
    let url: String?
    let mimetype: String?
    let durationMs: Int64?
}

enum PlayResult: Equatable { case ok, disabled, notInCall, rateLimited, cooldown, error }

/// Soundboard rate limits: the sender limits itself and every receiver limits each sender again
final class SoundboardLimiter {
    private struct History {
        var times: [Int64] = []
        var perSound: [String: Int64] = [:]
    }

    private let minGapMs: Int64
    private let burst: Int
    private let windowMs: Int64
    private let perSoundCooldownMs: Int64
    private var senders: [String: History] = [:]

    init(minGapMs: Int64, burst: Int, windowMs: Int64, perSoundCooldownMs: Int64) {
        self.minGapMs = minGapMs
        self.burst = burst
        self.windowMs = windowMs
        self.perSoundCooldownMs = perSoundCooldownMs
    }

    /// What we allow ourselves: a new clip after 0.4 s, 5 per 10 s, 1 s cooldown per sound
    static func forSending() -> SoundboardLimiter {
        SoundboardLimiter(minGapMs: 400, burst: 5, windowMs: 10_000, perSoundCooldownMs: 1000)
    }

    /// Receivers are a little looser on the gap, since events arrive with network jitter
    static func forReceiving() -> SoundboardLimiter {
        SoundboardLimiter(minGapMs: 250, burst: 5, windowMs: 10_000, perSoundCooldownMs: 700)
    }

    /// Records the clip when allowed
    func check(_ senderId: String, _ soundKey: String, now: Int64 = SavedMessages.nowMs) -> PlayResult {
        var history = senders[senderId] ?? History()
        history.times.removeAll { now - $0 >= windowMs }
        history.perSound = history.perSound.filter { now - $0.value < windowMs }
        defer { senders[senderId] = history }
        if let last = history.times.last, now - last < minGapMs { return .rateLimited }
        if history.times.count >= burst { return .rateLimited }
        if let lastSame = history.perSound[soundKey], now - lastSame < perSoundCooldownMs { return .cooldown }
        history.times.append(now)
        history.perSound[soundKey] = now
        return .ok
    }

    func reset() { senders = [:] }
}

/// The soundboard's data formats, the web's `features/soundboard` (`types.ts`, `boards.ts`, `play.ts`, `receive.ts`)
enum SoundboardFormat {
    static let playType = Namespace.mudrixKey("soundboard.play")
    static let playTypes = [playType, Namespace.legacyMudrixKey("soundboard.play")]
    static let boardType = Namespace.mudrixKey("soundboard")
    static let legacyBoardType = Namespace.legacyMudrixKey("soundboard")

    static let maxDurationMs: Int64 = 5000
    static let maxSizeBytes: Int64 = 512 * 1024
    static let maxSounds = 32
    static let maxNameLength = 32

    static let builtIn: [BuiltInClip] = [
        BuiltInClip(id: "airhorn", name: "Air Horn", emoji: "📯", durationMs: 2009),
        BuiltInClip(id: "applause", name: "Applause", emoji: "👏", durationMs: 3451),
        BuiltInClip(id: "cheer", name: "Cheer", emoji: "🎉", durationMs: 3283),
        BuiltInClip(id: "clap", name: "Clapping", emoji: "🙌", durationMs: 1754),
        BuiltInClip(id: "giggle", name: "Giggles", emoji: "🤭", durationMs: 2176),
        BuiltInClip(id: "rimshot", name: "Rimshot", emoji: "🥁", durationMs: 937),
        BuiltInClip(id: "sad-trombone", name: "Sad Trombone", emoji: "😢", durationMs: 3782),
        BuiltInClip(id: "ding", name: "Ding", emoji: "🔔", durationMs: 1216),
        BuiltInClip(id: "whoosh", name: "Whoosh", emoji: "💨", durationMs: 2131),
        BuiltInClip(id: "pop", name: "Pop", emoji: "🫧", durationMs: 171),
        BuiltInClip(id: "tada", name: "Ta-da", emoji: "🎊", durationMs: 1398),
        BuiltInClip(id: "boing", name: "Boing", emoji: "🦘", durationMs: 906),
        BuiltInClip(id: "record-scratch", name: "Record Scratch", emoji: "💿", durationMs: 448),
        BuiltInClip(id: "crickets", name: "Crickets", emoji: "🦗", durationMs: 2832),
        BuiltInClip(id: "gong", name: "Gong", emoji: "🎶", durationMs: 3972),
        BuiltInClip(id: "drumroll", name: "Drum Roll", emoji: "🥁", durationMs: 3600),
        BuiltInClip(id: "sparkle", name: "Magic Sparkle", emoji: "✨", durationMs: 419),
        BuiltInClip(id: "honk", name: "Horn Honk", emoji: "🚲", durationMs: 1300),
    ]

    static let builtInClips: [SoundboardClip] = builtIn.map {
        SoundboardClip(id: $0.id, name: $0.name, emoji: $0.emoji, builtIn: true, url: "", mimetype: "audio/mpeg",
                       durationMs: $0.durationMs, volume: 1, resource: $0.resource)
    }

    static func builtInClip(_ id: String) -> SoundboardClip? {
        builtInClips.first { $0.id == id }
    }

    /// The three formats a clip may have, with the names servers and phones use for them
    static func normalizeMimetype(_ raw: String?) -> String? {
        let base = (raw ?? "").split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first ?? ""
        switch base.trimmingCharacters(in: .whitespaces).lowercased() {
        case "audio/mpeg", "audio/mp3": return "audio/mpeg"
        case "audio/ogg", "application/ogg": return "audio/ogg"
        case "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave": return "audio/wav"
        default: return nil
        }
    }

    private static func number(_ value: JSONValue?) -> Double? {
        guard let number = value?.number, number.isFinite else { return nil }
        return number
    }

    /// Keeps only well-formed clips with an allowed type, size and length
    static func parseBoard(_ raw: JSONValue?) -> [SoundboardSound] {
        guard let list = raw?["sounds"]?.array else { return [] }
        var seen = Set<String>()
        var out: [SoundboardSound] = []
        for entry in list {
            guard entry.object != nil,
                  let id = entry["id"]?.string, !id.isEmpty, !seen.contains(id),
                  let name = entry["name"]?.string, !name.isEmpty,
                  let url = entry["url"]?.string, url.hasPrefix("mxc://"),
                  let mimetype = normalizeMimetype(entry["mimetype"]?.string),
                  let duration = number(entry["durationMs"]), duration > 0,
                  let size = number(entry["size"]), size >= 0 else { continue }
            seen.insert(id)
            let emoji = entry["emoji"]?.string.flatMap { $0.isEmpty ? nil : String($0.prefix(16)) }
            let volume = min(max(number(entry["volume"]) ?? 1, 0), 1)
            out.append(SoundboardSound(
                id: id, name: String(name.prefix(maxNameLength)), emoji: emoji, url: url, mimetype: mimetype,
                durationMs: Int64(min(duration, Double(maxDurationMs))),
                size: Int64(min(size, Double(maxSizeBytes) * 2)), volume: Float(volume)))
        }
        return Array(out.prefix(maxSounds))
    }

    static func clip(_ sound: SoundboardSound) -> SoundboardClip {
        SoundboardClip(id: sound.id, name: sound.name, emoji: sound.emoji, builtIn: false, url: sound.url,
                       mimetype: sound.mimetype, durationMs: sound.durationMs, volume: sound.volume)
    }

    /// The content for a press: bundled clips carry only their id, the rest the `mxc://` URI
    static func playContent(_ clip: SoundboardClip) -> JSONValue {
        var sound: [String: JSONValue] = [
            "id": .string(clip.id),
            "name": .string(clip.name),
            "volume": .number(Double(min(max(clip.volume, 0), 1))),
        ]
        if let emoji = clip.emoji { sound["emoji"] = .string(emoji) }
        if clip.builtIn {
            sound["builtin"] = .bool(true)
        } else {
            sound["url"] = .string(clip.url)
            sound["mimetype"] = .string(clip.mimetype)
            sound["durationMs"] = .number(Double(clip.durationMs))
        }
        return .object(["sound": .object(sound)])
    }

    /// What a received press asks for, or nil when it is not an acceptable one
    static func parsePress(_ content: JSONValue?) -> SoundboardPress? {
        guard let sound = content?["sound"], sound.object != nil, let id = sound["id"]?.string else { return nil }
        let volume = Float(min(max(number(sound["volume"]) ?? 1, 0), 1))
        let name = sound["name"]?.string.map { String($0.prefix(64)) }.flatMap { $0.isEmpty ? nil : $0 } ?? id
        let emoji = sound["emoji"]?.string.map { String($0.prefix(16)) }
        if sound["builtin"]?.bool == true {
            guard let clip = builtInClip(id) else { return nil }
            return SoundboardPress(id: id, name: name, emoji: emoji, volume: volume, builtIn: true, url: nil,
                                   mimetype: clip.mimetype, durationMs: clip.durationMs)
        }
        guard let url = sound["url"]?.string, url.hasPrefix("mxc://"),
              let mimetype = normalizeMimetype(sound["mimetype"]?.string) else { return nil }
        let duration = number(sound["durationMs"]).map { Int64(min(max($0, 0), Double(maxDurationMs))) }
        return SoundboardPress(id: id, name: name, emoji: emoji, volume: volume, builtIn: false, url: url,
                               mimetype: mimetype, durationMs: duration)
    }
}

/// The call timer's text: `m:ss`, or `h:mm:ss` from an hour on; `formatElapsed` of the web's room list
enum CallTimer {
    static func format(_ elapsedMs: Int64) -> String {
        let total = max(elapsedMs / 1000, 0)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = String(format: "%02d", Int(total % 60))
        if hours > 0 { return "\(hours):\(String(format: "%02d", Int(minutes))):\(seconds)" }
        return "\(minutes):\(seconds)"
    }
}
