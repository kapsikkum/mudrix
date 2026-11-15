import XCTest
@testable import Mudrix

/// A thread row's age labels, with the boundaries of the web's `ThreadListPanel` (A8)
final class ThreadAgeTests: XCTestCase {
    private let now = 1_800_000_000_000

    func testUnderAMinuteIsNow() {
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now, now: now), .now)
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 59_999, now: now), .now)
    }

    func testThenMinutesUpToAnHour() {
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 60_000, now: now), .minutes(1))
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 59 * 60_000, now: now), .minutes(59))
    }

    func testThenHoursUpToADay() {
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 3_600_000, now: now), .hours(1))
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 23 * 3_600_000, now: now), .hours(23))
    }

    func testThenDaysUpToAWeek() {
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 86_400_000, now: now), .days(1))
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 6 * 86_400_000, now: now), .days(6))
    }

    func testAWeekOrMoreIsADate() {
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 7 * 86_400_000, now: now), .old)
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now - 400 * 86_400_000, now: now), .old)
    }

    func testAClockThatIsAheadCountsAsNow() {
        XCTAssertEqual(DisplayFormats.timeAgo(timestamp: now + 60_000, now: now), .now)
    }
}
