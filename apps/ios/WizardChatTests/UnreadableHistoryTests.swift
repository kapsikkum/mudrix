import XCTest
@testable import WizardChat

final class UnreadableHistoryTests: XCTestCase {
    func testMostlyUnreadablePageCounts() {
        XCTAssertTrue(UnreadableHistory.isUnreadablePage(added: 10, unreadable: 9))
        XCTAssertFalse(UnreadableHistory.isUnreadablePage(added: 10, unreadable: 8))
        XCTAssertFalse(UnreadableHistory.isUnreadablePage(added: 0, unreadable: 0))
    }

    func testTwoUnreadablePagesPause() {
        var history = UnreadableHistory()
        history.record(added: 80, unreadable: 80)
        XCTAssertFalse(history.paused)
        history.record(added: 80, unreadable: 79)
        XCTAssertTrue(history.paused)
    }

    func testReadablePageResumes() {
        var history = UnreadableHistory()
        history.record(added: 80, unreadable: 80)
        history.record(added: 80, unreadable: 80)
        history.record(added: 80, unreadable: 5)
        XCTAssertFalse(history.paused)
    }

    func testEmptyPageChangesNothing() {
        var history = UnreadableHistory()
        history.record(added: 80, unreadable: 80)
        history.record(added: 0, unreadable: 0)
        history.record(added: 80, unreadable: 80)
        XCTAssertTrue(history.paused)
    }

    func testResetClearsThePause() {
        var history = UnreadableHistory()
        history.record(added: 80, unreadable: 80)
        history.record(added: 80, unreadable: 80)
        history.reset()
        XCTAssertFalse(history.paused)
    }
}
