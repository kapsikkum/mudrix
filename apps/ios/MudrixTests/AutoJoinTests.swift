import XCTest
import MudrixCore
@testable import Mudrix

/// Joining people to every room of a space (R3), the rules of the web's `useAutoJoinSpaceRooms.ts`
final class AutoJoinTests: XCTestCase {
    private func child(_ id: String, rule: String? = "public", joined: Bool = false, invited: Bool = false,
                       knocked: Bool = false, isSpace: Bool = false) -> SpaceChild {
        SpaceChild(id: id, name: id, memberCount: 1, isSpace: isSpace, joined: joined, invited: invited,
                   knocked: knocked, via: ["example.org"], suggested: false, joinRule: rule, worldReadable: false,
                   childrenCount: 0)
    }

    func testPrivateRoomsAreLeftAloneAndAMissingRuleIsTried() {
        XCTAssertTrue(AutoJoin.joinable(rule: "public"))
        XCTAssertTrue(AutoJoin.joinable(rule: "restricted"))
        XCTAssertTrue(AutoJoin.joinable(rule: nil))
        XCTAssertFalse(AutoJoin.joinable(rule: "invite"))
        XCTAssertFalse(AutoJoin.joinable(rule: "knock"))
    }

    func testCandidatesSkipJoinedInvitedKnockedSpacesAndWhatWasTried() {
        let children = [
            child("!a"), child("!joined", joined: true), child("!invited", invited: true), child("!knocked", knocked: true),
            child("!private", rule: "invite"), child("!sub", isSpace: true), child("!tried"), child("!b", rule: nil),
        ]
        XCTAssertEqual(AutoJoin.candidates(children, done: ["!tried"]).map(\.id), ["!a", "!b"])
    }

    func testAModernSpaceJoinsUnlessSetOtherwise() {
        XCTAssertTrue(AutoJoin.enabled(explicit: nil, rootStyle: .modern))
        XCTAssertFalse(AutoJoin.enabled(explicit: nil, rootStyle: .matrix))
        XCTAssertFalse(AutoJoin.enabled(explicit: false, rootStyle: .modern))
        XCTAssertTrue(AutoJoin.enabled(explicit: true, rootStyle: .matrix))
    }

    func testOnlyRefusalsAboutTheRoomAreFinal() {
        XCTAssertEqual(AutoJoin.outcome(of: WizardError(code: "http", message: "x", errcode: "M_FORBIDDEN")), .refused)
        XCTAssertEqual(AutoJoin.outcome(of: WizardError(code: "http", message: "x", errcode: "M_LIMIT_EXCEEDED")), .later)
        XCTAssertEqual(AutoJoin.outcome(of: WizardError(code: "http", message: "x", errcode: "M_UNKNOWN")), .later)
        XCTAssertEqual(AutoJoin.outcome(of: WizardError(code: "net", message: "offline")), .later)
    }

    func testRememberedRoomsAreCappedKeepingTheNewest() {
        let many = (0..<(AutoJoin.maxRemembered + 3)).map { "!r\($0)" }
        let kept = AutoJoin.trimmed(many)
        XCTAssertEqual(kept.count, AutoJoin.maxRemembered)
        XCTAssertEqual(kept.last, "!r\(AutoJoin.maxRemembered + 2)")
        XCTAssertEqual(AutoJoin.trimmed(["!a"]), ["!a"])
    }

    func testLaterPassesBackOffUpToFifteenMinutes() {
        XCTAssertEqual(AutoJoin.laterDelay(pass: 0), 30)
        XCTAssertEqual(AutoJoin.laterDelay(pass: 1), 60)
        XCTAssertEqual(AutoJoin.laterDelay(pass: 10), 900)
    }
}
