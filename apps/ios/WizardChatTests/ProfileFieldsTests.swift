import XCTest
import WizardChatCore
@testable import WizardChat

final class ProfileFieldsTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    func testReadsTheStableAndUnstableNames() {
        let profile = ProfileFields.parse(json("""
            {"gay.fomx.biography":{"m.text":[{"body":"hi\\r\\n\\r\\n\\r\\nthere"}]},
             "m.pronouns":[{"language":"en","summary":"she/her"},"they/them","she/her"],
             "m.tz":"Europe/Berlin","io.github.kapsikkum.mudrix.accent":"#ABC",
             "chat.mudrix.is_user":true}
            """))
        XCTAssertEqual(profile.bio, "hi\n\nthere")
        XCTAssertEqual(profile.pronouns, ["she/her", "they/them"])
        XCTAssertEqual(profile.timezone, "Europe/Berlin")
        XCTAssertEqual(profile.accent, "#aabbcc")
        XCTAssertTrue(profile.isMudrixUser)
    }

    func testDropsWhatItCannotTrust() {
        let profile = ProfileFields.parse(json("""
            {"m.tz":"Not/AZone","io.github.kapsikkum.mudrix.avatar_decoration":"https://evil.example/x.svg",
             "io.github.kapsikkum.mudrix.accent":"red"}
            """))
        XCTAssertNil(profile.timezone)
        XCTAssertNil(profile.avatarDecoration)
        XCTAssertNil(profile.accent)
        XCTAssertFalse(profile.isMudrixUser)
    }

    func testHtmlBioIsOnlyAFallback() {
        let both = json("""
            {"m.biography":{"m.text":[{"body":"<b>x</b><br>y","mimetype":"text/html"},{"body":"plain"}]}}
            """)
        XCTAssertEqual(ProfileFields.parse(both).bio, "plain")
        let htmlOnly = json("""
            {"m.biography":{"m.text":[{"body":"<b>x</b><br>y","mimetype":"text/html"}]}}
            """)
        XCTAssertEqual(ProfileFields.parse(htmlOnly).bio, "x\ny")
    }

    func testActivitiesNeedAnExpiry() {
        let value = json("""
            {"io.github.kapsikkum.mudrix.activity":[{"type":"playing","name":"Game","expires":2000,"started":1000},
             {"type":"listening","name":"No expiry"},{"type":"flying","name":"x","expires":5}]}
            """)
        let activities = ProfileFields.parse(value).activities
        XCTAssertEqual(activities.count, 1)
        XCTAssertEqual(activities[0].startedAt, 1000)
        XCTAssertTrue(ProfileFields.live(activities, now: Date(timeIntervalSince1970: 2)).isEmpty)
        XCTAssertEqual(ProfileFields.live(activities, now: Date(timeIntervalSince1970: 1.999)).count, 1)
    }

    func testPronounInputIsSplitAndCapped() {
        XCTAssertEqual(ProfileFields.parsePronounInput("a, b; c\nd, e, f"), ["a", "b", "c", "d", "e"])
    }

    func testLocalTimeOffsetIsRelativeToTheViewer() throws {
        let now = Date(timeIntervalSince1970: 1_768_478_400) // 2026-01-15T12:00:00Z
        let utc = try XCTUnwrap(TimeZone(identifier: "UTC"))
        let local = try XCTUnwrap(ProfileFields.localTime("Asia/Tokyo", now: now, viewer: utc))
        XCTAssertEqual(local.offsetHours, 9)
    }

    func testSoftwareAndNotes() {
        XCTAssertEqual(ProfileFields.describeSoftware(" synapse ").label, "Synapse")
        XCTAssertEqual(ProfileFields.describeSoftware("xyz").glyph, "X")
        XCTAssertEqual(ProfileFields.serverName(of: "@a:example.org"), "example.org")
        let notes = ProfileFields.parseNotes(json("""
            {"notes":{"@a:b":"hello","@c:d":""}}
            """))
        XCTAssertEqual(notes, ["@a:b": "hello"])
        XCTAssertEqual(ProfileFields.parseNotes(ProfileFields.notesValue(notes)), notes)
    }
}
