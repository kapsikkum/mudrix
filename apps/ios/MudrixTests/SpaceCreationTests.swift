import XCTest
import MudrixCore
@testable import Mudrix

/// What a new space starts with (R1), as the web's `CreateSpaceModal`
final class SpaceCreationTests: XCTestCase {
    func testAMatrixSpaceStartsWithItsStyleOnly() {
        let state = SpaceModern.creationState(style: .matrix)
        XCTAssertEqual(state.count, 1)
        XCTAssertEqual(state[0]["type"]?.string, "io.github.kapsikkum.mudrix.space_list_style")
        XCTAssertEqual(state[0]["content"]?["style"]?.string, "matrix")
    }

    func testAModernSpaceAlsoAutoJoinsItsRooms() {
        let state = SpaceModern.creationState(style: .modern)
        XCTAssertEqual(state.count, 2)
        XCTAssertEqual(state[0]["content"]?["style"]?.string, "modern")
        XCTAssertEqual(state[1]["type"]?.string, "io.github.kapsikkum.mudrix.space_auto_join")
        XCTAssertEqual(state[1]["content"]?["enabled"]?.bool, true)
    }

    func testStateEventsHaveAnEmptyStateKey() {
        for style in [RoomListStyle.matrix, .modern] {
            for event in SpaceModern.creationState(style: style) {
                XCTAssertEqual(event["state_key"]?.string, "")
            }
        }
    }

    func testNewSpacesAreLockedDownLikeTheWebs() {
        let levels = SpaceModern.newSpacePowerLevels
        XCTAssertEqual(levels["invite"]?.number, 100)
        XCTAssertEqual(levels["state_default"]?.number, 50)
        XCTAssertEqual(levels["users_default"]?.number, 0)
        XCTAssertEqual(levels["events"]?["m.room.power_levels"]?.number, 100)
        XCTAssertEqual(levels["events"]?["m.room.message"]?.number, 50)
    }
}
