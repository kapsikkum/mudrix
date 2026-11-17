import Foundation

/// What a push can put on the lock screen, built without the message itself: the ids a gateway
/// sends in `event_id_only` format, the alert text it attached, and the room names the app leaves
/// in the app group.
///
/// This file is compiled into the app (and its tests), the widgets and the notification service
/// extension, so it stays pure Foundation: no store, no network, nothing that can fail.
struct NotificationPreview: Equatable {
    /// A room as the app published it for the share extension (`rooms.json` in the app group)
    struct Room: Equatable {
        var name: String
        var isDirect: Bool
    }

    /// The fallback text, in the user's language
    struct Strings: Equatable {
        /// The app's own name, for a push that carries no room and no alert
        var title: String
        /// "New message", like the app's local notifications use when the text is unknown
        var newMessage: String
        /// What streamer mode shows instead of the text
        var hidden: String

        static var localized: Strings {
            Strings(title: String(localized: "app.name"),
                    newMessage: String(localized: "common.newMessage"),
                    hidden: String(localized: "settings.privacy.streamer.notificationBody"))
        }
    }

    var roomId: String?
    var eventId: String?
    var userId: String?
    var title: String
    var body: String
    /// Groups the notifications of one room in Notification Center
    var threadIdentifier: String?
    /// The category the app registers for reply and mark-read
    var categoryIdentifier: String?
    /// A direct message or a mention: worth the mention sound and time-sensitive delivery
    var priority: Bool

    /// The keys the app's tap handling reads (`MessageNotifier`), plus the ones the gateway sent,
    /// so a tap still opens the room even if only one of the two is looked at.
    var userInfo: [String: String] {
        var info: [String: String] = [:]
        if let roomId {
            info["roomId"] = roomId
            info["room_id"] = roomId
        }
        if let eventId {
            info["eventId"] = eventId
            info["event_id"] = eventId
        }
        if let userId { info["userId"] = userId }
        info["priority"] = priority ? "1" : "0"
        return info
    }
}

/// The rules for what a notification says. Pure, so the app's tests cover exactly what the
/// notification service extension runs in its own process.
enum NotificationPreviewBuilder {
    /// The category the app registers with its reply and mark-read actions
    static let messageCategory = "message"

    /// A push that only carries ids: the room's name (when the app published it) or the gateway's
    /// own alert, with a generic body. Message text never reaches the gateway, which is what keeps
    /// streamer mode honoured here.
    static func fallback(payload: PushPayload?, alertTitle: String?, alertBody: String?,
                         rooms: [String: NotificationPreview.Room] = [:], hideContent: Bool = false,
                         strings: NotificationPreview.Strings = .localized) -> NotificationPreview {
        var room: NotificationPreview.Room?
        if let roomId = payload?.roomId { room = rooms[roomId] }
        var title = strings.title
        if let name = room?.name, !name.isEmpty {
            title = name
        } else if let alert = clean(alertTitle) {
            title = alert
        }
        var body = strings.newMessage
        if hideContent {
            body = strings.hidden
        } else if let alert = clean(alertBody) {
            body = alert
        }
        return NotificationPreview(
            roomId: payload?.roomId,
            eventId: payload?.eventId,
            userId: payload?.userId,
            title: title,
            body: body,
            threadIdentifier: payload?.roomId,
            categoryIdentifier: messageCategory,
            // An `event_id_only` push says nothing about mentions; a direct room does say it
            priority: room?.isDirect ?? false)
    }

    /// A message the core could decrypt: the room or the sender as the title, the text as the body,
    /// the same way the app's own local notifications read.
    static func message(roomId: String, eventId: String, userId: String?, sender: String,
                        senderName: String?, roomName: String?, body: String, isDirect: Bool,
                        highlight: Bool, hideContent: Bool = false,
                        strings: NotificationPreview.Strings = .localized) -> NotificationPreview {
        let name = (senderName?.isEmpty == false ? senderName : nil) ?? sender
        let title = (roomName?.isEmpty == false ? roomName : nil) ?? name
        var text = body
        if hideContent {
            text = strings.hidden
        } else if text.isEmpty {
            // Spoilers and messages whose keys are missing arrive without text
            text = strings.newMessage
        } else if !isDirect, roomName?.isEmpty == false {
            text = "\(name): \(text)"
        }
        return NotificationPreview(
            roomId: roomId,
            eventId: eventId,
            userId: userId,
            title: title,
            body: text,
            threadIdentifier: roomId,
            categoryIdentifier: messageCategory,
            priority: highlight || isDirect)
    }

    private static func clean(_ text: String?) -> String? {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
