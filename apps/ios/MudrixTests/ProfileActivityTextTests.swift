import XCTest
import MudrixCore
@testable import Mudrix

/// The words on an activity card and in Settings > Activity (P3, P4)
final class ProfileActivityTextTests: XCTestCase {
    private func activity(type: String = "listening", name: String = "Song", details: String = "",
                          startedAt: Int64 = 0) -> ProfileActivity {
        ProfileActivity(type: type, name: name, details: details, startedAt: startedAt, expiresAt: Int64.max)
    }

    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private var nowMs: Int64 { Int64(now.timeIntervalSince1970 * 1000) }

    func testListeningWithAndWithoutAnArtist() {
        let withArtist = ProfileActivityText.lines(for: activity(details: "Artist"), now: now)
        XCTAssertEqual(withArtist.cardKey, "profile.activity.cardListening")
        XCTAssertEqual(withArtist.titleKey, "profile.activity.listeningBy")
        XCTAssertEqual(withArtist.titleArgs, ["Song", "Artist"])
        XCTAssertNil(withArtist.sinceKey)

        let alone = ProfileActivityText.lines(for: activity(), now: now)
        XCTAssertEqual(alone.titleKey, "profile.activity.listening")
        XCTAssertEqual(alone.titleArgs, ["Song"])
    }

    func testPlayingShowsHowLong() {
        let started = nowMs - 25 * 60_000
        let lines = ProfileActivityText.lines(for: activity(type: "playing", name: "Chess", startedAt: started), now: now)
        XCTAssertEqual(lines.cardKey, "profile.activity.cardPlaying")
        XCTAssertEqual(lines.titleKey, "profile.activity.playing")
        XCTAssertEqual(lines.sinceKey, "profile.activity.forDuration")
        XCTAssertEqual(lines.sinceArgs, ["25 min"])
    }

    func testJustStartedAndLongRuns() {
        let justStarted = ProfileActivityText.since(for: activity(type: "playing", startedAt: nowMs), now: now)
        XCTAssertEqual(justStarted?.key, "profile.activity.justStarted")
        XCTAssertEqual(justStarted?.args, [])

        let hourAndHalf = ProfileActivityText.since(for: activity(type: "playing", startedAt: nowMs - 90 * 60_000), now: now)
        XCTAssertEqual(hourAndHalf?.args, ["1 h 30 min"])
    }

    func testMusicAndUnknownStartsHaveNoDuration() {
        XCTAssertNil(ProfileActivityText.since(for: activity(), now: now))
        XCTAssertNil(ProfileActivityText.since(for: activity(type: "playing", startedAt: 0), now: now))
    }

    func testTextFillsTheArguments() {
        let line = ProfileActivityText.text("profile.activity.playing", ["Chess"])
        XCTAssertTrue(line.contains("Chess"), line)
    }
}
