import XCTest
@testable import WizardChat

final class SessionStoreLocationTests: XCTestCase {
    func testTheAppGroupIsUsedOnceTheOldCopyIsGoneOrAlreadyMoved() {
        XCTAssertEqual(StoreLocation.plan(groupAvailable: true, oldExists: false, newExists: true), .useNew)
        XCTAssertEqual(StoreLocation.plan(groupAvailable: true, oldExists: false, newExists: false), .useNew)
        XCTAssertEqual(StoreLocation.plan(groupAvailable: true, oldExists: true, newExists: true), .useNew)
    }

    func testAnExistingOldCopyIsMovedOnlyWhenTheNewPlaceIsEmpty() {
        XCTAssertEqual(StoreLocation.plan(groupAvailable: true, oldExists: true, newExists: false), .moveToNew)
    }

    func testWithoutTheGroupNothingIsMovedAndTheOldPathStays() {
        XCTAssertEqual(StoreLocation.plan(groupAvailable: false, oldExists: true, newExists: false), .useOld)
        XCTAssertEqual(StoreLocation.plan(groupAvailable: false, oldExists: true, newExists: true), .useOld)
        XCTAssertEqual(StoreLocation.plan(groupAvailable: false, oldExists: false, newExists: false), .useOld)
    }

    func testTheKeychainGroupNeedsATeamPrefix() {
        XCTAssertEqual(SharedSessionStore.validAccessGroup("ABCDE12345.chat.mudrix.mobile"),
                       "ABCDE12345.chat.mudrix.mobile")
        XCTAssertEqual(SharedSessionStore.validAccessGroup(" ABCDE12345.chat.mudrix.mobile \n"),
                       "ABCDE12345.chat.mudrix.mobile")
        XCTAssertNil(SharedSessionStore.validAccessGroup(nil))
        XCTAssertNil(SharedSessionStore.validAccessGroup(""))
        XCTAssertNil(SharedSessionStore.validAccessGroup("   "))
        XCTAssertNil(SharedSessionStore.validAccessGroup("chat.mudrix.mobile"))
        XCTAssertNil(SharedSessionStore.validAccessGroup("$(AppIdentifierPrefix)chat.mudrix.mobile"))
        XCTAssertNil(SharedSessionStore.validAccessGroup("ABCDE1234.chat.mudrix.mobile"))
        XCTAssertNil(SharedSessionStore.validAccessGroup("ABCDE12345"))
    }
}
