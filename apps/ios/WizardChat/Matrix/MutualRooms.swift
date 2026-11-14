import Foundation
import WizardChatCore

/// A room or space both people are in
struct MutualEntry: Identifiable, Equatable {
    let id: String
    let name: String
    let avatarUrl: String?
}

/// Rooms in common with someone, as their profile lists them
struct MutualRooms: Equatable {
    var rooms: [MutualEntry]
    var spaces: [MutualEntry]

    var isEmpty: Bool { rooms.isEmpty && spaces.isEmpty }
}

/// The rules of MSC2666 mutual rooms: the paths asked, the ids in an answer, and the profile's two groups
enum MutualRoomsLookup {
    /// A joined room as the lookup needs it
    struct JoinedRoom: Equatable {
        let id: String
        let name: String?
        let avatarUrl: String?
        let isDirect: Bool
        let isSpace: Bool
    }

    private static let paths = [
        "/_matrix/client/unstable/uk.half-shot.msc2666/user/mutual_rooms",
        "/_matrix/client/v3/user/mutual_rooms",
    ]

    /// The room ids of a `mutual_rooms` answer, or nil when the body is not one
    static func parseJoined(_ body: Data) -> [String]? {
        guard case .object(let fields)? = try? JSONDecoder().decode(JSONValue.self, from: body),
              case .array(let joined)? = fields["joined"] else { return nil }
        return joined.compactMap(\.string)
    }

    /// The joined rooms and spaces among `ids`, by name; direct chats and unknown ids are left out
    static func entries(ids: [String], rooms: [JoinedRoom]) -> MutualRooms {
        let roomsById = Dictionary(rooms.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var foundRooms: [MutualEntry] = []
        var foundSpaces: [MutualEntry] = []
        var seen = Set<String>()
        for id in ids where seen.insert(id).inserted {
            guard let room = roomsById[id] else { continue }
            let name = room.name.flatMap { $0.isEmpty ? nil : $0 } ?? id
            if room.isSpace {
                foundSpaces.append(MutualEntry(id: id, name: name, avatarUrl: room.avatarUrl))
            } else if !room.isDirect {
                foundRooms.append(MutualEntry(id: id, name: name, avatarUrl: room.avatarUrl))
            }
        }
        func sorted(_ entries: [MutualEntry]) -> [MutualEntry] {
            entries.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }
        return MutualRooms(rooms: sorted(foundRooms), spaces: sorted(foundSpaces))
    }

    /// Asks the homeserver; nil when it does not support the lookup
    static func fetch(homeserverUrl: String, accessToken: String, userId: String) async -> [String]? {
        let base = homeserverUrl.hasSuffix("/") ? String(homeserverUrl.dropLast()) : homeserverUrl
        for path in paths {
            guard var components = URLComponents(string: base + path) else { continue }
            components.queryItems = [URLQueryItem(name: "user_id", value: userId)]
            guard let url = components.url else { continue }
            var request = URLRequest(url: url)
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            request.timeoutInterval = 15
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { continue }
            if let ids = parseJoined(data) { return ids }
        }
        return nil
    }
}
