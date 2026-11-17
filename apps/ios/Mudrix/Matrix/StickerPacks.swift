import Foundation
import MudrixCore

/// Finds the pack a sticker in the timeline came from, as the web's sticker preview does
/// (Android's `matrix/StickerPacks.kt`).
enum StickerPacks {
    /// What tapping a sticker found: the pack, or why it can't be shown
    enum Lookup: Equatable {
        /// The pack that holds the sticker
        case found(EmojiPack)
        /// No joined room has a pack with this sticker
        case unknown
        /// The pack's room is not public, so the preview stays hidden
        case notPublic
    }

    /// The pack among `packs` that holds `url`
    static func find(_ packs: [ImagePack], url: String) -> ImagePack? {
        packs.first { pack in pack.images.contains { $0.url == url } }
    }

    /// The url of a media source (`{ url }`, or the encrypted file's url)
    static func imageUrl(_ source: MediaSource) -> String? {
        source["url"]?.string ?? source["file"]?["url"]?.string
    }

    /// The rooms to look in: the one on screen first, then the others
    static func roomOrder(current: String?, others: [String]) -> [String] {
        var seen = Set<String>()
        var order: [String] = []
        if let current, !current.isEmpty {
            order.append(current)
            seen.insert(current)
        }
        for roomId in others where !seen.contains(roomId) {
            order.append(roomId)
            seen.insert(roomId)
        }
        return order
    }

    /// The room pack among `roomIds` that holds `url`; a pack in a room that isn't public stays hidden
    @MainActor
    static func find(session: MatrixSession, url: String, roomIds: [String]) async -> Lookup {
        guard let client = session.client else { return .unknown }
        for roomId in roomIds {
            // A room's packs include its spaces' packs and the ones the account subscribes to; the
            // "user" pack is not a room
            let loaded = await ImagePacks.load(session: session, roomId: roomId)
            let packs = loaded.filter { $0.roomId != nil && $0.roomId != "user" }
            guard let pack = find(packs, url: url) else { continue }
            let settings = try? await client.localRoomSettings(roomId: pack.roomId ?? roomId)
            guard let settings, settings.joinRule == "public" else { return .notPublic }
            return .found(pack)
        }
        return .unknown
    }
}
