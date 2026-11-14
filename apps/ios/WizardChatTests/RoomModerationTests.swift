import XCTest
@testable import WizardChat

final class RoomModerationTests: XCTestCase {
    func testReportReasonsAreTrimmed() {
        XCTAssertEqual(RoomModeration.reportReason("  spam  "), "spam")
        XCTAssertEqual(RoomModeration.reportReason(""), "")
        XCTAssertEqual(RoomModeration.reportReason(" \n "), "")
    }

    func testKnocksShowForWhoeverCanAnswerThem() {
        XCTAssertTrue(RoomModeration.showsKnocks(canInvite: true, canKick: false))
        XCTAssertTrue(RoomModeration.showsKnocks(canInvite: false, canKick: true))
        XCTAssertFalse(RoomModeration.showsKnocks(canInvite: false, canKick: false))
    }

    func testAnsweringAKnockNeedsTheMatchingPermission() {
        XCTAssertTrue(RoomModeration.answersKnock(accept: true, canInvite: true, canKick: false))
        XCTAssertFalse(RoomModeration.answersKnock(accept: true, canInvite: false, canKick: true))
        XCTAssertTrue(RoomModeration.answersKnock(accept: false, canInvite: false, canKick: true))
        XCTAssertFalse(RoomModeration.answersKnock(accept: false, canInvite: true, canKick: false))
    }
}
