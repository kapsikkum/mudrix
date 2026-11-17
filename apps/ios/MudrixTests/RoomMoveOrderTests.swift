import Foundation
import XCTest
@testable import Mudrix

/// Per-room "Move up" / "Move down" in the room list menu (R15), saved through the reorder the drag uses
final class RoomMoveOrderTests: XCTestCase {
    private let ids = ["!a", "!b", "!c"]

    func testARoomSwapsWithItsNeighbour() {
        XCTAssertEqual(RoomMoveOrder.moved(ids, index: 0, by: 1), ["!b", "!a", "!c"])
        XCTAssertEqual(RoomMoveOrder.moved(ids, index: 1, by: -1), ["!b", "!a", "!c"])
        XCTAssertEqual(RoomMoveOrder.moved(ids, index: 2, by: -1), ["!a", "!c", "!b"])
    }

    func testTheEndsDoNotMove() {
        XCTAssertNil(RoomMoveOrder.moved(ids, index: 0, by: -1))
        XCTAssertNil(RoomMoveOrder.moved(ids, index: 2, by: 1))
        XCTAssertNil(RoomMoveOrder.moved(ids, index: 1, by: 0))
        XCTAssertNil(RoomMoveOrder.moved([String](), index: 0, by: 1))
        XCTAssertNil(RoomMoveOrder.moved(ids, index: 9, by: 1))
        XCTAssertNil(RoomMoveOrder.moved(ids, index: -1, by: 1))
    }

    func testTheGroupOrderIsKept() {
        let move = RoomMove(ids: ids, index: 2, favourites: true)
        XCTAssertEqual(RoomMoveOrder.moved(move, by: -1), ["!a", "!c", "!b"])
        XCTAssertNil(RoomMoveOrder.moved(move, by: 1))
        XCTAssertTrue(move.favourites)
    }
}
