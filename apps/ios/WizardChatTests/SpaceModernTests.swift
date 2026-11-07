import XCTest
import WizardChatCore
@testable import WizardChat

@MainActor
final class SpaceModernTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    private func state(_ rows: [(String, String, String)]) -> MudrixRoomState {
        MudrixRoomState(raw: rows.map { [.string($0.0), .string($0.1), json($0.2)] })
    }

    private func link(_ id: String, order: String? = nil, at: Int = 0) -> SpaceLink {
        SpaceLink(roomId: id, order: order, suggested: false, timestamp: at, via: [])
    }

    func testTypesAreReadUnderTheOldNameToo() {
        XCTAssertEqual(MudrixTypes.spaceListStyle, "io.github.kapsikkum.mudrix.space_list_style")
        XCTAssertEqual(MudrixTypes.typeAndLegacy(MudrixTypes.voiceChannel).last, "chat.mudrix.voice_channel")
        let old = state([("chat.mudrix.space_list_style", "", #"{"style":"modern"}"#)])
        XCTAssertEqual(SpaceModern.style(of: old), .modern)
        XCTAssertEqual(SpaceModern.style(of: .empty), .matrix)
    }

    func testStrictBooleanForVoiceFlag() {
        XCTAssertTrue(SpaceModern.isVoiceChannelFlagged(state([(MudrixTypes.voiceChannel, "", #"{"enabled":true}"#)])))
        XCTAssertFalse(SpaceModern.isVoiceChannelFlagged(state([(MudrixTypes.voiceChannel, "", #"{"enabled":"true"}"#)])))
    }

    func testBannerNeedsAUrlOrAKnownPreset() {
        let url = state([(MudrixTypes.spaceBanner, "", #"{"url":"mxc://s/b"}"#)])
        XCTAssertEqual(SpaceModern.banner(of: url), SpaceModern.Banner(url: "mxc://s/b", color: nil))
        let unknown = state([(MudrixTypes.spaceBanner, "", #"{"color":"mauve"}"#)])
        XCTAssertNil(SpaceModern.banner(of: unknown))
    }

    func testChildrenAreOrderedByOrderThenAgeThenId() {
        let node = SpaceNode(spaceId: "!s", children: [
            link("!c", order: nil, at: 1), link("!b", order: "0002", at: 9), link("!a", order: "0001", at: 9),
            link("!e", order: nil, at: 1), link("!d", order: "\u{7}bad", at: 0),
        ])
        XCTAssertEqual(SpaceModern.orderedChildren(node).map(\.roomId), ["!a", "!b", "!d", "!c", "!e"])
    }

    func testCategoriesFollowSubSpaces() {
        let graph = [
            SpaceNode(spaceId: "!top", children: [link("!r1", order: "1"), link("!cat", order: "2")]),
            SpaceNode(spaceId: "!cat", children: [link("!r2")]),
        ]
        let categories = SpaceModern.categories(in: graph, of: "!top")
        XCTAssertEqual(categories.map(\.spaceId), [nil, "!cat"])
        XCTAssertEqual(categories.map(\.roomIds), [["!r1"], ["!r2"]])
        XCTAssertEqual(SpaceModern.rootSpace(of: "!cat", in: graph), "!top")
    }

    func testVoiceChannelsGoBelowTextChannels() {
        XCTAssertEqual(SpaceModern.arrange(["a", "v1", "b", "v2"], isVoice: { $0.hasPrefix("v") }), ["a", "b", "v1", "v2"])
    }

    func testRolesAreOnlyTrustedWhenSettingThemTakesPower() {
        let rolesState = state([
            (MudrixTypes.spaceRoles, "", #"{"roles":[{"id":"dev","name":"  Dev​s ","color":"#AABBCC"},{"id":"BAD","name":"x"}],"builtin":{"100":{"color":"#112233"}}}"#),
            (MudrixTypes.spaceMemberRoles, "alice:s", #"{"roles":["dev","gone"]}"#),
        ])
        let high = json(#"{"state_default":50}"#).object
        let roles = SpaceModern.readRoles(rolesState, powerLevels: high)
        XCTAssertEqual(roles.roles.map(\.name), ["Devs"])
        XCTAssertEqual(roles.roles.first?.color, "#aabbcc")
        XCTAssertEqual(roles.byUser["@alice:s"]?.map(\.id), ["dev"])
        XCTAssertEqual(roles.builtin[.admin]?.color, "#112233")
        XCTAssertTrue(SpaceModern.readRoles(rolesState, powerLevels: json(#"{"state_default":0}"#).object).isEmpty)
        XCTAssertTrue(SpaceModern.readRoles(rolesState, powerLevels: nil).isEmpty)
    }

    func testRoleColourOrder() {
        let dev = SpaceModern.Role(id: "dev", name: "Dev", color: "#aabbcc")
        let roles = SpaceModern.Roles(builtin: [.admin: .init(color: "#111111"), .member: .init(color: "#222222")],
                                      roles: [dev], byUser: ["@a:s": [dev]])
        XCTAssertEqual(SpaceModern.roleColor(roles, userId: "@a:s", builtin: .admin), "#111111")
        XCTAssertEqual(SpaceModern.roleColor(roles, userId: "@a:s", builtin: .member), "#aabbcc")
        XCTAssertEqual(SpaceModern.roleColor(roles, userId: "@b:s", builtin: .member), "#222222")
        XCTAssertEqual(SpaceModern.roleColor(roles, userId: "@c:s", builtin: .founder), "#111111")
    }

    func testVoiceMovesAreOnlyFreshForAMinute() {
        XCTAssertTrue(VoiceMoves.isFresh(originServerTs: 100_000, now: 130_000))
        XCTAssertFalse(VoiceMoves.isFresh(originServerTs: 100_000, now: 170_000))
        XCTAssertFalse(VoiceMoves.isFresh(originServerTs: 200_000, now: 100_000))
        XCTAssertFalse(VoiceMoves.isFresh(originServerTs: 0, now: 100_000))
    }
}
