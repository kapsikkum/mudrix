import XCTest
import WizardChatCore
@testable import WizardChat

final class InviteBlockingTests: XCTestCase {
    func testTheStableFeaturePicksTheStableType() {
        XCTAssertEqual(InviteBlocking.eventType(unstableFeatures: ["org.matrix.msc4380.stable"]),
                       "m.invite_permission_config")
    }

    func testTheUnstableFeaturePicksTheUnstableType() {
        XCTAssertEqual(InviteBlocking.eventType(unstableFeatures: ["org.matrix.msc4380"]),
                       "org.matrix.msc4380.invite_permission_config")
    }

    func testStableWinsWhenBothAreAdvertised() {
        XCTAssertEqual(InviteBlocking.eventType(unstableFeatures: ["org.matrix.msc4380", "org.matrix.msc4380.stable"]),
                       InviteBlocking.stableType)
    }

    func testAServerWithoutTheFeatureHasNoType() {
        XCTAssertNil(InviteBlocking.eventType(unstableFeatures: []))
        XCTAssertNil(InviteBlocking.eventType(unstableFeatures: ["org.matrix.msc4380.something"]))
    }

    func testBlockedContentIsRead() {
        XCTAssertTrue(InviteBlocking.isBlocked(.object(["default_action": .string("block")])))
        XCTAssertFalse(InviteBlocking.isBlocked(.object(["default_action": .string("allow")])))
        XCTAssertFalse(InviteBlocking.isBlocked(.object([:])))
        XCTAssertFalse(InviteBlocking.isBlocked(nil))
    }

    func testContentFollowsTheChoice() {
        XCTAssertEqual(InviteBlocking.content(blocked: true), .object(["default_action": .string("block")]))
        XCTAssertEqual(InviteBlocking.content(blocked: false), .object([:]))
    }
}
