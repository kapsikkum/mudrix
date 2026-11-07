import Foundation
import WizardChatCore

/// The sounds the app plays; the ids are the web's (`util/notificationSounds.ts`)
enum SoundKind: String, CaseIterable {
    case message, mention, ring, ringback
    case callEnd = "callend"
    case mute, unmute
    case cameraOn = "camera-on"
    case cameraOff = "camera-off"
    case join, leave, moved
    case watchTogetherStart = "watch-together-start"

    var id: String { rawValue }

    /// The key of its name in the translations
    var labelKey: String {
        switch self {
        case .message: return "settings.voice.sound.message"
        case .mention: return "settings.voice.sound.mention"
        case .ring: return "settings.voice.sound.ring"
        case .ringback: return "settings.voice.sound.ringback"
        case .callEnd: return "settings.voice.sound.callend"
        case .mute: return "settings.voice.sound.mute"
        case .unmute: return "settings.voice.sound.unmute"
        case .cameraOn: return "settings.voice.sound.cameraOn"
        case .cameraOff: return "settings.voice.sound.cameraOff"
        case .join: return "settings.voice.sound.join"
        case .leave: return "settings.voice.sound.leave"
        case .moved: return "settings.voice.sound.moved"
        case .watchTogetherStart: return "settings.voice.sound.watchTogetherStart"
        }
    }

    /// Whether the "Notification sounds" switch turns it off
    var gated: Bool {
        switch self {
        case .message, .mention, .ring, .ringback, .callEnd, .join, .leave: return true
        default: return false
        }
    }

    /// Whether the volume slider sets its level; the sounds that answer something you did play at a fixed one
    var atSliderVolume: Bool {
        switch self {
        case .message, .mention, .ring, .ringback, .callEnd: return true
        default: return false
        }
    }

    /// The file name part: `camera-on` is `camera_on`
    var fileName: String { rawValue.replacingOccurrences(of: "-", with: "_") }

    /// The sounds the picker lists: nothing moves people between voice channels on iOS
    static var pickable: [SoundKind] { allCases.filter { $0 != .moved } }
}

/// A set of sounds; `files` maps a sound to its file in the bundle (no extension)
struct SoundPack {
    let id: String
    let name: String
    let category: String
    let files: [SoundKind: String]
}

/// Sound packs, the web's `SOUND_PACKS` with the files of `packages/sounds/raw` as flat resources
/// (`snd_<pack>_<sound>`). A pack that lacks a sound uses the app's own (voice sounds) or the default
/// pack's (calls).
enum SoundPacks {
    static let defaultId = "megadrive2"
    static let off = "off"
    static let categories = ["mudrix", "clients"]

    private static func mudrixPack(_ id: String, _ name: String) -> SoundPack {
        var files: [SoundKind: String] = [:]
        for kind in SoundKind.allCases { files[kind] = "snd_\(id)_\(kind.fileName)" }
        return SoundPack(id: id, name: name, category: "mudrix", files: files)
    }

    private static func clientPack(_ id: String, _ name: String, _ kinds: [SoundKind], alert: Bool = false) -> SoundPack {
        var files: [SoundKind: String] = [:]
        for kind in kinds { files[kind] = alert ? "alert" : "snd_\(id)_\(kind.fileName)" }
        return SoundPack(id: id, name: name, category: "clients", files: files)
    }

    static let all: [SoundPack] = [
        mudrixPack("bloop", "Bloop"),
        mudrixPack("glass", "Glass"),
        mudrixPack("warm", "Warm"),
        mudrixPack("megadrive", "Slap"),
        mudrixPack("nes", "Overworld"),
        mudrixPack("megadrive2", "Velvet"),
        mudrixPack("nes2", "Shuffle"),
        mudrixPack("sms", "Chirp"),
        clientPack("wizardchat", "WizardChat", [.message], alert: true),
        clientPack("element", "Element", [.message, .ring, .ringback, .callEnd]),
        clientPack("cinny", "Cinny", [.message, .mention]),
        clientPack("fluffychat", "FluffyChat", [.message, .mention, .ring, .callEnd]),
        clientPack("commet", "Commet", [.message, .callEnd]),
        clientPack("lightning", "Lightning", [.message, .mention]),
    ]

