import Foundation
import UserNotifications
import WizardChatCore

/// Fills in a push before iOS shows it: the decrypted message and the keys a tap needs, or the
/// room's name from the app group when the message itself can't be reached.
///
/// iOS runs this extension even after the app was force-quit, as long as the push carries an
/// `aps.alert` and `mutable-content` (silent `content-available` pushes are not delivered at all
/// after a force-quit, which is why nothing used to show).
///
/// It restores the account over the app's store in the app group, with a lock holder name of its
/// own, and asks the core for the pushed event without starting a sync. The generic alert the
/// pusher registers is what the user gets when that is impossible: another account's push, a
/// message whose keys this process can't get, or no answer before the deadline. See
/// docs/DECISIONS.md ("Notifications after a force-quit").
final class NotificationService: UNNotificationServiceExtension {
    /// The SDK's lock holder name for this process; the app keeps the default (`main`)
    private static let processName = "notification-service"
    private static let deadline: Duration = .seconds(20)

    private let lock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var best: UNNotificationContent?
    private var deadlineTask: Task<Void, Never>?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        lock.lock()
        self.contentHandler = contentHandler
        lock.unlock()

        keep(Self.content(for: request))
        guard let payload = PushPayload.parse(request.content.userInfo),
              let roomId = payload.roomId, let eventId = payload.eventId else {
            deliver()
            return
        }
        Task { await self.enrich(payload: payload, roomId: roomId, eventId: eventId, request: request) }
        deadlineTask = Task {
            try? await Task.sleep(for: Self.deadline)
            self.deliver()
        }
    }

    override func serviceExtensionTimeWillExpire() {
        // iOS is about to take the notification: show the best there is rather than nothing
        deliver()
    }

    /// Replaces the generic text with what the message says, over the store the app writes
    private func enrich(payload: PushPayload, roomId: String, eventId: String,
                        request: UNNotificationRequest) async {
        // However this ends, the fallback that `didReceive` kept is already a valid answer
        defer { deliver() }
        guard let userId = payload.userId, let stored = SharedSessionStore.account(userId: userId) else { return }
        var store = stored.store
        // The app moves the store on its first launch: opening the path here would create an empty
        // store that the app would later prefer over the real one
        guard FileManager.default.fileExists(atPath: store.location) else { return }
        // Keeps this process's store writes apart from the running app's
        store.processName = Self.processName
        do {
            let client = try await WizardClient.restore(session: stored.session, store: store)
            guard let message = try await client.pushedNotificationFromExtension(roomId: roomId, eventId: eventId),
                  !message.encrypted, !message.body.isEmpty,
                  let content = request.content.mutableCopy() as? UNMutableNotificationContent
            else { return }
            let preview = NotificationPreviewBuilder.message(
                roomId: message.roomId, eventId: message.eventId, userId: userId,
                sender: message.sender, senderName: message.senderName, roomName: message.roomName,
                body: message.body, isDirect: message.isDirect, highlight: message.highlight,
                hideContent: ShareInbox.hideContent)
            content.title = preview.title
            content.body = preview.body
            content.threadIdentifier = preview.threadIdentifier ?? ""
            content.categoryIdentifier = preview.categoryIdentifier ?? NotificationPreviewBuilder.messageCategory
            var info: [AnyHashable: Any] = [:]
            for (key, value) in preview.userInfo { info[key] = value }
            content.userInfo = info
            // The app's notifications follow this setting; the gateway's alert can't, so do it here
            if !ShareInbox.notificationSounds { content.sound = nil }
            if message.highlight { content.interruptionLevel = .timeSensitive }
            keep(content)
            deliver()
        } catch {
            // What `didReceive` kept stands: the room's name over the generic text
        }
    }

    private func keep(_ content: UNNotificationContent) {
        lock.lock()
        best = content
        lock.unlock()
    }

    /// Hands the content to iOS, once: whichever of the few callers comes first wins
    private func deliver() {
        lock.lock()
        let handler = contentHandler
        let content = best
        contentHandler = nil
        lock.unlock()
        deadlineTask?.cancel()
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
