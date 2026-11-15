import Foundation

/// The GIFs sent from the picker, newest first, for its Recent tab: the web's `gifRecent.ts` / `gifRecentData.ts`.
/// Kept on this device, one list for each account, as the web keeps it in `localStorage`.
enum GifRecent {
    /// The web's `GIF_RECENT_CAP`
    static let cap = 60

    static func storageKey(userId: String) -> String { "gifRecent|\(userId)" }

    /// The list with `item` moved to the front: sending a GIF again does not list it twice
    static func adding(_ item: GiphyGif, to list: [GiphyGif]) -> [GiphyGif] {
        Array(([item] + list.filter { $0.url != item.url }).prefix(cap))
    }

    /// A stored list; an entry that cannot be read, or has no URL, is dropped and the rest is kept
    static func parse(_ data: Data?) -> [GiphyGif] {
        guard let data, let entries = try? JSONDecoder().decode([Entry].self, from: data) else { return [] }
        var seen = Set<String>()
        var items: [GiphyGif] = []
        for gif in entries.compactMap(\.gif) where !gif.url.isEmpty {
            guard seen.insert(gif.url).inserted else { continue }
            items.append(gif)
            if items.count == cap { break }
        }
        return items
    }

    static func encode(_ list: [GiphyGif]) -> Data? {
        try? JSONEncoder().encode(Array(list.prefix(cap)))
    }

    static func load(userId: String, defaults: UserDefaults = .standard) -> [GiphyGif] {
        parse(defaults.data(forKey: storageKey(userId: userId)))
    }

    /// Records a sent GIF and returns the new list
    @discardableResult
    static func record(_ item: GiphyGif, userId: String, defaults: UserDefaults = .standard) -> [GiphyGif] {
        let next = adding(item, to: load(userId: userId, defaults: defaults))
        defaults.set(encode(next), forKey: storageKey(userId: userId))
        return next
    }

    private struct Entry: Decodable {
        let gif: GiphyGif?

        init(from decoder: Decoder) throws {
            gif = try? GiphyGif(from: decoder)
        }
    }
}