    /// The packs the picker lists. Cinny and Commet only ship Ogg files, which iOS cannot play.
    static var playable: [SoundPack] {
        all.filter { pack in pack.files.values.contains { url(for: $0) != nil } }
    }

    /// The app's own voice sounds, used when a pack does not replace one
    private static let builtin: [SoundKind: String] = [
        .mute: "mute",
        .unmute: "unmute",
        .cameraOn: "camera_on",
        .cameraOff: "camera_off",
        .join: "call_join",
        .leave: "call_leave",
        .watchTogetherStart: "watch_together_start",
    ]

    /// A removed or unknown pack id reads as the default pack
    static func named(_ id: String?) -> SoundPack {
        all.first { $0.id == id } ?? all.first { $0.id == defaultId }!
    }

    /// The file name (no extension) of a sound for a pack. Mentions fall back to the pack's message sound;
    /// call sounds to the default pack's file; voice sounds to the app's own.
    static func resource(_ packId: String?, _ kind: SoundKind) -> String? {
        let chosen = named(packId)
        if let file = chosen.files[kind] { return file }
        if kind == .mention { return chosen.files[.message] }
        if kind == .ring || kind == .ringback || kind == .callEnd { return named(defaultId).files[kind] }
        return builtin[kind]
    }

    /// The pack that plays for a sound: its override, else the main pack; nil means the sound is off
    static func resolve(_ kind: SoundKind, mainPack: String, overrides: [String: String]) -> String? {
        let chosen = overrides[kind.id]
        if chosen == off { return nil }
        // An override naming a removed pack counts as unset
        var override: String?
        if let chosen, all.contains(where: { $0.id == chosen }) { override = chosen }
        return named(override ?? mainPack).id
    }

    /// Volume of the sounds that answer something you did, whatever the slider says
    static let feedbackVolume: Float = 0.5

    /// 0...1 for a sound at a slider position of 0...100
    static func volume(_ kind: SoundKind, slider: Double) -> Float {
        kind.atSliderVolume ? Float(min(max(slider, 0), 100) / 100) : feedbackVolume
    }

    /// Formats `AVAudioPlayer` plays; `.ogg` is left out on purpose
    private static let playableExtensions = ["wav", "mp3", "m4a", "caf", "aiff"]

    /// The extensions a notification may use as its own sound (linear PCM and similar containers)
    private static let notificationExtensions = ["wav", "caf", "aiff"]

    /// The bundled file for a resource name, in any format the app can play
    static func url(for resource: String) -> URL? {
        for ext in playableExtensions {
            if let url = Bundle.main.url(forResource: resource, withExtension: ext) { return url }
        }
        return nil
    }

    /// The file name with extension if iOS can use it as a notification sound, else nil
    static func notificationFileName(for resource: String) -> String? {
        for ext in notificationExtensions where Bundle.main.url(forResource: resource, withExtension: ext) != nil {
            return "\(resource).\(ext)"
        }
        return nil
    }

    private static func isPackIdCharacter(_ scalar: Unicode.Scalar) -> Bool {
        (scalar >= "a" && scalar <= "z") || (scalar >= "0" && scalar <= "9") || scalar == "_" || scalar == "-"
    }

    /// `^[a-z0-9_-]{0,40}$`
    static func isPackId(_ value: String?) -> Bool {
        guard let value, value.unicodeScalars.count <= 40 else { return false }
        return value.unicodeScalars.allSatisfy(isPackIdCharacter)
    }

    /// Keeps the sounds this version knows, each with a pack id or "off"; nil when `raw` is not an object
    static func sanitizeOverrides(_ raw: JSONValue?) -> [String: String]? {
        guard let input = raw?.object else { return nil }
        var out: [String: String] = [:]
        for kind in SoundKind.allCases {
            guard let value = input[kind.id]?.string, !value.isEmpty, isPackId(value) else { continue }
            out[kind.id] = value
        }
        return out
    }

    static func overridesJson(_ overrides: [String: String]) -> JSONValue {
        var out: [String: JSONValue] = [:]
        for kind in SoundKind.allCases {
            if let value = overrides[kind.id] { out[kind.id] = .string(value) }
        }
        return .object(out)
    }
}
