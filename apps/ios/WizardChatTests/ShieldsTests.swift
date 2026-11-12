import XCTest
import WizardChatCore
@testable import WizardChat

final class ShieldsTests: XCTestCase {
    func testNoShieldShowsNothing() {
        XCTAssertNil(Shields.display(nil))
    }

    func testSentInClearIsAlwaysRed() {
        let display = Shields.display(ShieldView(color: .grey, code: .sentInClear))
        XCTAssertEqual(display, Shields.Display(kind: .red, reasonKey: "encryption.shield.sentInClear"))
    }

    func testRedShieldIsAWarning() {
        let display = Shields.display(ShieldView(color: .red, code: .unverifiedIdentity))
        XCTAssertEqual(display, Shields.Display(kind: .warning, reasonKey: "encryption.shield.unverifiedIdentity"))
    }

    func testGreyShieldIsQuiet() {
        XCTAssertEqual(Shields.display(ShieldView(color: .grey, code: .unknownDevice))?.kind, .grey)
    }

    func testEveryCodeHasItsOwnReason() {
        let keys = ShieldCode.allCases.map { Shields.reasonKey($0) }
        XCTAssertEqual(Set(keys).count, ShieldCode.allCases.count)
    }
}
