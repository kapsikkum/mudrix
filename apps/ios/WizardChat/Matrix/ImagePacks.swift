import Foundation
import WizardChatCore

typealias ImagePack = EmojiPack

extension EmojiPack: @retroactive Identifiable {}

extension PackImage: @retroactive Identifiable {
    public var id: String { "\(url)|\(shortcode)" }
    var text: String { body ?? shortcode }
    var isEmoticon: Bool { emoticon }
    var isSticker: Bool { sticker }
}

@MainActor
enum ImagePacks {
    private static var cache: [String: [ImagePack]] = [:]

    static func cached(roomId: String) -> [ImagePack]? { cache[roomId] }

    /// Drops cached packs after one is edited, so the picker reloads them
    static func forget(roomId: String) { cache.removeAll() }

    static func load(session: MatrixSession, roomId: String) async -> [ImagePack] {
        guard let packs = try? await session.client?.emojiPacks(roomId: roomId) else { return cache[roomId] ?? [] }
        cache[roomId] = packs
        return packs
    }
}

@MainActor
final class PacksStore: ObservableObject {
    @Published private(set) var packs: [ImagePack] = []
    @Published private(set) var isLoading = true

    func load(session: MatrixSession, roomId: String) async {
        if let cached = ImagePacks.cached(roomId: roomId) {
            packs = cached
            isLoading = false
        }
        let fresh = await ImagePacks.load(session: session, roomId: roomId)
        guard !Task.isCancelled else { return }
        packs = fresh
        isLoading = false
    }
}

struct Emoji: Identifiable, Decodable {
    var id: String { e }
    let e: String
    let g: Int
    let s: [String]
    let n: [String: String]
    let k: [String: [String]]

    var u: String { e }
    var l: String { n[Self.language] ?? n["en"] ?? "" }

    struct Group: Decodable {
        let id: Int
        let key: String
        let name: [String: String]
    }

    private struct File: Decodable {
        let groups: [Group]
        let emoji: [Emoji]
    }

    private static let file: File? = {
        guard let url = Bundle.main.url(forResource: "emoji", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(File.self, from: data)
    }()

    static let all: [Emoji] = file?.emoji ?? []

    private static let language = Locale.current.language.languageCode?.identifier ?? "en"

    private static let icons = [
        "smileys-emotion": "smiley", "people-body": "user", "animals-nature": "paw-print",
        "food-drink": "fork-knife", "travel-places": "airplane", "activities": "soccer-ball",
        "objects": "lightbulb", "symbols": "heart", "flags": "flag",
    ]

    static let groups: [(index: Int, icon: String, name: String)] = (file?.groups ?? []).compactMap { group in
        guard let icon = icons[group.key] else { return nil }
        return (group.id, icon, (group.name[language] ?? group.name["en"] ?? group.key).capitalized)
    }

    func matches(_ query: String) -> Bool {
        l.localizedCaseInsensitiveContains(query)
            || s.contains { $0.localizedCaseInsensitiveContains(query) }
            || (k[Self.language] ?? k["en"] ?? []).contains { $0.localizedCaseInsensitiveContains(query) }
    }
}
