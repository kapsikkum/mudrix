import XCTest
@testable import WizardChat

final class NotificationPreviewTests: XCTestCase {
    private let strings = NotificationPreview.Strings(title: "Mudrix", newMessage: "New message",
                                                      hidden: "New message")
    private let rooms = ["!r:x": NotificationPreview.Room(name: "Design", isDirect: false),
                         "!dm:y": NotificationPreview.Room(name: "Alice", isDirect: true)]

    func testPayloadCarriesTheAccountAndTheIds() {
        let payload = PushPayload.parse(["room_id": "!r:x", "event_id": "$e", "user_id": "@me:x"])
        XCTAssertEqual(payload, PushPayload(roomId: "!r:x", eventId: "$e", unread: nil, userId: "@me:x"))
    }

    func testFallbackUsesTheRoomName() {
        let preview = NotificationPreviewBuilder.fallback(
            payload: PushPayload(roomId: "!r:x", eventId: "$e"),
            alertTitle: "Mudrix", alertBody: "New message", rooms: rooms, strings: strings)
        XCTAssertEqual(preview.title, "Design")
        XCTAssertEqual(preview.body, "New message")
        XCTAssertEqual(preview.threadIdentifier, "!r:x")
        XCTAssertEqual(preview.categoryIdentifier, "message")
        XCTAssertEqual(preview.userInfo["roomId"], "!r:x")
        XCTAssertEqual(preview.userInfo["room_id"], "!r:x")
        XCTAssertEqual(preview.userInfo["eventId"], "$e")
        XCTAssertEqual(preview.userInfo["event_id"], "$e")
        XCTAssertEqual(preview.userInfo["priority"], "0")
    }

    func testFallbackKeepsTheGatewayTextForAnUnknownRoom() {
        let preview = NotificationPreviewBuilder.fallback(
            payload: PushPayload(roomId: "!new:z", eventId: "$e"),
            alertTitle: "Mudrix", alertBody: "New message", rooms: rooms, strings: strings)
        XCTAssertEqual(preview.title, "Mudrix")
        XCTAssertEqual(preview.body, "New message")
    }

    func testFallbackWithoutAnyTextUsesTheLocalizedOnes() {
        let preview = NotificationPreviewBuilder.fallback(
            payload: nil, alertTitle: " ", alertBody: "", rooms: [:], strings: strings)
        XCTAssertEqual(preview.title, "Mudrix")
        XCTAssertEqual(preview.body, "New message")
        XCTAssertNil(preview.roomId)
        XCTAssertNil(preview.threadIdentifier)
    }

    func testHiddenContentKeepsTheGatewayTextOut() {
        let preview = NotificationPreviewBuilder.fallback(
            payload: PushPayload(roomId: "!r:x", eventId: "$e"), alertTitle: "Mudrix",
            alertBody: "Alice: the secret", rooms: rooms, hideContent: true, strings: strings)
        XCTAssertEqual(preview.title, "Design")
        XCTAssertEqual(preview.body, "New message")
    }

    func testDirectRoomIsPrioritised() {
        let preview = NotificationPreviewBuilder.fallback(
            payload: PushPayload(roomId: "!dm:y", eventId: "$e"), alertTitle: nil, alertBody: nil,
            rooms: rooms, strings: strings)
        XCTAssertTrue(preview.priority)
        XCTAssertEqual(preview.userInfo["priority"], "1")
        XCTAssertEqual(preview.title, "Alice")
    }

    func testMessageShowsTheRoomAndTheSender() {
        let preview = NotificationPreviewBuilder.message(
            roomId: "!r:x", eventId: "$e", userId: "@me:x", sender: "@alice:x", senderName: "Alice",
            roomName: "Design", body: "Hello", isDirect: false, highlight: false, strings: strings)
        XCTAssertEqual(preview.title, "Design")
        XCTAssertEqual(preview.body, "Alice: Hello")
        XCTAssertEqual(preview.threadIdentifier, "!r:x")
        XCTAssertFalse(preview.priority)
        XCTAssertEqual(preview.userId, "@me:x")
    }

    func testMessageInADirectChatShowsTheSenderAsTheTitle() {
        let preview = NotificationPreviewBuilder.message(
            roomId: "!dm:y", eventId: "$e", userId: nil, sender: "@alice:x", senderName: "Alice",
            roomName: nil, body: "Hello", isDirect: true, highlight: false, strings: strings)
        XCTAssertEqual(preview.title, "Alice")
        XCTAssertEqual(preview.body, "Hello")
        XCTAssertTrue(preview.priority)
    }

    func testMessageWithoutTextOrWithHiddenContentFallsBack() {
        let spoiler = NotificationPreviewBuilder.message(
            roomId: "!r:x", eventId: "$e", userId: nil, sender: "@alice:x", senderName: nil,
            roomName: "Design", body: "", isDirect: false, highlight: true, strings: strings)
        XCTAssertEqual(spoiler.body, "New message")
        XCTAssertEqual(spoiler.title, "Design")
        XCTAssertTrue(spoiler.priority)

        let hidden = NotificationPreviewBuilder.message(
            roomId: "!r:x", eventId: "$e", userId: nil, sender: "@alice:x", senderName: nil,
            roomName: "Design", body: "Hello", isDirect: false, highlight: false,
            hideContent: true, strings: strings)
        XCTAssertEqual(hidden.body, "New message")
    }

    func testSenderWithoutADisplayNameIsTheUserId() {
        let preview = NotificationPreviewBuilder.message(
            roomId: "!dm:y", eventId: "$e", userId: nil, sender: "@alice:x", senderName: "",
            roomName: nil, body: "Hello", isDirect: true, highlight: false, strings: strings)
        XCTAssertEqual(preview.title, "@alice:x")
    }
}
