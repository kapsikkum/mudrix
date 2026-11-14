import XCTest
@testable import WizardChat

final class RoomDisplayNameTests: XCTestCase {
    func testADMWhosePartnerLeftIsNamedAfterThePartner() {
        XCTAssertEqual(roomDisplayName(isDirect: true, dmUserName: "Sable", name: "Empty Room (was Sable)",
                                       canonicalAlias: nil, id: "!dm:example.org"), "Sable")
    }

    func testADMWithoutAPartnerNameKeepsTheRoomName() {
        XCTAssertEqual(roomDisplayName(isDirect: true, dmUserName: nil, name: "Sable",
                                       canonicalAlias: nil, id: "!dm:example.org"), "Sable")
        XCTAssertEqual(roomDisplayName(isDirect: true, dmUserName: "", name: "Sable",
                                       canonicalAlias: nil, id: "!dm:example.org"), "Sable")
    }

    func testARoomKeepsItsOwnName() {
        XCTAssertEqual(roomDisplayName(isDirect: false, dmUserName: nil, name: "general",
                                       canonicalAlias: "#general:example.org", id: "!room:example.org"), "general")
    }

    func testWithoutAnyNameTheAliasThenTheIdIsUsed() {
        XCTAssertEqual(roomDisplayName(isDirect: false, dmUserName: nil, name: nil,
                                       canonicalAlias: "#general:example.org", id: "!room:example.org"), "#general:example.org")
        XCTAssertEqual(roomDisplayName(isDirect: false, dmUserName: nil, name: nil,
                                       canonicalAlias: nil, id: "!room:example.org"), "!room:example.org")
    }
}
