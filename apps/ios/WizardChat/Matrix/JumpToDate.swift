import Foundation
import WizardChatCore

/// The rules of "Jump to date": which message to open for a day, and why a jump was refused.
/// The web app has the same logic in apps/web/src/app/features/timeline/jumpToDate.ts.
enum JumpToDate {
    typealias Lookup = (_ timestamp: Int, _ direction: SearchDirection) async throws -> TimestampEvent?

    /// Local midnight of the day containing [date], in milliseconds since the Unix epoch (not UTC)
    static func startOfDay(_ date: Date, calendar: Calendar = .current) -> Int {
        Int(calendar.startOfDay(for: date).timeIntervalSince1970 * 1000)
    }

    /// The message to open for a date: the first one at or after it, or the closest earlier one when the room
    /// has nothing newer (jumping past its last message). Nil for an empty room.
    static func eventNear(_ timestamp: Int, lookup: Lookup) async throws -> String? {
        if let forward = try await lookup(timestamp, .forward) { return forward.eventId }
        return try await lookup(timestamp, .backward)?.eventId
    }

    /// The notice (locale key) for a refused jump
    static func noticeKey(for error: Error) -> String {
        (error as? WizardError)?.code == "unsupportedByServer" ? "room.jumpToDate.unsupported" : "room.jumpToDate.failed"
    }
}
