import Foundation
import WizardChatCore
import UserNotifications

@MainActor
final class MessageNotifier: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    var activeRoomId: String?
    @Published var roomToOpen: String?
    @Published var eventToFocus: (roomId: String, eventId: String)?
    @Published var accountToOpen: String?
    private weak var prefs: AppPreferences?
    private weak var roomList: RoomListModel?
    private var subscription: Subscription?

    static let messageCategory = "message"

    override init() {
        super.init()
        // Set from launch, so a notification tapped while the app was closed still opens its room.
        UNUserNotificationCenter.current().delegate = self
        let reply = UNTextInputNotificationAction(identifier: "reply", title: String(localized: "timeline.reply"),
                                                  options: [], textInputButtonTitle: String(localized: "common.send"),
                                                  textInputPlaceholder: String(localized: "composer.typeMessage"))
        let markRead = UNNotificationAction(identifier: "markRead", title: String(localized: "common.markRead"))
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: Self.messageCategory, actions: [reply, markRead], intentIdentifiers: []),
        ])
    }

    func start(roomList: RoomListModel, prefs: AppPreferences) {
        self.roomList = roomList
        self.prefs = prefs
        UNUserNotificationCenter.current().delegate = self
        subscription?.cancel()
        subscription = roomList.client.watchNotifications { [weak self] notification in
            MainActor.assumeIsolated {
                guard let self else { return }
                Task { await self.notify(notification) }
            }
        }
        if prefs.notificationBanners || prefs.notificationSounds {
            Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) }
        }
    }

    func stop() {
        updateBadge(0)
        subscription?.cancel()
        subscription = nil
        roomList = nil
    }

    private func notify(_ notification: WizardChatCore.Notification) async {
        guard let prefs, prefs.notificationBanners || prefs.notificationSounds,
              notification.roomId != activeRoomId else { return }
        let content = UNMutableNotificationContent()
        let sender = notification.senderName ?? notification.sender
        content.title = notification.roomName ?? sender
        content.body = notification.isDirect || notification.roomName == nil
            ? notification.body : "\(sender): \(notification.body)"
        if content.body.isEmpty { content.body = String(localized: "notifications.newMessage") }
        content.threadIdentifier = notification.roomId
        content.categoryIdentifier = Self.messageCategory
        var info = ["roomId": notification.roomId, "eventId": notification.eventId]
        if let userId = roomList?.client.userId { info["userId"] = userId }
        content.userInfo = info
        if prefs.notificationSounds && notification.sound { content.sound = .default }
        if notification.highlight { content.interruptionLevel = .timeSensitive }
        let request = UNNotificationRequest(identifier: "\(info["userId"] ?? "")|\(notification.eventId)",
                                            content: await withAvatar(content, for: notification), trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    func notifyMissedCall(_ call: IncomingCall) {
        guard let prefs, prefs.notificationBanners || prefs.notificationSounds,
              call.roomId != activeRoomId else { return }
        let content = UNMutableNotificationContent()
        content.title = call.roomName ?? call.senderName ?? call.sender
        content.body = L10n.format("call.missedFrom", call.senderName ?? call.sender)
        content.threadIdentifier = call.roomId
        var info = ["roomId": call.roomId]
        if let userId = roomList?.client.userId { info["userId"] = userId }
        content.userInfo = info
        if prefs.notificationSounds { content.sound = .default }
        let request = UNNotificationRequest(identifier: "\(info["userId"] ?? "")|missed|\(call.eventId)",
                                            content: content, trigger: nil)
        Task { try? await UNUserNotificationCenter.current().add(request) }
    }

    private func withAvatar(_ content: UNMutableNotificationContent,
                            for notification: WizardChatCore.Notification) async -> UNNotificationContent {
        guard let client = roomList?.client else { return content }
        let roomAvatar = roomList?.room(id: notification.roomId)?.avatarUrl
        var avatar = roomAvatar
        if notification.isDirect, avatar == nil {
            avatar = await MemberDirectory.shared.profile(notification.sender, in: notification.roomId, client: client).avatarUrl
        }
        guard let avatar, let data = try? await client.thumbnail(mxc: avatar, width: 192, height: 192, crop: true) else { return content }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).png")
        guard (try? data.write(to: file)) != nil,
              let attachment = try? UNNotificationAttachment(identifier: "avatar", url: file,
                                                             options: [UNNotificationAttachmentOptionsTypeHintKey: "public.image"])
        else { return content }
        content.attachments = [attachment]
        return content
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let action = response.actionIdentifier
        let identifier = response.notification.request.identifier
        let text = (response as? UNTextInputNotificationResponse)?.userText
        let done = Unchecked(value: completionHandler)
        Task { @MainActor in
            defer { done.value() }
            guard let roomId = info["roomId"] as? String else { return }
            let current = roomList?.client.userId ?? SessionStore.active()?.session.userId
            if let userId = info["userId"] as? String, userId != current { accountToOpen = userId }
            switch action {
            case "reply":
                guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
                await reply(text, in: roomId)
            case "markRead":
                if let room = await room(roomId) { await roomList?.setRead(room, read: true) }
                center.removeDeliveredNotifications(withIdentifiers: [identifier])
            default:
                if let eventId = info["eventId"] as? String { eventToFocus = (roomId, eventId) }
                roomToOpen = roomId
            }
        }
    }

    private func room(_ roomId: String) async -> RoomSummary? {
        for _ in 0..<60 {
            if accountToOpen == nil, let room = roomList?.room(id: roomId) { return room }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return nil
    }

    private func reply(_ text: String, in roomId: String) async {
        guard await room(roomId) != nil, let timeline = try? await roomList?.client.timeline(roomId: roomId) else { return }
        try? await timeline.sendText(body: text)
        try? await timeline.markAsRead()
        // Give the send queue a moment before iOS suspends the app again.
        try? await Task.sleep(for: .seconds(2))
    }

    static func removeDelivered(userId: String) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { delivered in
            let ids = delivered.filter { $0.request.content.userInfo["userId"] as? String == userId }
                .map(\.request.identifier)
            center.removeDeliveredNotifications(withIdentifiers: ids)
        }
    }

    func updateBadge(_ count: Int) {
        UNUserNotificationCenter.current().setBadgeCount(count)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let done = Unchecked(value: completionHandler)
        Task { @MainActor in
            var options: UNNotificationPresentationOptions = []
            if prefs?.notificationBanners == true { options.formUnion([.banner, .list]) }
            if prefs?.notificationSounds == true { options.insert(.sound) }
            done.value(options)
        }
    }
}

private struct Unchecked<Value>: @unchecked Sendable {
    let value: Value
}
