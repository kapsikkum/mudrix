import Foundation

/// Where a room sits in the room list, for the "Move up" and "Move down" entries of its menu: the order of
/// the group it is listed in, and whether that order is the favourites' or the home list's.
struct RoomMove {
    let ids: [String]
    let index: Int
    /// Favourites keep their order in the room's `m.favourite` tag; the home list in `home_order`
    let favourites: Bool
}

/// Moving one room inside its group, which is saved through the same reorder as dragging does
enum RoomMoveOrder {
    /// The ids with the room at `index` swapped one place by `offset`; nil when there is no room to swap with
    static func moved(_ ids: [String], index: Int, by offset: Int) -> [String]? {
        guard ids.indices.contains(index) else { return nil }
        let target = index + offset
        guard target != index, ids.indices.contains(target) else { return nil }
        var next = ids
        next.swapAt(index, target)
        return next
    }

    /// The order after moving a room, or nil when it cannot move that way
    static func moved(_ move: RoomMove, by offset: Int) -> [String]? {
        moved(move.ids, index: move.index, by: offset)
    }
}
