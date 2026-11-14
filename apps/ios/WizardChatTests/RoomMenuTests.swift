import XCTest
@testable import WizardChat

final class RoomMenuTests: XCTestCase {
    func testAnUnreadRoomIsOnlyMarkedRead() {
        XCTAssertEqual(RoomMenu.actions(readCount: 2, mentionCount: 0),
                       RoomMenu.Actions(markRead: true, markUnread: false))
        XCTAssertEqual(RoomMenu.actions(readCount: 0, mentionCount: 1),
                       RoomMenu.Actions(markRead: true, markUnread: false))
    }

    func testAReadRoomIsOnlyMarkedUnread() {
        XCTAssertEqual(RoomMenu.actions(readCount: 0, mentionCount: 0),
                       RoomMenu.Actions(markRead: false, markUnread: true))
    }

    func testLowPriorityRoomsGoToTheirOwnGroup() {
        XCTAssertTrue(RoomMenu.inLowPriorityGroup(flagged: true, isFavourite: false, sectionTag: nil))
        XCTAssertFalse(RoomMenu.inLowPriorityGroup(flagged: true, isFavourite: true, sectionTag: nil))
        XCTAssertFalse(RoomMenu.inLowPriorityGroup(flagged: true, isFavourite: false, sectionTag: "work"))
        XCTAssertFalse(RoomMenu.inLowPriorityGroup(flagged: false, isFavourite: false, sectionTag: nil))
    }
}
