import XCTest
@testable import WizardChat

final class PushTests: XCTestCase {
    func testModeDefaultsToKeepAlive() {
        XCTAssertEqual(PushMode.parse(nil), .keepalive)
        XCTAssertEqual(PushMode.parse(""), .keepalive)
        XCTAssertEqual(PushMode.parse("nonsense"), .keepalive)
    }

    func testModeReadsItsName() {
        XCTAssertEqual(PushMode.parse("apns"), .apns)
        XCTAssertEqual(PushMode.parse(" APNS "), .apns)
        XCTAssertEqual(PushMode.parse("keepalive"), .keepalive)
    }

    func testPayloadAtTheTopLevel() {
        let payload = PushPayload.parse(["room_id": "!r:x", "event_id": "$e", "unread": "3"])
        XCTAssertEqual(payload, PushPayload(roomId: "!r:x", eventId: "$e", unread: 3))
    }

    func testPayloadInsideNotification() {
        let payload = PushPayload.parse(["notification": ["room_id": "!r:x", "event_id": "$e", "counts": ["unread": 0]]])
        XCTAssertEqual(payload, PushPayload(roomId: "!r:x", eventId: "$e", unread: 0))
    }

    func testPayloadWithoutIdsIsNotANotification() {
        XCTAssertNil(PushPayload.parse(["aps": ["content-available": 1]]))
        XCTAssertNil(PushPayload.parse([:]))
    }

    func testPushkeyIsLowercaseHex() {
        XCTAssertEqual(PushPayload.pushkey(from: Data([0x00, 0xAB, 0x0F, 0xFF])), "00ab0fff")
    }
}
