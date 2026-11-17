import XCTest
import MudrixCore
@testable import Mudrix

/// Mirrors Android's `matrix/AloneTrackerTest`: the web AloneNotice's rules
@MainActor
final class AloneTrackerTests: XCTestCase {
    private let ringing = CallManager.RingState.ringing
    private var unanswered: CallManager.RingState { .unanswered }

    func testNothingHappensWhileTheOtherPersonIsThere() {
        let tracker = AloneTracker()
        tracker.update(isDirect: true, joined: true, others: 1, ring: nil, now: 0)
        XCTAssertEqual(tracker.phase, .idle)
    }

    func testAloneAfterSomeoneLeftWaitsThenCountsDownThenEnds() {
        let tracker = AloneTracker(graceMs: 10, countdownMs: 60)
        tracker.update(isDirect: true, joined: true, others: 1, ring: nil, now: 0)
        tracker.update(isDirect: true, joined: true, others: 0, ring: nil, now: 100)
        XCTAssertEqual(tracker.phase, .waiting(until: 110))
        XCTAssertFalse(tracker.tick(now: 105))
        XCTAssertFalse(tracker.tick(now: 110))
        XCTAssertEqual(tracker.phase, .counting(endsAt: 170))
        XCTAssertFalse(tracker.tick(now: 169))
        XCTAssertTrue(tracker.tick(now: 170))
        XCTAssertEqual(tracker.phase, .idle)
    }

    func testNeverHavingHadCompanyAndStillRingingIsFine() {
        let tracker = AloneTracker()
        tracker.update(isDirect: true, joined: true, others: 0, ring: ringing, now: 0)
        XCTAssertEqual(tracker.phase, .idle)
        tracker.update(isDirect: true, joined: true, others: 0, ring: nil, now: 5)
        XCTAssertEqual(tracker.phase, .idle)
    }

    func testAnUnansweredCallCountsAsAlone() {
        let tracker = AloneTracker()
        tracker.update(isDirect: true, joined: true, others: 0, ring: unanswered, now: 0)
        XCTAssertEqual(tracker.phase, .waiting(until: AloneTracker.graceMs))
    }

    func testStayingSilencesUntilSomeoneJoins() {
        let tracker = AloneTracker(graceMs: 10, countdownMs: 60)
        tracker.update(isDirect: true, joined: true, others: 1, ring: nil, now: 0)
        tracker.update(isDirect: true, joined: true, others: 0, ring: nil, now: 1)
        tracker.tick(now: 20)
        tracker.stay()
        tracker.update(isDirect: true, joined: true, others: 0, ring: nil, now: 30)
        XCTAssertEqual(tracker.phase, .idle)
        tracker.update(isDirect: true, joined: true, others: 1, ring: nil, now: 40)
        tracker.update(isDirect: true, joined: true, others: 0, ring: nil, now: 50)
        XCTAssertEqual(tracker.phase, .waiting(until: 60))
    }

    func testGroupCallsAndUnjoinedCallsNeverNotify() {
        let tracker = AloneTracker()
        tracker.update(isDirect: false, joined: true, others: 0, ring: nil, now: 0)
        XCTAssertEqual(tracker.phase, .idle)
        tracker.update(isDirect: true, joined: false, others: 0, ring: nil, now: 0)
        XCTAssertEqual(tracker.phase, .idle)
    }

    func testSecondsLeftRoundsUp() {
        let tracker = AloneTracker(graceMs: 0, countdownMs: 60_000)
        tracker.update(isDirect: true, joined: true, others: 1, ring: nil, now: 0)
        tracker.update(isDirect: true, joined: true, others: 0, ring: nil, now: 0)
        tracker.tick(now: 0)
        XCTAssertEqual(tracker.secondsLeft(now: 0), 60)
        XCTAssertEqual(tracker.secondsLeft(now: 59_500), 1)
    }
}
