import XCTest
import WizardChatCore
@testable import WizardChat

@MainActor
final class PresenceChoiceTests: XCTestCase {
    func testPresenceMapsChoicesWhenShared() {
        XCTAssertEqual(PresenceChoice.auto.presence(shared: true), .online)
        XCTAssertEqual(PresenceChoice.online.presence(shared: true), .online)
        XCTAssertEqual(PresenceChoice.away.presence(shared: true), .unavailable)
        XCTAssertEqual(PresenceChoice.invisible.presence(shared: true), .offline)
    }

    func testPresenceIsAlwaysOfflineWhenNotShared() {
        for choice in PresenceChoice.allCases {
            XCTAssertEqual(choice.presence(shared: false), .offline)
        }
    }

    func testInitialChoiceMigratesExplicitOffSwitchToInvisible() {
        XCTAssertEqual(AppPreferences.initialPresenceChoice(storedChoice: nil, storedShowPresence: false), .invisible)
        XCTAssertEqual(AppPreferences.initialPresenceChoice(storedChoice: nil, storedShowPresence: true), .auto)
        XCTAssertEqual(AppPreferences.initialPresenceChoice(storedChoice: nil, storedShowPresence: nil), .auto)
        XCTAssertEqual(AppPreferences.initialPresenceChoice(storedChoice: "away", storedShowPresence: false), .away)
        XCTAssertEqual(AppPreferences.initialPresenceChoice(storedChoice: "unknown", storedShowPresence: false), .invisible)
    }
}
