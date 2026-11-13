import XCTest
@testable import WizardChat

final class RoomUpgradeTests: XCTestCase {
    func testPrivateRoomsInviteTheirMembersToTheNewRoom() {
        XCTAssertTrue(RoomUpgrade.invitesMembers(joinRule: "invite"))
        XCTAssertTrue(RoomUpgrade.invitesMembers(joinRule: "restricted"))
        XCTAssertTrue(RoomUpgrade.invitesMembers(joinRule: "knock"))
        XCTAssertFalse(RoomUpgrade.invitesMembers(joinRule: "public"))
    }
}
