import XCTest
@testable import WizardChat

final class UndecryptableRunsTests: XCTestCase {
    func testRunsAreCountedAndTheOldestOfEachIsMarked() {
        let runs = UndecryptableRuns.compute([true, true, true, false, true, false, true, true])
        XCTAssertEqual(runs[0], UndecryptableRuns.Run(count: 3, isFirst: true))
        XCTAssertEqual(runs[1], UndecryptableRuns.Run(count: 3, isFirst: false))
        XCTAssertEqual(runs[2], UndecryptableRuns.Run(count: 3, isFirst: false))
        XCTAssertNil(runs[3])
        XCTAssertEqual(runs[4], UndecryptableRuns.Run(count: 1, isFirst: true))
        XCTAssertNil(runs[5])
        XCTAssertEqual(runs[6], UndecryptableRuns.Run(count: 2, isFirst: true))
        XCTAssertEqual(runs[7], UndecryptableRuns.Run(count: 2, isFirst: false))
    }

    func testNothingUnreadableHasNoRuns() {
        let none = UndecryptableRuns.compute([false, false])
        XCTAssertEqual(none.count, 2)
        XCTAssertTrue(none.allSatisfy { $0 == nil })
        XCTAssertTrue(UndecryptableRuns.compute([]).isEmpty)
    }

    func testHelpDependsOnTheReasonThenOnVerificationThenOnTheBackup() {
        func kind(_ reason: String?, _ verified: Bool) -> UndecryptableRuns.HelpKind {
            UndecryptableRuns.helpKind(reason: reason, sessionVerified: verified)
        }
        XCTAssertEqual(kind("sentBeforeWeJoined", false), .notJoined)
        XCTAssertEqual(kind("withheldBySender", true), .withheld)
        XCTAssertEqual(kind("verificationViolation", true), .senderUntrusted)
        XCTAssertEqual(kind("unsignedDevice", false), .senderUntrusted)
        XCTAssertEqual(kind("unknownDevice", true), .senderUntrusted)
        XCTAssertEqual(kind("historicalMessageAndBackupIsDisabled", false), .unverified)
        XCTAssertEqual(kind(nil, false), .unverified)
        XCTAssertEqual(kind("historicalMessageAndBackupIsDisabled", true), .noBackup)
        XCTAssertEqual(kind("historicalMessageAndDeviceIsUnverified", true), .waiting)
        XCTAssertEqual(kind(nil, true), .waiting)
    }
}
