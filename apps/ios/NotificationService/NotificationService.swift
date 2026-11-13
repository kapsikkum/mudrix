import Foundation
import UserNotifications

/// Fills in a push before iOS shows it: the room's name instead of the gateway's generic alert,
/// and the keys a tap needs to open the room.
///
/// iOS runs this extension even after the app was force-quit, as long as the push carries an
/// `aps.alert` and `mutable-content` (silent `content-available` pushes are not delivered at all
/// after a force-quit, which is why nothing used to show).
///
/// It does not decrypt the message: the core's store, its keys and the session are in the app's
/// own container and keychain, which a second process cannot open safely yet. The alert the
/// pusher registers carries a generic text, and `rooms.json` in the app group turns it into the
/// room's name. See docs/DECISIONS.md ("Notifications after a force-quit") for what that needs.
final class NotificationService: UNNotificationServiceExtension {
    private let lock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var best: UNNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        lock.lock()
        self.contentHandler = contentHandler
        lock.unlock()

        // Nothing to wait for today: the ids are all there is to work with, so answer at once.
        let content = Self.content(for: request)
        lock.lock()
        best = content
        lock.unlock()
        deliver()
    }

    override func serviceExtensionTimeWillExpire() {
        // Out of time: show the best content there is rather than nothing. Once the extension can
        // fetch a message, this is the path that shows the fallback while that is still running.
        deliver()
    }

    /// Hands the content to iOS, once: whichever of the two callbacks comes first wins
    private func deliver() {
        lock.lock()
        let handler = contentHandler
        let content = best
        contentHandler = nil
        lock.unlock()
        guard let handler else { return }
        handler(content ?? UNMutableNotificationContent())
    }

    private static func content(for request: UNNotificationRequest) -> UNNotificationContent {
        let preview = NotificationPreviewBuilder.fallback(
            payload: PushPayload.parse(request.content.userInfo),
            alertTitle: request.content.title,
            alertBody: request.content.body,
            rooms: Self.rooms,
            hideContent: Self.hideContent)
        // Keeps the sound, badge and interruption level the gateway chose
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            return request.content
        }
        content.title = preview.title
        content.body = preview.body
        content.threadIdentifier = preview.threadIdentifier ?? ""
        content.categoryIdentifier = preview.categoryIdentifier ?? NotificationPreviewBuilder.messageCategory
        var info: [AnyHashable: Any] = [:]
        for (key, value) in preview.userInfo { info[key] = value }
        content.userInfo = info
        // The app's notifications follow this setting; the gateway's alert can't, so do it here
        if !ShareInbox.notificationSounds { content.sound = nil }
        return content
    }

    /// The room names the app publishes for the share extension; a room it doesn't know (new,
    /// or joined after the app last ran) keeps the gateway's text
    private static var rooms: [String: NotificationPreview.Room] {
        ShareInbox.loadRooms().reduce(into: [:]) { rooms, room in
            rooms[room.id] = NotificationPreview.Room(name: room.name, isDirect: room.isDirect)
        }
    }

    /// Streamer mode hides private details; the app mirrors the setting into the app group
    private static var hideContent: Bool { ShareInbox.hideContent }
}
