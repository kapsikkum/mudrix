import XCTest
import WizardChatCore
@testable import WizardChat

final class MessageForwardTests: XCTestCase {
    func testSpacesInvitesAndReplacedRoomsAreLeftOut() {
        let rooms = [
            room("!a", name: "Alpha"),
            room("!space", name: "Space", isSpace: true),
            room("!invite", name: "Invite", isInvite: true),
            room("!old", name: "Old", isTombstoned: true),
        ]
        XCTAssertEqual(MessageForward.targets(rooms, query: "").map(\.id), ["!a"])
    }

    func testNewestActivityComesFirst() {
        let rooms = [
            room("!old", name: "Old", lastActivity: 100),
            room("!new", name: "New", lastActivity: 900),
            room("!never", name: "Never"),
        ]
        XCTAssertEqual(MessageForward.targets(rooms, query: "").map(\.id), ["!new", "!old", "!never"])
    }

    func testSearchMatchesNamesAndAddresses() {
        let rooms = [
            room("!a", name: "Engineering", alias: "#eng:example.org"),
            room("!b", name: "Design", alias: "#design:example.org"),
        ]
        XCTAssertEqual(MessageForward.targets(rooms, query: " eng ").map(\.id), ["!a"])
        XCTAssertEqual(MessageForward.targets(rooms, query: "#DESIGN").map(\.id), ["!b"])
        XCTAssertEqual(MessageForward.targets(rooms, query: "sign").map(\.id), ["!b"])
    }

    private func room(_ id: String, name: String? = nil, alias: String? = nil, lastActivity: Int? = nil,
                      isSpace: Bool = false, isInvite: Bool = false, isTombstoned: Bool = false) -> RoomSummary {
        RoomSummary(id: id, name: name, isDirect: false, isInvite: isInvite, isFavourite: false,
                    unreadMessages: 0, unreadMentions: 0, unreadNotifications: 0, markedUnread: false,
                    isVoice: false, isLowPriority: false, isTombstoned: isTombstoned, isEncrypted: false,
                    canonicalAlias: alias, memberCount: 1, callParticipants: [], inCall: false,
                    inCallElsewhere: false, lastActivity: lastActivity, isSpace: isSpace, isKnocked: false)
    }
}
