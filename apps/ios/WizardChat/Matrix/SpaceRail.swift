/// One slot of the Modern space rail: Direct messages when `space` is nil, otherwise a top-level space.
struct RailSlot: Equatable {
    let space: RailSpace?
    let unread: Bool
    let mentions: Int
}

/// What the rail needs of a top-level space.
struct RailSpace: Equatable {
    let id: String
    let name: String
    let avatarUrl: String?
}

/// What the rail counts for one joined room: the top-level spaces it is in and whether it notifies.
struct RailRoom: Equatable {
    let spaceIds: Set<String>
    let unread: Bool
    let mentions: Int
}

/// Rail order, unread and mention aggregation, badge text and the fallback when a remembered space is gone.
enum SpaceRail {
    /// Direct messages first (every room in no space), then the spaces in the order the classic list uses.
    static func slots(spaces: [RailSpace], rooms: [RailRoom]) -> [RailSlot] {
        let home = rooms.filter { $0.spaceIds.isEmpty }
        var result = [RailSlot(space: nil, unread: home.contains { isUnread($0) }, mentions: home.reduce(0) { $0 + $1.mentions })]
        for space in spaces {
            let inSpace = rooms.filter { $0.spaceIds.contains(space.id) }
            result.append(RailSlot(space: space, unread: inSpace.contains { isUnread($0) }, mentions: inSpace.reduce(0) { $0 + $1.mentions }))
        }
        return result
    }

    /// The mention badge's text, or nil when there is nothing to show; counts stop at 99+.
    static func badge(_ mentions: Int) -> String? {
        if mentions <= 0 { return nil }
        if mentions > 99 { return "99+" }
        return "\(mentions)"
    }

    /// The remembered space when it still exists, otherwise nil for Direct messages.
    static func selected(_ saved: String?, in spaces: [RailSpace]) -> RailSpace? {
        spaces.first { $0.id == saved }
    }

    /// A room is unread when it notifies or mentions.
    static func isUnread(_ room: RailRoom) -> Bool {
        room.unread || room.mentions > 0
    }
}
