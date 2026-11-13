import XCTest
import WizardChatCore
@testable import WizardChat

final class MutualRoomsTests: XCTestCase {
    func testTheAnswerIsItsRoomIds() {
        let body = Data(#"{"joined":["!a:example.org","!b:example.org"]}"#.utf8)
        XCTAssertEqual(MutualRoomsLookup.parseJoined(body), ["!a:example.org", "!b:example.org"])
    }

    func testItemsThatAreNotIdsAreLeftOut() {
        let body = Data(#"{"joined":["!a:example.org",3,null,{"id":"!b"}]}"#.utf8)
        XCTAssertEqual(MutualRoomsLookup.parseJoined(body), ["!a:example.org"])
    }

    func testABodyWithoutJoinedIsNotAnAnswer() {
        XCTAssertNil(MutualRoomsLookup.parseJoined(Data("{}".utf8)))
        XCTAssertNil(MutualRoomsLookup.parseJoined(Data("{\"joined\":{}}".utf8)))
        XCTAssertNil(MutualRoomsLookup.parseJoined(Data("not json".utf8)))
    }

    func testRoomsAndSpacesAreSeparatedAndSorted() {
        let rooms = [
            room("!b", name: "Beta"),
            room("!a", name: "alpha"),
            room("!dm", name: "Direct", isDirect: true),
            room("!space", name: "Space", isSpace: true),
        ]
        let found = MutualRoomsLookup.entries(ids: ["!b", "!a", "!dm", "!space"], rooms: rooms)
        XCTAssertEqual(found.rooms.map(\.id), ["!a", "!b"])
        XCTAssertEqual(found.spaces.map(\.id), ["!space"])
        XCTAssertFalse(found.isEmpty)
    }

    func testEmptyNamesFallBackToTheIdAndUnknownIdsAreLeftOut() {
        let found = MutualRoomsLookup.entries(ids: ["!noname", "!missing"], rooms: [room("!noname", name: "")])
        XCTAssertEqual(found.rooms.map(\.name), ["!noname"])
        XCTAssertEqual(found.rooms.count, 1)
    }

    func testRepeatedIdsAreCountedOnce() {
        let found = MutualRoomsLookup.entries(ids: ["!a", "!a"], rooms: [room("!a", name: "A")])
        XCTAssertEqual(found.rooms.count, 1)
    }

    func testNothingInCommonIsEmpty() {
        let found = MutualRoomsLookup.entries(ids: [], rooms: [])
        XCTAssertTrue(found.isEmpty)
    }

    private func room(_ id: String, name: String? = nil, isDirect: Bool = false, isSpace: Bool = false) -> MutualRoomsLookup.JoinedRoom {
        MutualRoomsLookup.JoinedRoom(id: id, name: name, avatarUrl: nil, isDirect: isDirect, isSpace: isSpace)
    }
}
