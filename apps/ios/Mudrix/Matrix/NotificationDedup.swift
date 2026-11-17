import Foundation

/// Which notification iOS should show when a push and the app's own local notification are about
/// the same event.
enum NotificationDedup {
    struct Delivered: Equatable {
        var identifier: String
        var eventId: String?
        var isRemote: Bool
    }

    /// The app is on screen and syncing: its own notification for the event is the one to show
    static func suppressRemote(isRemote: Bool, hasEventId: Bool) -> Bool {
        isRemote && hasEventId
    }

    /// The local notification about an event replaces the generic push iOS already delivered for it
    static func remoteDuplicates(of delivered: [Delivered], eventId: String) -> [String] {
        delivered.filter { $0.isRemote && $0.eventId == eventId }.map(\.identifier)
    }
}
