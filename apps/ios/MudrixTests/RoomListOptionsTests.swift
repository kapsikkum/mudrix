import XCTest
import MudrixCore
@testable import Mudrix

/// The DM screen's saved options and their ordering (K1, matching Android's `RoomListOptionsTest`).
final class RoomListOptionsTests: XCTestCase {
    private struct Row {
        let id: String
        let last: Int?
        let created: Int?
        let name: String
    }

    private func sorted(_ rows: [Row], _ mode: RoomSortMode) -> [String] {
        sortRoomRows(rows, mode: mode, lastActivity: \.last, createdAt: \.created, name: \.name).map(\.id)
    }

    func testMissingAccountDataKeepsTheOldAppsOrder() {
        let options = RoomListOptions(content: nil)
        XCTAssertEqual(options.sort, .recent)
        XCTAssertTrue(options.separateRoomsAndDms)
        XCTAssertTrue(options.favouritesSection)
        XCTAssertTrue(options.pinnedUsers.isEmpty)
        XCTAssertEqual(RoomListOptions.eventType, "io.github.kapsikkum.mudrix.room_list")
    }

    func testTheStoredEventIsReadAndUnknownValuesFallBack() {
        let content = JSONValue.object([
            "sort": .string("newest"),
            "separateRoomsAndDms": .bool(false),
            "favouritesSection": .bool(false),
            "pinnedUsers": .array([.string("@a:x"), .string("@a:x"), .string("@b:y")]),
        ])
        let options = RoomListOptions(content: content)
        XCTAssertEqual(options.sort, .newest)
        XCTAssertFalse(options.separateRoomsAndDms)
        XCTAssertFalse(options.favouritesSection)
        XCTAssertEqual(options.pinnedUsers, ["@a:x", "@b:y"])

        let unknown = RoomListOptions(content: .object(["sort": .string("sideways")]))
        XCTAssertEqual(unknown.sort, .recent)
    }

    func testTheEventRoundTrips() {
        let options = RoomListOptions(
            sort: .oldest,
            separateRoomsAndDms: false,
            favouritesSection: false,
            pinnedUsers: ["@a:x", "@b:y"]
        )
        XCTAssertEqual(RoomListOptions(content: options.content), options)
    }

    func testPinningPutsTheNewestFirstAndUnpinningLeavesTheRest() {
        let options = RoomListOptions(pinnedUsers: ["@a:x", "@b:y"])
        XCTAssertEqual(options.withPin("@c:z", pinned: true).pinnedUsers, ["@c:z", "@a:x", "@b:y"])
        XCTAssertEqual(options.withPin("@b:y", pinned: false).pinnedUsers, ["@a:x"])
        XCTAssertEqual(options.withPin("@a:x", pinned: true).pinnedUsers, ["@a:x", "@b:y"])
    }

    func testRecentSortsByLastActivityAndPutsSilentRowsLast() {
        let rows = [
            Row(id: "old", last: 10, created: 10, name: "Old"),
            Row(id: "new", last: 30, created: 10, name: "New"),
            Row(id: "never", last: nil, created: 10, name: "Never"),
            Row(id: "mid", last: 20, created: 10, name: "Mid"),
        ]
        XCTAssertEqual(sorted(rows, .recent), ["new", "mid", "old", "never"])
        // Categorised only changes the headings; inside a group it is still latest activity
        XCTAssertEqual(sorted(rows, .categorised), ["new", "mid", "old", "never"])
    }

    func testNewestAndOldestUseCreationTimeWithStableNames() {
        let rows = [
            Row(id: "b", last: 100, created: 20, name: "Beta"),
            Row(id: "a", last: 100, created: 20, name: "Alpha"),
            Row(id: "oldest", last: 10, created: 5, name: "Oldest"),
            Row(id: "invite", last: 99, created: nil, name: "Invite"),
        ]
        XCTAssertEqual(sorted(rows, .newest), ["a", "b", "oldest", "invite"])
        XCTAssertEqual(sorted(rows, .oldest), ["oldest", "a", "b", "invite"])
    }
}
