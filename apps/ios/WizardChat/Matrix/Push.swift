import Foundation
import UIKit
import BackgroundTasks
import WizardChatCore

/// How notifications reach the phone while the app is closed; chosen when building (`WZ_PUSH_MODE`)
enum PushMode: String {
    /// Apple's push service through a Matrix push gateway: needs the Push Notifications capability and a gateway
    case apns
    /// No server: the system wakes the app now and then to sync (BGAppRefreshTask)
    case keepalive

    static func parse(_ raw: String?) -> PushMode {
        guard let raw, let mode = PushMode(rawValue: raw.trimmingCharacters(in: .whitespaces).lowercased()) else { return .keepalive }
        return mode
    }

    static var current: PushMode { parse(Bundle.main.object(forInfoDictionaryKey: "WZPushMode") as? String) }

    /// The Matrix push gateway's notify URL (`WZ_PUSH_GATEWAY_URL`); empty registers no pusher
    static var gateway: String {
        (Bundle.main.object(forInfoDictionaryKey: "WZPushGateway") as? String)?
            .trimmingCharacters(in: .whitespaces) ?? ""
    }
}

/// What a push gateway forwards: the ids the app needs to fetch the message itself
struct PushPayload: Equatable {
    var roomId: String?
    var eventId: String?
    var unread: Int?

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
        } else if let value = source["unread"] {
            unread = (value as? Int) ?? (value as? String).flatMap(Int.init)
        }
        let payload = PushPayload(roomId: text("room_id"), eventId: text("event_id"), unread: unread)
        return payload.roomId == nil && payload.eventId == nil && payload.unread == nil ? nil : payload
    }

    /// The device token as the hex string a push gateway expects as pushkey
    static func pushkey(from token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }
}

/// Registers the pusher (apns) or keeps the app syncing in the background (keepalive)
@MainActor
enum Push {
    static let refreshTaskId = "chat.mudrix.mobile.refresh"
    private static let lastKeyDefaults = "push.pushkey"
    /// Set by the app: the signed-in client, and what to do with a message that arrived while closed
    static var client: () -> WizardClient? = { nil }
    static var show: (WizardChatCore.Notification) -> Void = { _ in }
    static var resume: () async -> Void = {}
    static var pause: () async -> Void = {}

    /// Asks the system for a device token (apns mode only)
    static func requestToken() {
        guard PushMode.current == .apns, !PushMode.gateway.isEmpty else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// Points the signed-in account's pusher at this device's token
    static func register(token: Data) async {
        guard PushMode.current == .apns, !PushMode.gateway.isEmpty, let client = client() else { return }
        let pushkey = PushPayload.pushkey(from: token)
        let appId = Bundle.main.bundleIdentifier ?? "chat.mudrix.mobile"
        let marker = "\(client.userId ?? "")|\(pushkey)|\(PushMode.gateway)"
        guard UserDefaults.standard.string(forKey: lastKeyDefaults) != marker else { return }
        do {
            try await client.setPusher(config: PusherConfig(
                appId: appId, pushkey: pushkey, gatewayUrl: PushMode.gateway,
                appName: "Mudrix", deviceName: MatrixSession.deviceName,
                lang: Locale.current.identifier))
            UserDefaults.standard.set(marker, forKey: lastKeyDefaults)
        } catch {
            NSLog("Push: couldn't register the pusher: \(error)")
        }
    }

    /// A silent push arrived: fetch the message it is about and show it unless the app is syncing already
    static func handle(_ userInfo: [AnyHashable: Any]) async {
        guard let payload = PushPayload.parse(userInfo), let client = client() else { return }
        guard let roomId = payload.roomId, let eventId = payload.eventId else {
            if payload.unread == 0 { MessageNotifier.removeDelivered(userId: client.userId ?? "") }
            return
        }
        guard UIApplication.shared.applicationState != .active else { return }
        if let notification = try? await client.pushedNotification(roomId: roomId, eventId: eventId) {
            show(notification)
        }
    }

    // MARK: keep-alive

    static func registerBackgroundRefresh() {
        guard PushMode.current == .keepalive else { return }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshTaskId, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            Task { @MainActor in await runRefresh(task) }
        }
    }

    static func scheduleRefresh() {
        guard PushMode.current == .keepalive else { return }
        let request = BGAppRefreshTaskRequest(identifier: refreshTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func runRefresh(_ task: BGAppRefreshTask) async {
        scheduleRefresh()
        let work = Task {
            await resume()
            try? await Task.sleep(for: .seconds(20))
            await pause()
        }
        task.expirationHandler = { work.cancel() }
        await work.value
        task.setTaskCompleted(success: !work.isCancelled)
    }
}

/// Receives the device token and silent pushes, which SwiftUI's `App` has no hook for
final class PushAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        MainActor.assumeIsolated { Push.registerBackgroundRefresh() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in await Push.register(token: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NSLog("Push: no device token: \(error)")
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        Task { @MainActor in
            await Push.handle(userInfo)
            completionHandler(.newData)
        }
    }
}
