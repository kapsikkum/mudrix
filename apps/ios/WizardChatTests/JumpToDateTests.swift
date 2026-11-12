import XCTest
import WizardChatCore
@testable import WizardChat

final class JumpToDateTests: XCTestCase {
    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    func testStartOfDayIsMidnight() {
        let noon = Date(timeIntervalSince1970: 1_700_000_000 + 12 * 3600)
        let start = JumpToDate.startOfDay(noon, calendar: utc)
        XCTAssertEqual(start % 86_400_000, 0)
        XCTAssertLessThanOrEqual(start, Int(noon.timeIntervalSince1970 * 1000))
    }

    func testTakesTheFirstMessageOnOrAfter() async throws {
        var asked: [SearchDirection] = []
        let found = try await JumpToDate.eventNear(1000) { at, direction in
            asked.append(direction)
            return TimestampEvent(eventId: "$a", timestamp: at)
        }
        XCTAssertEqual(found, "$a")
        XCTAssertEqual(asked, [.forward])
    }

    func testFallsBackToTheClosestEarlier() async throws {
        let found = try await JumpToDate.eventNear(1000) { _, direction in
            direction == .backward ? TimestampEvent(eventId: "$old", timestamp: 900) : nil
        }
        XCTAssertEqual(found, "$old")
    }

    func testEmptyRoomFindsNothing() async throws {
        let found = try await JumpToDate.eventNear(1000) { _, _ in nil }
        XCTAssertNil(found)
    }

    func testNotices() {
        XCTAssertEqual(JumpToDate.noticeKey(for: WizardError(code: "unsupportedByServer", message: "")), "room.jumpToDate.unsupported")
        XCTAssertEqual(JumpToDate.noticeKey(for: WizardError(code: "other", message: "")), "room.jumpToDate.failed")
    }
}
