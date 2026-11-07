import XCTest
import WizardChatCore
@testable import WizardChat

final class SignInIdentifierTests: XCTestCase {
    func testReadsWhatTheBoxCanHold() {
        XCTAssertEqual(SignInIdentifier.parse(" ash "), .user("ash"))
        XCTAssertEqual(SignInIdentifier.parse("@ash"), .user("ash"))
        XCTAssertEqual(SignInIdentifier.parse("@ash:example.org"), .mxid("@ash:example.org"))
        XCTAssertEqual(SignInIdentifier.parse("ash@mail.example"), .email("ash@mail.example"))
        XCTAssertEqual(SignInIdentifier.parse("+49 151 234567"), .phone("49151234567"))
        XCTAssertNil(SignInIdentifier.parse("  "))
    }

    func testARunOfDigitsIsAUsername() {
        XCTAssertEqual(SignInIdentifier.parse("1234567"), .user("1234567"))
    }

    func testAnEmailOnTheServerNameIsAUserId() {
        XCTAssertEqual(SignInIdentifier.interpret("ash@example.org", serverName: "example.org"), .user("ash"))
        XCTAssertEqual(SignInIdentifier.interpret("ash@mail.example", serverName: "example.org"), .email("ash@mail.example"))
    }

    func testBecomesTheCoreIdentifier() {
        XCTAssertEqual(SignInIdentifier.mxid("@a:b.org").toCore(), LoginIdentifier.user(.init(user: "@a:b.org")))
        XCTAssertEqual(SignInIdentifier.phone("491").toCore(), LoginIdentifier.phone(.init(number: "491")))
        XCTAssertEqual(SignInIdentifier.email("a@b.co").toCore(), LoginIdentifier.email(.init(address: "a@b.co")))
    }
}
