import Foundation
import WizardChatCore

/// One cosmetic kind, in the order Settings lists them (`cosmeticPacks.ts`)
enum CosmeticKind: String, CaseIterable, Hashable, Identifiable {
    case decoration, effect, nameplate
    case profileFrame = "profile_frame"

    var id: String { rawValue }

    /// The locale key of the kind's plural name in Settings > Cosmetics
    var titleKey: String { "settings.cosmetics.kindPlural.\(rawValue)" }
}

/// One piece of a profile frame (`CosmeticFramePiece` in `cosmeticPacks.ts`)
struct CosmeticFramePiece: Equatable {
    let url: String
    let pos: String
    let layer: String?
}

/// A stored cosmetic, either a built-in id, an `mxc://` value or the object form a nameplate or frame may use
enum CosmeticValue: Equatable {
    case id(String)
    case nameplate(url: String, palette: String?)
    case frame(url: String, pieces: [CosmeticFramePiece])

    /// The URL or built-in id the value names
    var url: String {
        switch self {
        case .id(let url): return url
        case .nameplate(let url, _): return url
        case .frame(let url, _): return url
        }
    }
}

/// One cosmetic item of a pack
struct CosmeticPackItem: Equatable {
    let shortcode: String
    let name: String
    let url: String
    let kind: CosmeticKind
    let palette: String?
    let pieces: [CosmeticFramePiece]
    var intro: String? = nil
}

/// A room's or the account's cosmetic pack
struct CosmeticPack: Equatable {
    let roomId: String?
    let stateKey: String
    let displayName: String
    let attribution: String?
    let items: [CosmeticPackItem]
}

/// One subscribed pack
struct CosmeticPackRef: Hashable {
    let roomId: String
    let stateKey: String
}

/// One image entry of a pack, merged over its state events
struct CosmeticPackImage: Equatable {
    let shortcode: String
    let url: String
    let body: String?
    let usage: [String]?
    let info: JSONValue?
}

/// The pure cosmetic pack rules: `cosmeticPacks.ts` and the cosmetics half of `profileCosmetics.ts` in Swift
enum CosmeticPacks {
    static let roomPackTypes = ["im.ponies.room_emotes", "m.room.image_pack"]
    static let subscriptionTypes = ["im.ponies.emote_rooms", "m.image_pack.rooms"]
    static let userPackType = "im.ponies.user_emotes"

    static let defaultUsage = ["emoticon", "sticker"]
    private static let decorationUsage = ["avatar_decoration", "profile_decoration", "avatar_frame"]
    private static let framePositions: Set<String> = ["top", "bottom", "center"]
    /// `info` key of the image a pack effect plays once before its loop
    private static let effectIntroKey = "io.github.kapsikkum.mudrix.effect_intro"

    static let decorationIds = [
        "ring", "thorns", "sparkle", "flame", "pixel-hearts", "stars", "halo", "cat-ears",
        "bunny-ears", "crown", "leaf-wreath", "neon-ring", "glitch-ring", "snowflake-ring",
        "cherry-blossoms", "angel-wings", "devil-horns", "claude-buddy", "headphones",
        "rain-cloud", "butterflies", "orbiting-planets", "mud-splat", "grasping-hands",
        "corrupted-gaze", "uncanny-alternate",
    ]

    static let effectIds = [
        "falling-stars", "hearts", "snow", "sparkles", "claude-sparks", "bubbles", "confetti",
        "fireflies", "autumn-leaves", "mud-splatter", "creeping-hands", "signal-intrusion",
        "broadcast-hijack", "eevee-stars",
    ]

    static let nameplateIds = [
        "claude-terminal", "sunset", "aurora", "ocean-waves", "starry-night", "mud-puddle",
        "haunted-glass", "dead-channel", "local-broadcast", "eevee-meadow",
    ]

    static let frameIds = [
        "claude-cozy", "vines", "pixel-arcade", "ice-crystal", "gold-filigree", "mucky",
        "escaping-hands", "analog-terror", "vhs-intruder",
    ]

    private static let builtinNameplatePalettes = [
        "claude-terminal": "crimson", "sunset": "berry", "aurora": "teal",
        "ocean-waves": "sky", "starry-night": "black", "mud-puddle": "forest",
        "haunted-glass": "black", "dead-channel": "crimson", "local-broadcast": "black",
        "eevee-meadow": "forest",
    ]

