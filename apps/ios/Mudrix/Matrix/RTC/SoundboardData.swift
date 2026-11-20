import Foundation
import MudrixCore

/// A bundled clip of the pre-MSC4577 board; the ids are what 26.12.4 clients know them by, and the files are `sb_<id>` in the app bundle
struct BuiltInClip {
    let id: String
    let name: String
    let emoji: String
    let durationMs: Int64

    var resource: String { "sb_" + id.replacingOccurrences(of: "-", with: "_") }
}

/// A clip of a pack as the editor works on it; `id` is the shortcode MSC4577 sends
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

/// What the UI lists: a clip of a core pack (`builtIn` for the standard sounds)
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
    var size: Int64?
    /// The pack the clip came from, for editing; nil for the standard sounds
    var packRoomId: String?
    var packStateKey: String?

    init(id: String, name: String, emoji: String?, builtIn: Bool, url: String, mimetype: String,
         durationMs: Int64, volume: Float, resource: String? = nil, size: Int64? = nil,
         packRoomId: String? = nil, packStateKey: String? = nil) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.builtIn = builtIn
        self.url = url
        self.mimetype = mimetype
        self.durationMs = durationMs
        self.volume = volume
        self.resource = resource
        self.size = size
        self.packRoomId = packRoomId
        self.packStateKey = packStateKey
    }
}

/// The payload of the pre-MSC4577 press, still accepted from 26.12.4 clients
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

enum PlayResult: Equatable { case ok, disabled, notInCall, rateLimited, cooldown, error, roomDisabled, forbidden }

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

/// The MSC4577 wire format and the core pack mapping. A press is
/// `{ url, shortcode, org.wizardchat.emoji? }` on the LiveKit data topic `moe.crafty.soundboard`,
/// at most 1024 bytes. Packs are read and written through the core's sound pack API.
enum SoundboardFormat {
    /// The standard LiveKit data topic (MSC4577)
    static let topic = "moe.crafty.soundboard"
    /// The old Mudrix topic and room event, read for 26.12.4 clients
    static let playType = Namespace.mudrixKey("soundboard.play")
    static let playTypes = [playType, Namespace.legacyMudrixKey("soundboard.play")]

    static let emojiKey = "org.wizardchat.emoji"
    static let maxMessageBytes = 1024
    static let maxShortcodeBytes = 100
    static let maxEmojiBytes = 32

    /// The limits of the core's pack API; every client's clip is held to them
    static let maxDurationMs: Int64 = 15_000
    static let maxSizeBytes: Int64 = 1024 * 1024
    static let maxSounds = 32
    static let maxNameLength = 32

    /// The 26.12.4 built-ins, kept only to play what an old client sends
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

    /// The three formats the pre-MSC4577 clients know, with the names servers and phones use for them
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

    private static func readable(_ shortcode: String) -> String {
        switch shortcode {
        case "applause": return "Applause"
        case "laugh": return "Laughter"
        case "rimshot": return "Ba-dum-tss"
        case "drumroll": return "Drum roll"
        case "tada": return "Ta-da"
        case "airhorn": return "Air horn"
        case "crickets": return "Crickets"
        case "sad_trombone": return "Sad trombone"
        default:
            return shortcode.replacingOccurrences(of: "_", with: " ")
                .replacingOccurrences(of: "-", with: " ").capitalized
        }
    }

    /// A core pack sound as the editor works on it
    static func sound(_ core: MudrixCore.SoundboardSound) -> SoundboardSound {
        SoundboardSound(id: core.shortcode, name: core.body.flatMap { $0.isEmpty ? nil : $0 } ?? readable(core.shortcode),
                        emoji: core.emoji, url: core.url, mimetype: core.mimetype ?? "audio/mpeg",
                        durationMs: Int64(core.durationMs ?? 0), size: Int64(core.size ?? 0), volume: 1)
    }

    /// A UI sound as the core saves it
    static func coreSound(_ sound: SoundboardSound) -> MudrixCore.SoundboardSound {
        MudrixCore.SoundboardSound(shortcode: sound.id, url: sound.url,
                                   body: sound.name.isEmpty ? nil : sound.name, emoji: sound.emoji,
                                   mimetype: sound.mimetype, size: sound.size > 0 ? Int(sound.size) : nil,
                                   durationMs: Int(sound.durationMs))
    }

    /// A core pack sound as the UI lists it
    static func clip(_ core: MudrixCore.SoundboardSound, builtIn: Bool = false, pack: MudrixCore.SoundPack? = nil) -> SoundboardClip {
        SoundboardClip(id: core.shortcode,
                       name: core.body.flatMap { $0.isEmpty ? nil : $0 } ?? readable(core.shortcode),
                       emoji: core.emoji, builtIn: builtIn, url: core.url, mimetype: core.mimetype ?? "audio/mpeg",
                       durationMs: Int64(core.durationMs ?? 0), volume: 1, resource: nil,
                       size: core.size.map { Int64($0) }, packRoomId: pack?.roomId, packStateKey: pack?.stateKey)
    }

    /// The clips of a core pack
    static func clips(_ pack: MudrixCore.SoundPack) -> [SoundboardClip] {
        pack.sounds.map { clip($0, builtIn: pack.source == .builtIn, pack: pack) }
    }

    /// A UI sound as the editor previews it
    static func clip(_ sound: SoundboardSound) -> SoundboardClip {
        SoundboardClip(id: sound.id, name: sound.name, emoji: sound.emoji, builtIn: false, url: sound.url,
                       mimetype: sound.mimetype, durationMs: sound.durationMs, volume: sound.volume,
                       size: sound.size)
    }

    /// The MSC4577 payload of a press
    static func message(_ clip: SoundboardClip) -> [String: JSONValue] {
        var message: [String: JSONValue] = ["url": .string(clip.url),
                                            "shortcode": .string(String(clip.id.prefix(maxShortcodeBytes)))]
        if let emoji = clip.emoji, emoji.utf8.count <= maxEmojiBytes { message[emojiKey] = .string(emoji) }
        return message
    }

    /// The old payload, sent as a silent fallback on the data channel so 26.12.4 clients can fetch the same file
    static func legacyMessage(_ clip: SoundboardClip) -> JSONValue {
        var sound: [String: JSONValue] = [
            "id": .string(clip.id),
            "name": .string(clip.name),
            "volume": .number(1),
            "url": .string(clip.url),
            "mimetype": .string(normalizeMimetype(clip.mimetype) ?? "audio/mpeg"),
            "durationMs": .number(Double(min(clip.durationMs, 5000))),
        ]
        if let emoji = clip.emoji { sound["emoji"] = .string(emoji) }
        return .object(["sound": .object(sound)])
    }

    struct Play: Equatable {
        let url: String
        let shortcode: String?
        let emoji: String?
    }

    /// A press on the standard topic, or nil when it is not an acceptable one
    static func parsePlay(_ data: Data) -> Play? {
        guard data.count <= maxMessageBytes,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let url = object["url"] as? String, url.hasPrefix("mxc://") else { return nil }
        let shortcode = (object["shortcode"] as? String).flatMap { $0.utf8.count <= maxShortcodeBytes ? $0 : nil }
        let emoji = (object[emojiKey] as? String).flatMap { $0.utf8.count <= maxEmojiBytes ? $0 : nil }
        return Play(url: url, shortcode: shortcode, emoji: emoji)
    }

    /// What a received old press asks for, or nil when it is not an acceptable one
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
