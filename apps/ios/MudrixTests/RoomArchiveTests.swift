import XCTest
import MudrixCore
@testable import Mudrix

final class RoomArchiveTests: XCTestCase {
    func testArchivedRoomsLeaveTheMainGroups() {
        let rooms = [room("!a"), room("!archived", archived: true), room("!b")]
        XCTAssertEqual(withoutArchived(rooms).map(\.id), ["!a", "!b"])
    }

    func testArchivedGroupIsAppendedLastOnlyWhenNonEmpty() {
        let main = [RoomGroup(kind: .favourites, rooms: [room("!a")]),
                    RoomGroup(kind: .rooms, rooms: [room("!b")])]
        XCTAssertEqual(withArchivedGroup(main, []).map(\.id), ["favourites", "chats"])

        let groups = withArchivedGroup(main, [room("!archived", archived: true)])
        XCTAssertEqual(groups.map(\.id), ["favourites", "chats", "archived"])
        guard let last = groups.last, case .archived = last.kind else { return XCTFail("last group is not the archive") }
        XCTAssertEqual(last.rooms.map(\.id), ["!archived"])
        XCTAssertTrue(groups.dropLast().allSatisfy { $0.rooms.allSatisfy { !$0.isArchived } })
    }

    func testArchiveEntrySaysUnarchiveOnceArchived() {
        XCTAssertEqual(RoomMenu.archiveKey(archived: false), "room.archive")
        XCTAssertEqual(RoomMenu.archiveKey(archived: true), "room.unarchive")
    }

    private func room(_ id: String, archived: Bool = false) -> RoomSummary {
        RoomSummary(id: id, name: id, isDirect: false, isInvite: false, isFavourite: false,
                    unreadMessages: 0, unreadMentions: 0, unreadNotifications: 0, markedUnread: false,
                    isVoice: false, isLowPriority: false, isArchived: archived, isTombstoned: false,
                    isEncrypted: false, memberCount: 1, callParticipants: [], inCall: false,
                    inCallElsewhere: false, isSpace: false, isKnocked: false)
    }
}
