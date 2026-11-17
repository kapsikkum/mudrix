import Foundation
import MudrixCore

/// How the DM screen orders its rows, saved in account data so Android and iOS agree.
enum RoomSortMode: String, CaseIterable {
    /// Latest activity first; the old app's order and the default.
    case recent
    /// Rooms created most recently first, from `m.room.create`.
    case newest
    /// Rooms created longest ago first.
    case oldest
    /// Pinned, favourites, DMs, then rooms; the sections are always shown.
    case categorised
}

/// The DM screen's preferences: its order, whether rooms and DMs share a list, whether favourites
/// get their own section, and the users whose DMs are pinned to the top.
///
/// Kept in `io.github.kapsikkum.mudrix.room_list`; missing keys use the old app's behaviour, so an
/// account that never opened the sheet sees no change.
struct RoomListOptions: Equatable {
    static let eventType = Namespace.mudrixKey("room_list")

    var sort: RoomSortMode = .recent
    var separateRoomsAndDms = true
    var favouritesSection = true
    /// Pinned DMs' partners, newest pin first
    var pinnedUsers: [String] = []

    init(
        sort: RoomSortMode = .recent,
        separateRoomsAndDms: Bool = true,
        favouritesSection: Bool = true,
        pinnedUsers: [String] = []
    ) {
        self.sort = sort
        self.separateRoomsAndDms = separateRoomsAndDms
        self.favouritesSection = favouritesSection
        self.pinnedUsers = pinnedUsers
    }

    init(content: JSONValue?) {
        guard case .object(let fields)? = content else { return }
        if case .string(let raw)? = fields["sort"], let mode = RoomSortMode(rawValue: raw) {
            sort = mode
        }
        if case .bool(let value)? = fields["separateRoomsAndDms"] { separateRoomsAndDms = value }
        if case .bool(let value)? = fields["favouritesSection"] { favouritesSection = value }
        if case .array(let pins)? = fields["pinnedUsers"] {
            var seen = Set<String>()
            pinnedUsers = pins.compactMap { item in
                guard case .string(let id) = item, seen.insert(id).inserted else { return nil }
                return id
            }
        }
    }

    var content: JSONValue {
        .object([
            "sort": .string(sort.rawValue),
            "separateRoomsAndDms": .bool(separateRoomsAndDms),
            "favouritesSection": .bool(favouritesSection),
            "pinnedUsers": .array(pinnedUsers.map { .string($0) }),
        ])
    }

    func withPin(_ userId: String, pinned: Bool) -> RoomListOptions {
        var next = self
        if pinned {
            next.pinnedUsers = [userId] + pinnedUsers.filter { $0 != userId }
        } else {
            next.pinnedUsers = pinnedUsers.filter { $0 != userId }
        }
        return next
    }
}

/// The rows in `mode`'s order. A row without the sort key goes after the ones that have it, and
/// equal keys fall back to the name, so the order is stable for rooms that never had activity.
func sortRoomRows<T>(
    _ rows: [T],
    mode: RoomSortMode,
    lastActivity: (T) -> Int?,
    createdAt: (T) -> Int?,
    name: (T) -> String
) -> [T] {
    func byName(_ a: T, _ b: T) -> Bool {
        name(a).localizedCaseInsensitiveCompare(name(b)) == .orderedAscending
    }
    switch mode {
    case .recent, .categorised:
        return rows.sorted { a, b in
            switch (lastActivity(a), lastActivity(b)) {
            case let (x?, y?) where x != y: return x > y
            case (_?, nil): return true
            case (nil, _?): return false
            default: return byName(a, b)
            }
        }
    case .newest:
        return rows.sorted { a, b in
            switch (createdAt(a), createdAt(b)) {
            case let (x?, y?) where x != y: return x > y
            case (_?, nil): return true
            case (nil, _?): return false
            default: return byName(a, b)
            }
        }
    case .oldest:
        return rows.sorted { a, b in
            switch (createdAt(a), createdAt(b)) {
            case let (x?, y?) where x != y: return x < y
            case (nil, _?): return false
            case (_?, nil): return true
            default: return byName(a, b)
            }
        }
    }
}

extension Array where Element == RoomSummary {
    func sortedForRoomList(_ options: RoomListOptions) -> [RoomSummary] {
        sortRoomRows(self, mode: options.sort, lastActivity: \.lastActivity, createdAt: \.createdAt, name: \.displayName)
    }
}
