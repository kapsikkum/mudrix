import Foundation

/// What a push gateway forwards: the ids the app needs to fetch the message itself.
///
/// Shared by the app and the notification service extension (which runs the same parse in a
/// second process), so this file must stay Foundation-only.
struct PushPayload: Equatable {
    var roomId: String? = nil
    var eventId: String? = nil
    var unread: Int? = nil
    /// The pusher's `default_payload` puts the account's id on every push
    var userId: String? = nil

    /// Reads the keys a gateway puts on the notification (top level, or inside `notification`)
    static func parse(_ userInfo: [AnyHashable: Any]) -> PushPayload? {
        let source = (userInfo["notification"] as? [AnyHashable: Any]) ?? userInfo
        func text(_ key: String) -> String? {
            guard let value = source[key] as? String, !value.isEmpty else { return nil }
            return value
        }
        var unread: Int?
        if let counts = source["counts"] as? [AnyHashable: Any] {
            unread = (counts["unread"] as? Int) ?? (counts["unread"] as? String).flatMap(Int.init)
        } else if let value = source["unread"] ?? source["unread_count"] {
            unread = (value as? Int) ?? (value as? String).flatMap(Int.init)
        }
        // `user_id` comes from the pusher's default_payload, next to `room_id`, not inside `notification`
        let userId = (userInfo["user_id"] as? String) ?? text("user_id")
        let payload = PushPayload(roomId: text("room_id"), eventId: text("event_id"), unread: unread,
                                  userId: userId?.isEmpty == true ? nil : userId)
        return payload.roomId == nil && payload.eventId == nil && payload.unread == nil ? nil : payload
    }

    /// The device token as the hex string a push gateway expects as pushkey
    static func pushkey(from token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }
}