    private static let palettes: [String: (red: Double, green: Double, blue: Double)] = [
        "none": (0, 0, 0), "black": (0, 0, 0), "crimson": (144, 0, 7), "berry": (137, 58, 153),
        "sky": (0, 128, 183), "teal": (8, 100, 96), "forest": (38, 47, 33),
        "bubble_gum": (220, 62, 151), "violet": (115, 11, 200), "cobalt": (1, 49, 194),
        "clover": (4, 123, 32), "lemon": (246, 205, 18), "white": (255, 255, 255),
    ]

    /// The cosmetic kind a pack usage list means, or nil for an emoji or sticker pack
    static func kind(of usage: [String]) -> CosmeticKind? {
        if usage.contains("profile_frame") { return .profileFrame }
        if usage.contains("nameplate") { return .nameplate }
        if usage.contains("profile_effect") { return .effect }
        if decorationUsage.contains(where: { usage.contains($0) }) { return .decoration }
        return nil
    }

    /// The value of a `mxc://` string or a JSON object, also when it is stored as a JSON string
    private static func fields(of value: JSONValue) -> [String: JSONValue]? {
        switch value {
        case .object(let object): return object
        case .string(let text):
            guard text.hasPrefix("{"), let data = text.data(using: .utf8),
                  let parsed = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
            return parsed.object
        default: return nil
        }
    }

