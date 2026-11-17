import XCTest
@testable import Mudrix

/// "Hide media" as the web's `hiddenMediaAtom` keeps it: per event, and a group is hidden only when all
/// of its pictures are.
final class HiddenMediaTests: XCTestCase {
    func testNothingIsHiddenToBeginWith() {
        let ids: Set<String> = []
        XCTAssertFalse(HiddenMedia.parse([:]).contains("$one"))
        XCTAssertFalse(HiddenMedia.hiding(ids, eventIds: []).contains("$one"))
    }

    func testHidingAddsEveryEventAndRevealingTakesThemBack() {
        let hidden = HiddenMedia.hiding([], eventIds: ["$one", "$two"])
        XCTAssertEqual(hidden, ["$one", "$two"])
        XCTAssertEqual(HiddenMedia.hiding(hidden, eventIds: ["$two"]), ["$one", "$two"])
        XCTAssertEqual(HiddenMedia.revealing(hidden, eventIds: ["$one"]), ["$two"])
        XCTAssertEqual(HiddenMedia.revealing(hidden, eventIds: ["$three"]), ["$one", "$two"])
    }

    func testTheStoredFormKeepsOnlyHiddenEvents() {
        let stored = HiddenMedia.stored(["$one", "$two"])
        XCTAssertEqual(stored, ["$one": true, "$two": true])
        XCTAssertEqual(HiddenMedia.parse(stored), ["$one", "$two"])
        XCTAssertEqual(HiddenMedia.parse(["$one": false, "$two": true]), ["$two"])
        XCTAssertEqual(HiddenMedia.parse([:]), [])
    }
}
