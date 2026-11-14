import XCTest
import WizardChatCore
@testable import WizardChat

final class EditHistoryTests: XCTestCase {
    private func version(_ id: String, original: Bool = false) -> EventVersion {
        EventVersion(eventId: id, sender: "@a:x", timestamp: 1000, isOriginal: original, body: id)
    }

    func testNewestVersionLeads() {
        let ordered = EditHistory.newestFirst([version("original", original: true), version("e1"), version("e2")])
        XCTAssertEqual(ordered.map(\.eventId), ["e2", "e1", "original"])
    }

    func testBadgesMarkCurrentAndOriginal() {
        let versions = EditHistory.newestFirst([version("original", original: true), version("e1")])
        XCTAssertEqual(EditHistory.badges(versions[0], index: 0), ["timeline.editHistory.current"])
        XCTAssertEqual(EditHistory.badges(versions[1], index: 1), ["timeline.editHistory.original"])
    }

    func testAnUneditedMessageCarriesBothBadges() {
        let only = version("original", original: true)
        XCTAssertEqual(EditHistory.badges(only, index: 0), ["timeline.editHistory.current", "timeline.editHistory.original"])
    }

    func testNothingToCompareWithOneVersion() {
        XCTAssertTrue(EditHistory.isEmpty([]))
        XCTAssertTrue(EditHistory.isEmpty([version("original", original: true)]))
        XCTAssertFalse(EditHistory.isEmpty([version("original", original: true), version("e1")]))
    }
}
