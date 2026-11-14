import XCTest
import WizardChatCore
@testable import WizardChat

final class ScheduledMessagesTests: XCTestCase {
    private func event(_ id: String, room: String = "!r:x", type: String = "m.room.message", state: String? = nil,
                       body: String = "hi", delay: Int = 1000, since: Int = 0) -> DelayedEvent {
        DelayedEvent(delayId: id, roomId: room, eventType: type, stateKey: state,
                     content: .object(["body": .string(body)]), delayMs: delay, runningSince: since)
    }

    func testListsOnlyThisRoomsMessagesSoonestFirst() {
        let events = [event("late", delay: 9000), event("other", room: "!o:x"), event("state", state: ""),
                      event("topic", type: "m.room.topic"), event("soon", delay: 2000)]
        XCTAssertEqual(ScheduledMessages.of(events, roomId: "!r:x").map(\.delayId), ["soon", "late"])
    }

    func testSendTimeIsStartPlusDelay() {
        XCTAssertEqual(ScheduledMessages.of([event("a", delay: 500, since: 1000)], roomId: "!r:x").first?.sendAt, 1500)
    }

    func testSchedulableNeedsAFewSeconds() {
        XCTAssertFalse(ScheduledMessages.isSchedulable(1000 + 4999, now: 1000))
        XCTAssertTrue(ScheduledMessages.isSchedulable(1000 + 5000, now: 1000))
    }

    func testTomorrowMorningIsNineOClock() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let now = 1_700_000_000_000
        let at = Date(timeIntervalSince1970: Double(ScheduledMessages.tomorrowMorning(now: now, calendar: calendar)) / 1000)
        XCTAssertEqual(calendar.component(.hour, from: at), 9)
        XCTAssertGreaterThan(Int(at.timeIntervalSince1970 * 1000), now)
    }

    func testContentCarriesHtmlMentionsAndReply() {
        let content = ScheduledMessages.content(body: "hi", html: "<b>hi</b>", mentionedUserIds: ["@a:x", "@a:x"], replyTo: "$e")
        guard case .object(let object) = content else { return XCTFail("not an object") }
        XCTAssertEqual(object["formatted_body"], .string("<b>hi</b>"))
        XCTAssertEqual(object["m.mentions"], .object(["user_ids": .array([.string("@a:x")])]))
        XCTAssertEqual(object["m.relates_to"], .object(["m.in_reply_to": .object(["event_id": .string("$e")])]))
    }

    func testPlainContentHasNoFormatting() {
        guard case .object(let object) = ScheduledMessages.content(body: "hi", html: "hi") else { return XCTFail() }
        XCTAssertNil(object["format"])
    }

    func testNotices() {
        XCTAssertEqual(ScheduledMessages.noticeKey(for: WizardError(code: "unsupportedByServer", message: "")), "composer.schedule.unsupported")
        XCTAssertEqual(ScheduledMessages.noticeKey(for: WizardError(code: "unsupported", message: "")), "composer.schedule.encrypted")
        XCTAssertNil(ScheduledMessages.noticeKey(for: WizardError(code: "other", message: "")))
    }
}
