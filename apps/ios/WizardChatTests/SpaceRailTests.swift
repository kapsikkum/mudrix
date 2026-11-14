import XCTest
@testable import WizardChat

final class SpaceRailTests: XCTestCase {
    private func space(_ id: String, _ name: String? = nil) -> RailSpace {
        RailSpace(id: id, name: name ?? id, avatarUrl: nil)
    }

    private func room(_ spaceIds: [String] = [], unread: Bool = false, mentions: Int = 0) -> RailRoom {
        RailRoom(spaceIds: Set(spaceIds), unread: unread, mentions: mentions)
    }

    func testDirectMessagesComeFirstAndOnlyCountRoomsInNoSpace() {
        let slots = SpaceRail.slots(
            spaces: [space("!a"), space("!b")],
            rooms: [room(unread: true), room(["!a"], mentions: 2), room(["!b"])]
        )
        XCTAssertEqual(slots.map { $0.space?.id }, [nil, "!a", "!b"])
        XCTAssertTrue(slots[0].unread)
        XCTAssertEqual(slots[0].mentions, 0)
        XCTAssertTrue(slots[1].unread)
        XCTAssertEqual(slots[1].mentions, 2)
        XCTAssertFalse(slots[2].unread)
        XCTAssertEqual(slots[2].mentions, 0)
    }

    func testASpacesRoomsAggregateMentionsAndStayUnreadWithAMentionAlone() {
        let slots = SpaceRail.slots(
            spaces: [space("!a")],
            rooms: [room(["!a"], mentions: 3), room(["!a"], mentions: 4), room(["!a"], unread: true)]
        )
        XCTAssertTrue(slots[1].unread)
        XCTAssertEqual(slots[1].mentions, 7)
    }

    func testARoomInASpaceIsNotCountedAtHome() {
        let slots = SpaceRail.slots(spaces: [space("!a")], rooms: [room(["!a"], unread: true)])
        XCTAssertFalse(slots[0].unread)
        XCTAssertTrue(slots[1].unread)
    }

    func testBadgesHideZeroAndCapAtNinetyNinePlus() {
        XCTAssertNil(SpaceRail.badge(0))
        XCTAssertNil(SpaceRail.badge(-1))
        XCTAssertEqual(SpaceRail.badge(1), "1")
        XCTAssertEqual(SpaceRail.badge(99), "99")
        XCTAssertEqual(SpaceRail.badge(100), "99+")
        XCTAssertEqual(SpaceRail.badge(4321), "99+")
    }

    func testTheRememberedSpaceFallsBackToDirectMessagesWhenItIsGone() {
        let spaces = [space("!a"), space("!b")]
        XCTAssertEqual(SpaceRail.selected("!b", in: spaces)?.id, "!b")
        XCTAssertNil(SpaceRail.selected("!gone", in: spaces))
        XCTAssertNil(SpaceRail.selected(nil, in: spaces))
    }
}
