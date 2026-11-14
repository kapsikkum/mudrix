import Foundation

/// The room list's long-press menu: marking a room read or unread, and flagging it low priority (the rules of Android's `matrix/RoomMenu.kt`).
enum RoomMenu {
    /// Which of "Mark as read" and "Mark as unread" apply; a room marked unread counts as unread.
    struct Actions: Equatable {
        let markRead: Bool
        let markUnread: Bool
    }

    /// As on the web: read applies while anything is unread, unread only when nothing is.
    static func actions(readCount: Int, mentionCount: Int) -> Actions {
        Actions(markRead: readCount > 0 || mentionCount > 0,
                markUnread: readCount <= 0 && mentionCount <= 0)
    }

    /// Whether a flagged room leaves its section and the room list for the group at the bottom; favourites stay where they are.
    static func inLowPriorityGroup(flagged: Bool, isFavourite: Bool, sectionTag: String?) -> Bool {
        flagged && !isFavourite && sectionTag == nil
    }
}
