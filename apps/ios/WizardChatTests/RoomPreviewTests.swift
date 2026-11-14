import XCTest
import WizardChatCore
@testable import WizardChat

final class RoomPreviewTests: XCTestCase {
    private let labels = RoomPreviewLabels(
        you: "You",
        photo: "Photo",
        video: "Video",
        audio: "Voice message",
        file: "File",
        sticker: "Sticker",
        poll: "Poll",
        call: "Call",
        newMessage: "New message"
    )

    private func message(_ kind: LastMessageKind, body: String = "", own: Bool = false,
                         sender: String? = nil) -> LastMessage {
        LastMessage(body: body, senderId: "@sender:example.org", senderName: sender,
                    isOwn: own, timestamp: 1_700_000_000_000, kind: kind)
    }

    private func line(_ isDirect: Bool, _ kind: LastMessageKind, body: String = "",
                      own: Bool = false, sender: String? = nil) -> String? {
        RoomPreview.line(message(kind, body: body, own: own, sender: sender),
                         isDirect: isDirect, labels: labels)
    }

    func testADirectChatShowsTheTextAloneUnlessItIsTheUsersOwn() {
        XCTAssertEqual(line(true, .text, body: "hello"), "hello")
        XCTAssertEqual(line(true, .text, body: "hello", own: true), "You: hello")
    }

    func testAGroupRoomNamesTheSender() {
        XCTAssertEqual(line(false, .text, body: "hello", sender: "Alice"), "Alice: hello")
        XCTAssertEqual(line(false, .text, body: "hello", own: true), "You: hello")
        XCTAssertEqual(line(false, .text, body: "hello"), "hello")
    }

    func testEveryKindHasItsOwnLabel() {
        XCTAssertEqual(line(true, .image), "Photo")
        XCTAssertEqual(line(true, .video), "Video")
        XCTAssertEqual(line(true, .audio), "Voice message")
        XCTAssertEqual(line(true, .file), "File")
        XCTAssertEqual(line(true, .sticker), "Sticker")
        XCTAssertEqual(line(true, .poll), "Poll")
        XCTAssertEqual(line(true, .call), "Call")
        XCTAssertEqual(line(false, .image, sender: "Alice"), "Alice: Photo")
        XCTAssertEqual(line(false, .image, own: true), "You: Photo")
    }

    func testAnEmptyBodyFallsBackToTheNeutralLabel() {
        XCTAssertEqual(line(true, .other), "New message")
        XCTAssertEqual(line(false, .other, sender: "Alice"), "Alice: New message")
        XCTAssertEqual(line(true, .text, body: "  "), "New message")
    }

    func testARoomWithoutALastMessageHasNoPreview() {
        XCTAssertNil(RoomPreview.line(nil, isDirect: true, labels: labels))
        XCTAssertNil(RoomPreview.line(nil, isDirect: false, labels: labels))
    }
}
