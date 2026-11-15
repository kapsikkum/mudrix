import XCTest
@testable import Mudrix

/// Mirrors Android's `matrix/rtc/CallTimerTest`: the web room list's `formatElapsed`
final class CallTimerTests: XCTestCase {
    func testFormatsLikeTheWeb() {
        XCTAssertEqual(CallTimer.format(0), "0:00")
        XCTAssertEqual(CallTimer.format(-5_000), "0:00")
        XCTAssertEqual(CallTimer.format(59_999), "0:59")
        XCTAssertEqual(CallTimer.format(65_000), "1:05")
        XCTAssertEqual(CallTimer.format(3_599_000), "59:59")
        XCTAssertEqual(CallTimer.format(3_600_000), "1:00:00")
        XCTAssertEqual(CallTimer.format(12 * 3_600_000 + 3 * 60_000 + 7_000), "12:03:07")
    }
}
