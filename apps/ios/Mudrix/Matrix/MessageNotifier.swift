import Foundation
import MudrixCore
import UserNotifications

@MainActor
final class MessageNotifier: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    var activeRoomId: String?
    @Published var roomToOpen: String?
    /// A space to open once the main tab view can show it (from a profile's mutual spaces)
    @Published var spaceToOpen: String?
    @Published var eventToFocus: (roomId: String, eventId: String)?
    /// A thread to open once its room is on screen (from the inbox)
    @Published var threadToOpen: (roomId: String, rootId: String)?
    @Published var accountToOpen: String?
    private weak var prefs: AppPreferences?
    private weak var roomList: RoomListModel?
    private var subscription: Subscription?

    static let messageCategory = NotificationPreviewBuilder.messageCategory

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

    private func notify(_ notification: MudrixCore.Notification) async {
        guard let prefs, prefs.notificationBanners || prefs.notificationSounds,
              notification.roomId != activeRoomId else { return }
        let content = UNMutableNotificationContent()
        let sender = notification.senderName ?? notification.sender
        content.title = notification.roomName ?? sender
        content.body = notification.isDirect || notification.roomName == nil
            ? notification.body : "\(sender): \(notification.body)"
        if content.body.isEmpty { content.body = String(localized: "common.newMessage") }
        // Streamer mode keeps message text out of banners, so it does not end up on a stream
        if prefs.streamerModeActive { content.body = String(localized: "settings.privacy.streamer.notificationBody") }
        content.threadIdentifier = notification.roomId
        content.categoryIdentifier = Self.messageCategory
        // A mention, direct message or invite plays the mention sound, other messages the message sound
        let priority = notification.highlight || notification.isDirect
        var info = ["roomId": notification.roomId, "eventId": notification.eventId,
                    "priority": priority ? "1" : "0", "ts": String(notification.ts)]
        if let userId = roomList?.client.userId { info["userId"] = userId }
        content.userInfo = info
        if prefs.notificationSounds && notification.sound { content.sound = Sounds.notificationSound(priority: priority) }
        if notification.highlight { content.interruptionLevel = .timeSensitive }
        let request = UNNotificationRequest(identifier: "\(info["userId"] ?? "")|\(notification.eventId)",
                                            content: await withAvatar(content, for: notification), trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
        Self.removeDeliveredPushes(eventId: notification.eventId)
    }

    /// Shows a message a push told the app about
    func show(_ notification: MudrixCore.Notification) {
        Task { await notify(notification) }
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
                            for notification: MudrixCore.Notification) async -> UNNotificationContent {
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
                if let userId = info["userId"] as? String { await Self.remove(userId: userId, roomId: roomId) }
            case "markRead":
                if let room = await room(roomId) { await roomList?.setRead(room, read: true) }
                if let userId = info["userId"] as? String {
                    await Self.remove(userId: userId, roomId: roomId)
                } else {
                    center.removeDeliveredNotifications(withIdentifiers: [identifier])
                }
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
        try? await timeline.markAsRead(_private: prefs?.sendReadReceipts == false)
        // Give the send queue a moment before iOS suspends the app again.
        try? await Task.sleep(for: .seconds(2))
    }

    /// Drops the notifications of one room, e.g. when it is opened
    func clear(roomId: String) {
        guard let userId = roomList?.client.userId else { return }
        Task { await Self.remove(userId: userId, roomId: roomId) }
    }

    /// Drops the notifications of the rooms that are read now, leaving unread ones alone
    func clearRead(_ rooms: [RoomSummary]) {
        guard let userId = roomList?.client.userId else { return }
        let seen = Dictionary(rooms.filter { $0.unreadCount == 0 && $0.mentionCount == 0 }
            .map { ($0.id, $0.lastActivity ?? 0) }, uniquingKeysWith: max)
        guard !seen.isEmpty else { return }
        Task {
            await Self.remove(userId: userId) { delivered in
                let info = delivered.request.content.userInfo
                guard let roomId = info["roomId"] as? String, let latest = seen[roomId] else { return false }
                let sent = (info["ts"] as? String).flatMap(Int.init)
                    ?? Int(delivered.date.timeIntervalSince1970 * 1000)
                return latest >= sent
            }
        }
    }

    private static func remove(userId: String, roomId: String) async {
        await remove(userId: userId) { $0.request.content.userInfo["roomId"] as? String == roomId }
    }

    private static func remove(userId: String, where matches: (UNNotification) -> Bool) async {
        let center = UNUserNotificationCenter.current()
        let ids = await center.deliveredNotifications()
            .filter { $0.request.content.userInfo["userId"] as? String == userId && matches($0) }
            .map(\.request.identifier)
        if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
    }

    static func removeDelivered(userId: String) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { delivered in
            let ids = delivered.filter { $0.request.content.userInfo["userId"] as? String == userId }
                .map(\.request.identifier)
            center.removeDeliveredNotifications(withIdentifiers: ids)
        }
    }

    /// A push iOS already delivered for the event is the generic one; the local notice replaces it
    private static func removeDeliveredPushes(eventId: String) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { delivered in
            let ids = NotificationDedup.remoteDuplicates(
                of: delivered.map {
                    NotificationDedup.Delivered(
                        identifier: $0.request.identifier,
                        eventId: ($0.request.content.userInfo["event_id"] as? String)
                            ?? ($0.request.content.userInfo["eventId"] as? String),
                        isRemote: ($0.request.trigger is UNPushNotificationTrigger))
                },
                eventId: eventId)
            guard !ids.isEmpty else { return }
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
        let hasSound = notification.request.content.sound != nil
        let priority = notification.request.content.userInfo["priority"] as? String == "1"
        // The sync path shows its own notification for the same event, so the push adds nothing
        let suppress = NotificationDedup.suppressRemote(
            isRemote: (notification.request.trigger is UNPushNotificationTrigger),
            hasEventId: PushPayload.parse(notification.request.content.userInfo)?.eventId != nil)
        Task { @MainActor in
            guard !suppress else {
                done.value([])
                return
            }
            var options: UNNotificationPresentationOptions = []
            if prefs?.notificationBanners == true { options.formUnion([.banner, .list]) }
            // The app is on screen, so the chosen pack's sound is played here, at the volume setting
            // (and not at all while focused, unless the setting says so)
            if hasSound, prefs?.notificationSounds == true { Sounds.playMessage(priority: priority) }
            done.value(options)
        }
    }
}

private struct Unchecked<Value>: @unchecked Sendable {
    let value: Value
}
