import XCTest
@testable import WizardChat

final class RoomAccessTests: XCTestCase {
    func testJoinRulesMapToOptions() {
        XCTAssertEqual(RoomAccess.of("public"), .publicAccess)
        XCTAssertEqual(RoomAccess.of("restricted"), .spaceMembers)
        XCTAssertEqual(RoomAccess.of("knock"), .knock)
        XCTAssertEqual(RoomAccess.of("knock_restricted"), .knock)
        XCTAssertEqual(RoomAccess.of("invite"), .invite)
        XCTAssertEqual(RoomAccess.of("somethingNew"), .invite)
    }

    func testARuleIsOnlyWrittenWhenItChanges() {
        XCTAssertEqual(RoomAccess.invite.rule(current: .publicAccess), "invite")
        XCTAssertEqual(RoomAccess.spaceMembers.rule(current: .invite), "restricted")
        XCTAssertEqual(RoomAccess.knock.rule(current: .invite), "knock")
        XCTAssertEqual(RoomAccess.publicAccess.rule(current: .invite), "public")
        XCTAssertNil(RoomAccess.publicAccess.rule(current: .publicAccess))
    }

    func testOnlyThePlainKnockRuleNeedsAKnock() {
        XCTAssertTrue(RoomAccess.requiresKnock("knock"))
        XCTAssertFalse(RoomAccess.requiresKnock("knock_restricted"))
        XCTAssertFalse(RoomAccess.requiresKnock("public"))
        XCTAssertFalse(RoomAccess.requiresKnock(nil))
    }

    func testLabels() {
        XCTAssertEqual(RoomAccess.invite.labelKey(rule: "invite"), "room.settings.security.accessInvite")
        XCTAssertEqual(RoomAccess.spaceMembers.labelKey(rule: "restricted"), "room.settings.security.accessSpaceMembers")
        XCTAssertEqual(RoomAccess.knock.labelKey(rule: "knock"), "room.settings.security.accessKnock")
        XCTAssertEqual(RoomAccess.knock.labelKey(rule: "knock_restricted"), "room.settings.auditLog.rule.knock_restricted")
        XCTAssertEqual(RoomAccess.publicAccess.labelKey(rule: "public"), "room.settings.security.accessPublic")
    }

    func testHistoryLabels() {
        XCTAssertEqual(RoomHistory.worldReadable.labelKey, "room.settings.security.historyAnyone")
        XCTAssertEqual(RoomHistory.shared.labelKey, "room.settings.security.historyShared")
        XCTAssertEqual(RoomHistory.invited.labelKey, "room.settings.security.historyInvited")
        XCTAssertEqual(RoomHistory.joined.labelKey, "room.settings.security.historyMembersSinceJoin")
        XCTAssertEqual(RoomHistory(rawValue: "joined"), .joined)
    }
}
