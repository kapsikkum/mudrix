import XCTest
import MudrixCore
@testable import Mudrix

/// The custom status' dot mode, which is where "Do not disturb" lives (P13)
final class StatusModeTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    func testReadsOnlyKnownModes() {
        XCTAssertEqual(StatusFields.mode(of: json(#"{"text":"Lunch","mode":"dnd"}"#)), .dnd)
        XCTAssertEqual(StatusFields.mode(of: json(#"{"mode":"idle"}"#)), .idle)
        XCTAssertNil(StatusFields.mode(of: json(#"{"mode":"busy"}"#)))
        XCTAssertNil(StatusFields.mode(of: json(#"{"text":"Lunch"}"#)))
        XCTAssertNil(StatusFields.mode(of: json(#""Lunch""#)))
        XCTAssertNil(StatusFields.mode(of: nil))
    }

    func testWritingKeepsWhatOtherClientsStored() {
        let current = json(#"{"emoji":"🍜","text":"Lunch","expires":1767225600000}"#)
        let next = StatusFields.value(mode: .dnd, in: current)
        XCTAssertEqual(next, json(#"{"emoji":"🍜","text":"Lunch","mode":"dnd","expires":1767225600000}"#))
    }

    func testModeAloneIsAStatus() {
        XCTAssertEqual(StatusFields.value(mode: .dnd, in: nil), json(#"{"mode":"dnd"}"#))
        XCTAssertEqual(StatusFields.value(mode: .idle, in: .object([:])), json(#"{"mode":"idle"}"#))
    }

    func testClearingTheModeKeepsTheTextAndEmptiesAnEmptyStatus() {
        XCTAssertEqual(StatusFields.value(mode: nil, in: json(#"{"text":"Lunch","mode":"dnd"}"#)),
                       json(#"{"text":"Lunch"}"#))
        // Nothing but the mode was stored, so the field goes
        XCTAssertNil(StatusFields.value(mode: nil, in: json(#"{"mode":"dnd"}"#)))
        XCTAssertNil(StatusFields.value(mode: nil, in: nil))
    }

    func testBothFieldNamesAreUsed() {
        XCTAssertEqual(StatusFields.keys, ["io.github.kapsikkum.mudrix.status", "chat.mudrix.status"])
    }

    func testTheDotFollowsTheStatusModeLikeTheWeb() {
        XCTAssertEqual(StatusFields.dot(.online, mode: .dnd), .dnd)
        XCTAssertEqual(StatusFields.dot(.online, mode: .idle), .unavailable)
        XCTAssertEqual(StatusFields.dot(.unavailable, mode: nil), .unavailable)
        XCTAssertEqual(StatusFields.dot(.online, mode: nil), .online)
        // Someone who shares nothing stays offline whatever the status says
        XCTAssertEqual(StatusFields.dot(.offline, mode: .dnd), .offline)
        XCTAssertNil(StatusFields.dot(nil, mode: nil))
    }
}
