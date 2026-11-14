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

/// Registers the pusher (apns) or keeps the app syncing in the background (keepalive)
@MainActor
enum Push {
    static let refreshTaskId = "chat.mudrix.mobile.refresh"
    private static let lastKeyDefaults = "push.pushkey"
    /// Set by the app: the signed-in client, and how to start or stop syncing from a background task
    static var client: () -> WizardClient? = { nil }
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
        // Bumped when the payload below changes, so phones that registered the old one register again
        let marker = "2|\(client.userId ?? "")|\(pushkey)|\(PushMode.gateway)"
        guard UserDefaults.standard.string(forKey: lastKeyDefaults) != marker else { return }
        do {
            try await client.setPusher(config: PusherConfig(
                appId: appId, pushkey: pushkey, gatewayUrl: PushMode.gateway,
                appName: "Mudrix", deviceName: MatrixSession.deviceName,
                lang: Locale.current.identifier,
                defaultPayload: Self.defaultPayload))
            UserDefaults.standard.set(marker, forKey: lastKeyDefaults)
        } catch {
            NSLog("Push: couldn't register the pusher: \(error)")
        }
    }

    /// What the gateway adds to every notification (`default_payload`): iOS only shows, and only
    /// runs the notification service extension for, a push with an `aps.alert`. `mutable-content`
    /// lets the extension replace the generic text with the room's name; `content-available` keeps
    /// the app's chance to fetch the message early while it is running.
    ///
    /// The text is the app's own, in the user's language, because the gateway has neither: it only
    /// sees the event's ids (`event_id_only` format), which is also why message text never reaches
    /// it. The notification service extension replaces what it can (the room's name).
    private static var defaultPayload: JSONValue {
        .object([
            "aps": .object([
                "alert": .object([
                    "title": .string(String(localized: "app.name")),
                    "body": .string(String(localized: "common.newMessage")),
                ]),
                "sound": .string("default"),
                "mutable-content": .number(1),
                "content-available": .number(1),
            ]),
        ])
    }

    /// A push arrived while the app is running. In apns mode the gateway's alert is what iOS shows
    /// (and the notification service extension fills in), so nothing is posted here: a local copy
    /// would show the same message twice. Only a "you have read everything" push still clears the
    /// delivered notifications. Keep-alive mode never gets here.
    static func handle(_ userInfo: [AnyHashable: Any]) async {
        guard let payload = PushPayload.parse(userInfo), let client = client() else { return }
        guard payload.roomId == nil || payload.eventId == nil else { return }
        if payload.unread == 0 { MessageNotifier.removeDelivered(userId: client.userId ?? "") }
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
