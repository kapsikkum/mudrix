import Foundation
import WizardChatCore
import UserNotifications

@MainActor
final class MessageNotifier: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    var activeRoomId: String?
    @Published var roomToOpen: String?
    @Published var eventToFocus: (roomId: String, eventId: String)?
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
        content.userInfo = ["roomId": notification.roomId]
        if prefs.notificationSounds && notification.sound { content.sound = .default }
        if notification.highlight { content.interruptionLevel = .timeSensitive }
        let request = UNNotificationRequest(identifier: notification.eventId, content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        guard let roomId = response.notification.request.content.userInfo["roomId"] as? String else { return }
        switch response.actionIdentifier {
        case "reply":
            guard let text = (response as? UNTextInputNotificationResponse)?.userText
                .trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
            await reply(text, in: roomId)
        case "markRead":
            if let room = await room(roomId) { await roomList?.setRead(room, read: true) }
            center.removeDeliveredNotifications(withIdentifiers: [response.notification.request.identifier])
        default:
            await MainActor.run { self.roomToOpen = roomId }
        }
    }

    private func room(_ roomId: String) async -> RoomSummary? {
        for _ in 0..<40 {
            if let room = roomList?.room(id: roomId) { return room }
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

    func updateBadge(_ count: Int) {
        UNUserNotificationCenter.current().setBadgeCount(count)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        await MainActor.run {
            var options: UNNotificationPresentationOptions = []
            if prefs?.notificationBanners == true { options.formUnion([.banner, .list]) }
            if prefs?.notificationSounds == true { options.insert(.sound) }
            return options
        }
    }
}
