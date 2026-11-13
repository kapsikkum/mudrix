import Foundation
import WizardChatCore

/// Which rooms a message can be forwarded to, as on Android (`ui/room/ForwardSheet.kt`).
enum MessageForward {
    /// Joined rooms and chats, without spaces, invites and replaced rooms, newest activity first, kept when the search matches the name or an address.
    static func targets(_ rooms: [RoomSummary], query: String) -> [RoomSummary] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return rooms
            .filter { !$0.isSpace && !$0.isInvite && !$0.isTombstoned }
            .filter { room in
                needle.isEmpty
                    || room.displayName.lowercased().contains(needle)
                    || (room.canonicalAlias?.lowercased().contains(needle) ?? false)
            }
            .sorted { ($0.lastActivity ?? 0) > ($1.lastActivity ?? 0) }
    }
}
