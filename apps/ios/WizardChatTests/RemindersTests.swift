import XCTest
import WizardChatCore
@testable import WizardChat

final class RemindersTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    func testParsesSortedAndDropsIncompleteEntries() {
        let items = Reminders.parse(json("""
            {"items":[{"id":"b","roomId":"!r","eventId":"$e2","at":2000},
             {"id":"a","roomId":"!r","eventId":"$e1","at":1000},
             {"id":"c","roomId":"!r","eventId":"$e3"},{"roomId":"!r"}]}
            """))
        XCTAssertEqual(items.map(\.id), ["a", "b"])
        XCTAssertEqual(Reminders.parse(nil), [])
        XCTAssertEqual(Reminders.parse(Reminders.toContent(items)), items)
    }

    func testPresetsFallDueRelativeToNow() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Berlin"))
        let now = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 3, day: 28, hour: 22, minute: 30)))
        let nowMs = Int64(now.timeIntervalSince1970 * 1000)
        XCTAssertEqual(Reminders.time(.in20m, now: now, calendar: calendar), nowMs + 20 * 60_000)
        XCTAssertEqual(Reminders.time(.in3h, now: now, calendar: calendar), nowMs + 3 * 3_600_000)
        // The clocks go forward that night; "tomorrow" is still 9:00 on the wall
        let tomorrow = Date(timeIntervalSince1970: Double(Reminders.time(.tomorrow, now: now, calendar: calendar)) / 1000)
        let parts = calendar.dateComponents([.day, .hour, .minute], from: tomorrow)
        XCTAssertEqual(parts.day, 29)
        XCTAssertEqual(parts.hour, 9)
        XCTAssertEqual(parts.minute, 0)
    }

    func testSavedMessagesToggleAndRoundTrip() {
        let (saved, isSaved) = SavedMessages.toggled([], roomId: "!r", eventId: "$e", now: 5)
        XCTAssertTrue(isSaved)
        XCTAssertEqual(saved, [SavedMessage(roomId: "!r", eventId: "$e", savedAt: 5)])
        let (again, stillSaved) = SavedMessages.toggled(saved, roomId: "!r", eventId: "$e", now: 9)
        XCTAssertFalse(stillSaved)
        XCTAssertEqual(again, [])
        XCTAssertEqual(SavedMessages.parse(SavedMessages.toContent(saved)), saved)
        let newest = SavedMessages.toggled(saved, roomId: "!r", eventId: "$f", now: 10).0
        XCTAssertEqual(newest.map(\.eventId), ["$f", "$e"])
    }

    func testPreviewReadsTheDecryptedEvent() {
        let source = EventSource(
            roomId: "!r", eventId: "$e",
            original: json(#"{"type":"m.room.encrypted","content":{"algorithm":"x"}}"#),
            decrypted: json(#"{"sender":"@a:b","origin_server_ts":42,"content":{"body":"old","m.new_content":{"body":"edited"}}}"#))
        let preview = SavedMessages.preview(source)
        XCTAssertEqual(preview.sender, "@a:b")
        XCTAssertEqual(preview.body, "edited")
        XCTAssertEqual(preview.timestamp, 42)
        XCTAssertFalse(preview.redacted)
        let empty = EventSource(roomId: "!r", eventId: "$e", original: json(#"{"content":{}}"#))
        XCTAssertTrue(SavedMessages.preview(empty).redacted)
    }

    func testThreadsAreUnreadWhenSomeoneElseRepliedAfterTheLastLook() {
        XCTAssertTrue(ThreadLastSeen.isUnread(latestSender: "@a:b", latestTimestamp: 20, myUserId: "@me:b", seenUpTo: 10))
        XCTAssertFalse(ThreadLastSeen.isUnread(latestSender: "@a:b", latestTimestamp: 20, myUserId: "@me:b", seenUpTo: 20))
        XCTAssertFalse(ThreadLastSeen.isUnread(latestSender: "@me:b", latestTimestamp: 20, myUserId: "@me:b", seenUpTo: nil))
        XCTAssertFalse(ThreadLastSeen.isUnread(latestSender: nil, latestTimestamp: 20, myUserId: "@me:b", seenUpTo: nil))
    }
}