    private static func accepted(_ text: String, _ ids: [String]) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if ids.contains(trimmed) || trimmed.hasPrefix("mxc://") { return trimmed }
        return nil
    }

    /// A stored avatar decoration: a built-in id or `mxc://` media
    static func parseDecoration(_ value: JSONValue?) -> CosmeticValue? {
        guard let text = value?.string, let id = accepted(text, decorationIds) else { return nil }
        return .id(id)
    }

    /// A stored profile effect: a built-in id or `mxc://` media
    static func parseEffect(_ value: JSONValue?) -> CosmeticValue? {
        guard let text = value?.string, let id = accepted(text, effectIds) else { return nil }
        return .id(id)
    }

    /// A stored nameplate: a built-in id, `mxc://` media, or `{url, palette}`
    static func parseNameplate(_ value: JSONValue?) -> CosmeticValue? {
        guard let value else { return nil }
        if let object = fields(of: value) {
            guard let url = object["url"]?.string, url.hasPrefix("mxc://") else { return nil }
            var palette: String?
            if let name = object["palette"]?.string?.lowercased(), palettes[name] != nil { palette = name }
            return .nameplate(url: url, palette: palette)
        }
        guard let text = value.string, let id = accepted(text, nameplateIds) else { return nil }
        return .id(id)
    }

    /// A stored profile frame: a built-in id, `mxc://` media, or `{url, pieces}`
    static func parseFrame(_ value: JSONValue?) -> CosmeticValue? {
        guard let value else { return nil }
        if let object = fields(of: value) {
            let url = object["url"]?.string ?? ""
            let pieces = framePieces(object["pieces"])
            guard url.hasPrefix("mxc://") || !pieces.isEmpty else { return nil }
            return .frame(url: url.hasPrefix("mxc://") ? url : "", pieces: pieces)
        }
        guard let text = value.string, let id = accepted(text, frameIds) else { return nil }
        return .id(id)
    }

    /// Up to eight `mxc://` frame pieces with a known position; invalid ones are dropped
    static func framePieces(_ raw: JSONValue?) -> [CosmeticFramePiece] {
        guard let items = raw?.array else { return [] }
        var pieces: [CosmeticFramePiece] = []
        for item in items.prefix(8) {
            guard let object = item.object, let url = object["url"]?.string, url.hasPrefix("mxc://"),
                  let pos = object["pos"]?.string, framePositions.contains(pos) else { continue }
            let layer = object["layer"]?.string
            pieces.append(CosmeticFramePiece(url: url, pos: pos, layer: layer == "back" || layer == "front" ? layer : nil))
        }
        return pieces
    }

    /// Whether a cosmetic comes from a pack (media) rather than the built-in set
    static func isPackCosmetic(_ value: CosmeticValue?) -> Bool {
        switch value {
        case .id(let url)?: return url.hasPrefix("mxc://")
        case .nameplate(let url, _)?: return url.hasPrefix("mxc://")
        case .frame(let url, let pieces)?: return url.hasPrefix("mxc://") || pieces.contains { $0.url.hasPrefix("mxc://") }
        case nil: return false
        }
    }

    /// What to draw for a stored cosmetic: nothing for a pack item while packs are switched off
    static func resolve(_ value: CosmeticValue?, showPacks: Bool) -> CosmeticValue? {
        guard let value else { return nil }
        return !showPacks && isPackCosmetic(value) ? nil : value
    }

    /// The `mxc://` media of a value, or nil for a built-in one
    static func mediaURL(_ value: CosmeticValue?) -> String? {
        guard let url = value?.url, url.hasPrefix("mxc://") else { return nil }
        return url
    }

    /// The id a value is compared against when a picker shows what is selected
    static func storedId(_ value: CosmeticValue?) -> String? { value?.url }

    /// The palette of a nameplate value, from the value or the built-in list
    static func nameplatePalette(_ value: CosmeticValue?) -> String? {
        switch value {
        case .nameplate(_, let palette)?: return palette
        case .id(let id)?: return builtinNameplatePalettes[id]
        default: return nil
        }
    }

    /// The palette a loaded pack gave an `mxc://` nameplate, for one stored without its palette
    static func nameplatePalette(for url: String, in packs: [CosmeticPack]) -> String? {
        for pack in packs {
            guard let item = pack.items.first(where: { $0.kind == .nameplate && $0.url == url }),
                  let name = item.palette?.lowercased(), palettes[name] != nil else { continue }
            return name
        }
        return nil
    }

    /// The one-shot intro a loaded pack gave an `mxc://` effect
    static func effectIntro(for url: String, in packs: [CosmeticPack]) -> String? {
        for pack in packs {
            if let intro = pack.items.first(where: { $0.kind == .effect && $0.url == url })?.intro {
                return intro
            }
        }
        return nil
    }

    /// A nameplate palette's colour as 0...1 components (`nameplatePaletteRgb` on the web)
    static func paletteRGB(_ palette: String?) -> (red: Double, green: Double, blue: Double) {
        guard let name = palette?.lowercased(), let rgb = palettes[name] else { return (0, 0, 0) }
        return (rgb.red / 255, rgb.green / 255, rgb.blue / 255)
    }

    /// The localized name of a built-in cosmetic, else the id made readable
    static func label(of id: String, kind: CosmeticKind) -> String {
        let camel = camelCase(id)
        var key: String?
        switch kind {
        case .decoration: key = "profile.decoration.\(camel)"
        case .effect: key = "profile.effect.\(camel)"
        default: key = nil
        }
        if let key {
            let text = NSLocalizedString(key, comment: "")
            if !text.isEmpty, text != key { return text }
        }
        return readable(id)
    }

    private static func camelCase(_ id: String) -> String {
        id.split(separator: "-").enumerated().map { index, part in
            index == 0 ? String(part) : String(part.prefix(1)).uppercased() + String(part.dropFirst())
        }.joined()
    }

    private static func readable(_ id: String) -> String {
        id.split(separator: "-").map { String($0.prefix(1)).uppercased() + String($0.dropFirst()) }.joined(separator: " ")
    }

    /// A pack's display name, usage and attribution, first value wins
    static func packInfo(_ contents: [JSONValue]) -> (displayName: String?, usage: [String]?, attribution: String?) {
        var displayName: String?
        var usage: [String]?
        var attribution: String?
        for content in contents {
            guard let pack = content["pack"] else { continue }
            if displayName == nil, let name = pack["display_name"]?.string { displayName = name }
            if usage == nil, let list = pack["usage"]?.array {
                usage = list.compactMap { $0.string }
            }
            if attribution == nil, let text = pack["attribution"]?.string { attribution = text }
        }
        return (displayName, usage, attribution)
    }

    /// A pack's images by shortcode, first definition wins
    static func packImages(_ contents: [JSONValue]) -> [CosmeticPackImage] {
        var seen: Set<String> = []
        var images: [CosmeticPackImage] = []
        for content in contents {
            guard let map = content["images"]?.object else { continue }
            for (shortcode, raw) in map {
                guard let url = raw["url"]?.string, !url.isEmpty, !seen.contains(shortcode) else { continue }
                seen.insert(shortcode)
                images.append(CosmeticPackImage(shortcode: shortcode, url: url, body: raw["body"]?.string,
                                                usage: raw["usage"]?.array?.compactMap { $0.string }, info: raw["info"]))
            }
        }
        return images
    }

    /// One pack from the content of its state events
    static func parsePack(roomId: String?, stateKey: String, contents: [JSONValue]) -> CosmeticPack? {
        let info = packInfo(contents)
        let packUsage = info.usage?.isEmpty == false ? (info.usage ?? defaultUsage) : defaultUsage
        var items: [CosmeticPackItem] = []
        for image in packImages(contents) {
            guard image.url.hasPrefix("mxc://") else { continue }
            let usage = image.usage?.isEmpty == false ? (image.usage ?? packUsage) : packUsage
            guard let kind = kind(of: usage) else { continue }
            let rawInfo = image.info
            let intro = rawInfo?[effectIntroKey]?.string
            items.append(CosmeticPackItem(shortcode: image.shortcode, name: image.body ?? image.shortcode,
                                          url: image.url, kind: kind,
                                          palette: rawInfo?["palette"]?.string,
                                          pieces: framePieces(rawInfo?["pieces"]),
                                          intro: intro?.hasPrefix("mxc://") == true ? intro : nil))
        }
        guard !items.isEmpty else { return nil }
        let name = info.displayName.flatMap { $0.isEmpty ? nil : $0 } ?? stateKey
        return CosmeticPack(roomId: roomId, stateKey: stateKey, displayName: name, attribution: info.attribution, items: items)
    }

    /// Every pack of a room, one per state key
    static func parsePacks(roomId: String, byStateKey: [String: [JSONValue]]) -> [CosmeticPack] {
        byStateKey.keys.sorted().compactMap { key in
            parsePack(roomId: roomId, stateKey: key, contents: byStateKey[key] ?? [])
        }
    }

    /// The items of one pack that are of `kind`
    static func items(of pack: CosmeticPack, kind: CosmeticKind) -> [CosmeticPackItem] {
        pack.items.filter { $0.kind == kind }
    }

    /// The profile value of a pack item, in the shape the profile readers read back
    static func profileValue(of item: CosmeticPackItem) -> JSONValue {
        if item.kind == .nameplate, let palette = item.palette {
            return .object(["url": .string(item.url), "palette": .string(palette)])
        }
        if item.kind == .profileFrame, !item.pieces.isEmpty {
            let pieces = item.pieces.map { piece -> JSONValue in
                var fields: [String: JSONValue] = ["url": .string(piece.url), "pos": .string(piece.pos)]
                if let layer = piece.layer { fields["layer"] = .string(layer) }
                return .object(fields)
            }
            return .object(["url": .string(item.url), "pieces": .array(pieces)])
        }
        return .string(item.url)
    }

    /// The subscriptions of the stable and unstable account data, merged
    static func mergeSubscriptions(_ contents: [JSONValue]) -> [String: [String: JSONValue]] {
        var merged: [String: [String: JSONValue]] = [:]
        for content in contents {
            guard let rooms = content["rooms"]?.object else { continue }
            for (roomId, keys) in rooms {
                guard let keys = keys.object else { continue }
                merged[roomId] = (merged[roomId] ?? [:]).merging(keys) { _, new in new }
            }
        }
        return merged
    }

    /// The subscriptions as the `{"rooms": ...}` content both account data events hold
    static func subscriptionValue(_ rooms: [String: [String: JSONValue]]) -> JSONValue {
        .object(["rooms": .object(rooms.mapValues { JSONValue.object($0) })])
    }

    /// Whether a pack is among the subscriptions
    static func isSubscribed(_ rooms: [String: [String: JSONValue]], roomId: String, stateKey: String) -> Bool {
        rooms[roomId]?[stateKey] != nil
    }

    /// The subscriptions with one pack added or removed, rooms left without packs dropped
    static func withSubscription(_ rooms: [String: [String: JSONValue]], roomId: String, stateKey: String,
                                 subscribed: Bool) -> [String: [String: JSONValue]] {
        var next = rooms
        var keys = next[roomId] ?? [:]
        if subscribed {
            if keys[stateKey] == nil { keys[stateKey] = .object([:]) }
        } else {
            keys.removeValue(forKey: stateKey)
        }
        if keys.isEmpty { next.removeValue(forKey: roomId) } else { next[roomId] = keys }
        return next
    }

    /// Exactly `refs` as subscriptions, keeping the packs of rooms `keepRoom` cannot read
    static func subscriptionRooms(_ existing: [String: [String: JSONValue]], _ refs: [CosmeticPackRef],
                                  keepRoom: (String) -> Bool = { _ in false }) -> [String: [String: JSONValue]] {
        var rooms: [String: [String: JSONValue]] = [:]
        for (roomId, keys) in existing where keepRoom(roomId) { rooms[roomId] = keys }
        for ref in refs { rooms[ref.roomId, default: [:]][ref.stateKey] = .object([:]) }
        return rooms
    }

    /// Every subscribed pack, in a stable order
    static func subscribedRefs(_ rooms: [String: [String: JSONValue]]) -> [CosmeticPackRef] {
        var refs: [CosmeticPackRef] = []
        for roomId in rooms.keys.sorted() {
            for stateKey in (rooms[roomId] ?? [:]).keys.sorted() { refs.append(CosmeticPackRef(roomId: roomId, stateKey: stateKey)) }
        }
        return refs
    }
}
