import Foundation
import WizardChatCore

/// A text message the homeserver will send later (MSC4140), as the "Send later" list shows it
struct ScheduledMessage: Equatable, Identifiable {
    let delayId: String
    let roomId: String
    let body: String
    /// Epoch milliseconds at which the server sends it
    let sendAt: Int
    var id: String { delayId }
}

/// The rules of "Send later": which delayed events are messages of a room, when they go, and why a request was refused
enum ScheduledMessages {
    /// Nearer than this is not "later"; the server may also drop such a delay
    static let minDelayMs = 5_000

    private static let messageType = "m.room.message"

    /// The room's scheduled text messages, soonest first; state events and other event types are not shown
    static func of(_ events: [DelayedEvent], roomId: String) -> [ScheduledMessage] {
        events
            .filter { $0.roomId == roomId && $0.eventType == messageType && $0.stateKey == nil }
            .map { event in
                var body = ""
                if case .object(let object) = event.content, case .string(let text)? = object["body"] { body = text }
                return ScheduledMessage(delayId: event.delayId, roomId: event.roomId, body: body,
                                        sendAt: event.runningSince + event.delayMs)
            }
            .sorted { $0.sendAt < $1.sendAt }
    }

    static func delay(for sendAt: Int, now: Int) -> Int { sendAt - now }

    static func isSchedulable(_ sendAt: Int, now: Int) -> Bool { delay(for: sendAt, now: now) >= minDelayMs }

    /// An hour from now, the first preset
    static func inOneHour(now: Int) -> Int { now + 60 * 60 * 1000 }

    /// Tomorrow at 9:00 in the calendar's zone
    static func tomorrowMorning(now: Int, calendar: Calendar = .current) -> Int {
        let today = Date(timeIntervalSince1970: Double(now) / 1000)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: today)) ?? today
        let nine = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow) ?? tomorrow
        return Int(nine.timeIntervalSince1970 * 1000)
    }

    /// The message as an `m.room.message` content, the way a normal send would build it
    static func content(body: String, html: String? = nil, mentionedUserIds: [String] = [],
                        replyTo: String? = nil, threadRoot: String? = nil) -> JSONValue {
        var content: [String: JSONValue] = ["msgtype": .string("m.text"), "body": .string(body)]
        if let html, html != body {
            content["format"] = .string("org.matrix.custom.html")
            content["formatted_body"] = .string(html)
        }
        var seen = Set<String>()
        let users = mentionedUserIds.filter { seen.insert($0).inserted }
        if !users.isEmpty { content["m.mentions"] = .object(["user_ids": .array(users.map { .string($0) })]) }
        if let threadRoot {
            content["m.relates_to"] = .object([
                "rel_type": .string("m.thread"),
                "event_id": .string(threadRoot),
                "is_falling_back": .bool(replyTo == nil),
                "m.in_reply_to": .object(["event_id": .string(replyTo ?? threadRoot)]),
            ])
        } else if let replyTo {
            content["m.relates_to"] = .object(["m.in_reply_to": .object(["event_id": .string(replyTo)])])
        }
        return .object(content)
    }

    /// The notice (locale key) for a refused request; nil for any other error, which shows its text
    static func noticeKey(for error: Error) -> String? {
        switch (error as? WizardError)?.code {
        case "unsupportedByServer": "composer.schedule.unsupported"
        case "unsupported": "composer.schedule.encrypted"
        default: nil
        }
    }
}
