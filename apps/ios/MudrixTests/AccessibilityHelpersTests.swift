import XCTest
@testable import Mudrix

/// What VoiceOver is told about new messages (A11)
final class AccessibilityHelpersTests: XCTestCase {
    func testOnlyOthersMessagesAreAnnouncedAndOnlyWithVoiceOver() {
        XCTAssertTrue(Announcer.shouldAnnounce(isOwn: false, isNewestChanged: true, voiceOverRunning: true))
        XCTAssertFalse(Announcer.shouldAnnounce(isOwn: true, isNewestChanged: true, voiceOverRunning: true))
        XCTAssertFalse(Announcer.shouldAnnounce(isOwn: false, isNewestChanged: false, voiceOverRunning: true))
        XCTAssertFalse(Announcer.shouldAnnounce(isOwn: false, isNewestChanged: true, voiceOverRunning: false))
    }

    func testTheLineIsOneLineAndCut() {
        XCTAssertEqual(Announcer.messageLine(sender: "Ash", text: "hi\nthere"), "Ash: hi there")
        let long = String(repeating: "a", count: 300)
        XCTAssertEqual(Announcer.messageLine(sender: "Ash", text: long, limit: 10), "Ash: aaaaaaaaaa…")
    }
}
