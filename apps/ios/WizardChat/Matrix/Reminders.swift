import Foundation
import UIKit
import UserNotifications
import WizardChatCore

struct Reminder: Equatable, Identifiable {
    let id: String
    let roomId: String
    let eventId: String
    /// When it falls due, in milliseconds since 1970
    let at: Int64
}

enum ReminderPreset: CaseIterable {
    case in20m, in1h, in3h, tomorrow

    var labelKey: String {
        switch self {
        case .in20m: return "timeline.remind.in20m"
        case .in1h: return "timeline.remind.in1h"
        case .in3h: return "timeline.remind.in3h"
        case .tomorrow: return "timeline.remind.tomorrow"
        }
    }
}

/// "Remind me" reminders in the `io.github.kapsikkum.mudrix.reminders` account data like the web
/// (`util/reminders.ts`): only room and event ids.
///
/// There is no server-side scheduling. Each device schedules a local notification for every reminder it
/// knows, so it goes off even when the app is closed; while the app runs, the reminder that falls due
/// is removed from the list first (whoever removes it first delivers it), which also cancels it on
/// the other devices that sync. A device whose app is closed cannot learn that another one delivered it.
@MainActor
final class Reminders: ObservableObject {
    static let shared = Reminders()

    static let type = Namespace.mudrixKey("reminders")
    static let types = [type, Namespace.legacyMudrixKey("reminders")]

    @Published private(set) var items: [Reminder] = []

    private var subscriptions: [Subscription] = []
    private var contents: [String: JSONValue] = [:]
    private var timers: [String: Task<Void, Never>] = [:]
    private var scheduled: Set<String> = []
    private var delivering: Set<String> = []
    private var client: WizardClient?
    private var userId = ""
    private var roomName: (String) -> String? = { _ in nil }

