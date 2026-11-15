import XCTest
@testable import Mudrix

/// A room's addresses and the directory (R9, B5), matching the web's `useRoomAliases.ts`
final class RoomAddressesTests: XCTestCase {
    func testValidatesAddresses() {
        XCTAssertTrue(RoomAddresses.isValid("#room:example.org"))
        XCTAssertTrue(RoomAddresses.isValid(" #a-b_c.d:srv.example "))
        XCTAssertFalse(RoomAddresses.isValid("room:example.org"))
        XCTAssertFalse(RoomAddresses.isValid("#room"))
        XCTAssertFalse(RoomAddresses.isValid("#room:"))
    }

    func testListsTheOtherAddresses() {
        XCTAssertEqual(RoomAddresses.others(canonical: "#a:s", alt: ["#b:s", "#a:s"], local: ["#c:s", "#b:s"]), ["#b:s", "#c:s"])
        XCTAssertEqual(RoomAddresses.others(canonical: nil, alt: [], local: []), [])
    }

    func testAddsOnce() {
        XCTAssertEqual(RoomAddresses.altAfterAdd(canonical: "#a:s", alt: [], alias: "#b:s"), ["#b:s"])
        XCTAssertEqual(RoomAddresses.altAfterAdd(canonical: "#a:s", alt: ["#b:s"], alias: "#b:s"), ["#b:s"])
        XCTAssertEqual(RoomAddresses.altAfterAdd(canonical: "#a:s", alt: [], alias: "#a:s"), [])
    }

    func testRemovesFromBoth() {
        let removedMain = RoomAddresses.afterRemove(canonical: "#a:s", alt: ["#b:s"], alias: "#a:s")
        XCTAssertNil(removedMain.main)
        XCTAssertEqual(removedMain.alt, ["#b:s"])
        let removedAlt = RoomAddresses.afterRemove(canonical: "#a:s", alt: ["#b:s"], alias: "#b:s")
        XCTAssertEqual(removedAlt.main, "#a:s")
        XCTAssertEqual(removedAlt.alt, [])
    }

    func testTheOldMainAddressStaysAsAlternative() {
        let swapped = RoomAddresses.afterSetMain(canonical: "#a:s", alt: ["#b:s", "#c:s"], alias: "#b:s")
        XCTAssertEqual(swapped.main, "#b:s")
        XCTAssertEqual(swapped.alt, ["#a:s", "#c:s"])
        let first = RoomAddresses.afterSetMain(canonical: nil, alt: [], alias: "#a:s")
        XCTAssertEqual(first.main, "#a:s")
        XCTAssertEqual(first.alt, [])
    }
}
