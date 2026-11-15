import XCTest
import MudrixCore
@testable import Mudrix

/// The audit log's lines from a room's changes and role state (R4), matching Android's `matrix/AuditLog.kt`
final class AuditLogTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    private func change(id: String = "$e", at: Int = 1_000, membership: EntryContent.Membership? = nil,
                        state: EntryContent.State? = nil, sender: String = "@alice:example.org",
                        senderName: String? = "Alice") -> AuditLog.Change {
        AuditLog.Change(id: id, at: at, sender: sender, senderName: senderName,
                        membership: membership, state: state)
    }

    func testMembershipCodesBecomeActions() {
        let joined = AuditLog.entries(changes: [
            change(at: 1_000, membership: .init(userId: "@bob:example.org", displayName: "Bob", change: "Joined")),
            change(id: "$k", at: 2_000, membership: .init(userId: "@bob:example.org", change: "KickedAndBanned")),
            change(id: "$a", at: 3_000, membership: .init(userId: "@bob:example.org", change: "InvitationAccepted")),
            change(id: "$x", at: 4_000, membership: .init(userId: "@bob:example.org", change: "Left")),
        ])
        XCTAssertEqual(joined.map(\.action), ["left", "joined", "banned", "joined"])
        XCTAssertEqual(joined.first?.args, ["bob"])
        let named = joined.first { $0.id == "$e:0" }
        XCTAssertEqual(named?.args, ["Bob"])
        XCTAssertEqual(named?.category, .members)
        XCTAssertEqual(named?.actor, "Alice")
    }

    func testUnknownMembershipCodeAndSenderNameFallBack() {
        let entries = AuditLog.entries(changes: [
            change(membership: .init(userId: "@bob:example.org", change: "SomethingNew")),
            change(id: "$n", senderName: nil,
                   membership: .init(userId: "@bob:example.org", displayName: "Bob", change: "Banned")),
        ])
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.actor, "alice")
    }

    func testRoomSettingChanges() {
        let renamed = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.room.name", stateKey: "", content: json(#"{"name":"Den"}"#)))])
        XCTAssertEqual(renamed.first?.action, "renamed")
        XCTAssertEqual(renamed.first?.args, ["Den"])
        XCTAssertEqual(renamed.first?.category, .settings)

        let removed = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.room.name", stateKey: "", content: json(#"{"name":""}"#)))])
        XCTAssertEqual(removed.first?.action, "nameRemoved")

        let topic = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.room.topic", stateKey: "", content: json(#"{"topic":"hi"}"#)))])
        XCTAssertEqual(topic.first?.action, "topicChanged")

        let encryption = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.room.encryption", stateKey: "", content: json(#"{"algorithm":"m.megolm.v1.aes-sha2"}"#)))])
        XCTAssertEqual(encryption.first?.action, "encryptionOn")
    }

    func testJoinRuleLinesOnlyWhenTheRuleChanged() {
        let same = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.room.join_rules", stateKey: "",
            content: json(#"{"join_rule":"invite"}"#), prevContent: json(#"{"join_rule":"invite"}"#)))])
        XCTAssertTrue(same.isEmpty)

        let changed = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.room.join_rules", stateKey: "",
            content: json(#"{"join_rule":"brand_new_rule"}"#), prevContent: json(#"{"join_rule":"invite"}"#)))])
        XCTAssertEqual(changed.first?.action, "joinRulesChanged")
        // An unknown rule is shown as the server spelled it
        XCTAssertEqual(changed.first?.args, ["brand_new_rule"])
    }

    func testSpaceChildLinesOnlyWhenTheRoomWasAddedOrRemoved() {
        let added = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.space.child", stateKey: "!den:example.org", content: json(#"{"via":["example.org"]}"#)))],
            roomName: { _ in "Den" })
        XCTAssertEqual(added.first?.action, "roomAdded")
        XCTAssertEqual(added.first?.args, ["Den"])
        XCTAssertEqual(added.first?.category, .rooms)

        let orderOnly = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.space.child", stateKey: "!den:example.org",
            content: json(#"{"via":["example.org"],"order":"b"}"#),
            prevContent: json(#"{"via":["example.org"],"order":"a"}"#)))])
        XCTAssertTrue(orderOnly.isEmpty)

        let removed = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.space.child", stateKey: "!den:example.org", content: json("{}"),
            prevContent: json(#"{"via":["example.org"]}"#)))], roomName: { _ in "Den" })
        XCTAssertEqual(removed.first?.action, "roomRemoved")
    }

    func testPowerLevels() {
        let first = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.room.power_levels", stateKey: "", content: json(#"{"users":{"@bob:example.org":100}}"#)))])
        XCTAssertEqual(first.map(\.action), ["permissionsChanged"])

        let changed = AuditLog.entries(changes: [change(state: .init(
            eventType: "m.room.power_levels", stateKey: "",
            content: json(#"{"users":{"@bob:example.org":50},"invite":50}"#),
            prevContent: json(#"{"users":{"@bob:example.org":0},"invite":0}"#)))])
        XCTAssertEqual(changed.map(\.action), ["powerChanged", "permissionsChanged"])
        XCTAssertEqual(changed.first?.args, ["bob", "0", "50"])
        XCTAssertEqual(changed.first?.category, .permissions)
    }

    func testRoleEventsBecomeLines() {
        let events = [
            StateEventView(roomId: "!den:example.org", type: MudrixTypes.spaceRoles, stateKey: "",
                           sender: "@alice:example.org", content: json("{}"), eventId: "$roles",
                           originServerTs: 5_000),
            StateEventView(roomId: "!den:example.org", type: MudrixTypes.spaceMemberRoles,
                           stateKey: "@bob:example.org", sender: "@alice:example.org", content: json("{}"),
                           eventId: "$member", originServerTs: 6_000),
        ]
        let entries = AuditLog.roleEntries(events)
        XCTAssertEqual(entries.map(\.action), ["rolesChanged", "memberRolesChanged"])
        XCTAssertEqual(entries.last?.args, ["bob"])
        XCTAssertEqual(entries.last?.actor, "alice")
        XCTAssertEqual(entries.last?.category, .roles)
    }

    func testNewestFirst() {
        let entries = AuditLog.entries(changes: [
            change(id: "$old", at: 1_000, membership: .init(userId: "@bob:example.org", change: "Joined")),
            change(id: "$new", at: 9_000, state: .init(eventType: "m.room.topic", stateKey: "",
                                                       content: json(#"{"topic":"hi"}"#))),
        ])
        XCTAssertEqual(entries.map(\.action), ["topicChanged", "joined"])
    }

    func testLocalpartNamesAndLines() {
        XCTAssertEqual(AuditLog.nameOf("@alice:example.org"), "alice")
        XCTAssertEqual(AuditLog.nameOf("@alice"), "alice")
        XCTAssertEqual(AuditLog.nameOf("@:example.org"), "@:example.org")
        let entry = AuditEntry(id: "1", at: 0, category: .members, actor: "Alice", action: "joined", args: [])
        XCTAssertEqual(AuditLog.line(entry), "Alice joined")
    }
}