    /// `roomName` gives a room's name for the notification's title
    func start(client: WizardClient, roomName: @escaping (String) -> String?) {
        stop()
        self.client = client
        self.roomName = roomName
        userId = client.userId ?? ""
        for type in Self.types {
            let subscription = client.watchAccountData(eventType: type) { [weak self] content in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if let content { self.contents[type] = content } else { self.contents.removeValue(forKey: type) }
                    self.items = Self.parse(Self.types.compactMap { self.contents[$0] }.first)
                    self.schedule()
                }
            }
            subscriptions.append(subscription)
        }
    }

    func stop() {
        subscriptions.forEach { $0.cancel() }
        subscriptions = []
        timers.values.forEach { $0.cancel() }
        timers = [:]
        contents = [:]
        scheduled = []
        delivering = []
        items = []
        client = nil
    }

    func add(client: WizardClient, roomId: String, eventId: String, at: Int64) async throws {
        let reminder = Reminder(id: Self.newId(), roomId: roomId, eventId: eventId, at: at)
        let current = Self.parse(await client.firstAccountData(Self.types))
        try await client.setAccountData(eventType: Self.type, content: Self.toContent(current + [reminder]))
    }

    /// Removes a reminder; false when it was already gone (another device delivered or cancelled it)
    @discardableResult
    func remove(client: WizardClient, id: String) async throws -> Bool {
        let current = Self.parse(await client.firstAccountData(Self.types))
        guard current.contains(where: { $0.id == id }) else { return false }
        try await client.setAccountData(eventType: Self.type, content: Self.toContent(current.filter { $0.id != id }))
        return true
    }

    // MARK: Delivery

    private func notificationId(_ id: String) -> String { "reminder|\(userId)|\(id)" }

    private func schedule() {
        let live = Set(items.map(\.id))
        let center = UNUserNotificationCenter.current()
        for id in timers.keys where !live.contains(id) {
            timers.removeValue(forKey: id)?.cancel()
        }
        let gone = scheduled.subtracting(live)
        if !gone.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: gone.map(notificationId))
            scheduled.subtract(gone)
        }
        for reminder in items where timers[reminder.id] == nil {
            timers[reminder.id] = Task { [weak self] in
                // A very distant reminder is waited for in steps
                while !Task.isCancelled {
                    let wait = Double(reminder.at - SavedMessages.nowMs) / 1000
                    if wait <= 0 { break }
                    try? await Task.sleep(for: .seconds(min(wait, 6 * 3600)))
                }
                guard !Task.isCancelled else { return }
                await self?.deliver(reminder)
            }
            if !scheduled.contains(reminder.id), reminder.at > SavedMessages.nowMs {
                scheduled.insert(reminder.id)
                Task { await self.scheduleNotification(reminder) }
            }
        }
    }

    private func firstLine(of reminder: Reminder) async -> String {
        guard let client else { return "" }
        let preview = await SavedMessages.resolve(client: client, roomId: reminder.roomId, eventId: reminder.eventId)
        return preview?.body.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
    }

    private func content(for reminder: Reminder, body: String) -> UNMutableNotificationContent {
        let name = roomName(reminder.roomId)
        let content = UNMutableNotificationContent()
        content.title = String(localized: "reminders.title") + (name.map { " \u{00B7} \($0)" } ?? "")
        content.body = body
        content.userInfo = ["roomId": reminder.roomId, "eventId": reminder.eventId, "userId": userId, "priority": "1"]
        if Sounds.prefs?.notificationSounds == true { content.sound = .default }
        return content
    }

    /// A notification that goes off when the reminder falls due, even if the app is closed by then
    private func scheduleNotification(_ reminder: Reminder) async {
        let body = await firstLine(of: reminder)
        guard scheduled.contains(reminder.id) else { return }
        let seconds = max(Double(reminder.at - SavedMessages.nowMs) / 1000, 1)
        let request = UNNotificationRequest(
            identifier: notificationId(reminder.id), content: content(for: reminder, body: body),
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false))
        try? await UNUserNotificationCenter.current().add(request)
    }

    private func deliver(_ reminder: Reminder) async {
        guard let client, delivering.insert(reminder.id).inserted else { return }
        defer { delivering.remove(reminder.id) }
        do {
            // Whoever removes it first delivers it; a device that finds it gone stays quiet
            guard try await remove(client: client, id: reminder.id) else { return }
        } catch {
            // Offline: tried again on the next change or start-up
            timers.removeValue(forKey: reminder.id)
            return
        }
        timers.removeValue(forKey: reminder.id)
        scheduled.remove(reminder.id)
        let center = UNUserNotificationCenter.current()
        let identifier = notificationId(reminder.id)
        let alreadyShown = await center.deliveredNotifications().contains { $0.request.identifier == identifier }
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        if alreadyShown { return }
        let body = await firstLine(of: reminder)
        if UIApplication.shared.applicationState == .active {
            let title = String(localized: "reminders.title")
            CopyToast.shared.show([title, body].filter { !$0.isEmpty }.joined(separator: ": "))
        } else {
            let request = UNNotificationRequest(identifier: identifier, content: content(for: reminder, body: body), trigger: nil)
            try? await center.add(request)
        }
    }

    // MARK: Pure parts

    nonisolated static func newId() -> String {
        let now = String(Int(Date().timeIntervalSince1970 * 1000), radix: 36)
        return now + String(UInt32.random(in: 0..<UInt32.max), radix: 36)
    }

    /// The pending reminders, soonest first; entries without all four fields are dropped
    nonisolated static func parse(_ content: JSONValue?) -> [Reminder] {
        guard let list = content?["items"]?.array else { return [] }
        let reminders: [Reminder] = list.compactMap { item in
            guard let id = item["id"]?.string, let roomId = item["roomId"]?.string,
                  let eventId = item["eventId"]?.string, let at = item["at"]?.number else { return nil }
            return Reminder(id: id, roomId: roomId, eventId: eventId, at: Int64(at))
        }
        return reminders.sorted { $0.at < $1.at }
    }

    nonisolated static func toContent(_ items: [Reminder]) -> JSONValue {
        .object(["items": .array(items.map {
            .object(["id": .string($0.id), "roomId": .string($0.roomId), "eventId": .string($0.eventId), "at": .number(Double($0.at))])
        })])
    }

    /// When a preset falls due; "tomorrow" is 9:00 the next morning, local time
    nonisolated static func time(_ preset: ReminderPreset, now: Date = Date(), calendar: Calendar = .current) -> Int64 {
        let date: Date
        switch preset {
        case .in20m: date = now.addingTimeInterval(20 * 60)
        case .in1h: date = now.addingTimeInterval(60 * 60)
        case .in3h: date = now.addingTimeInterval(3 * 60 * 60)
        case .tomorrow:
            let next = calendar.date(byAdding: .day, value: 1, to: now) ?? now.addingTimeInterval(24 * 60 * 60)
            date = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: next) ?? next
        }
        return Int64(date.timeIntervalSince1970 * 1000)
    }
}
