import XCTest
@testable import WizardChat

final class NotificationDedupTests: XCTestCase {
    func testOnlyARemotePushWithAnEventIdIsSuppressedWhileTheAppRuns() {
        XCTAssertTrue(NotificationDedup.suppressRemote(isRemote: true, hasEventId: true))
        XCTAssertFalse(NotificationDedup.suppressRemote(isRemote: true, hasEventId: false))
        XCTAssertFalse(NotificationDedup.suppressRemote(isRemote: false, hasEventId: true))
        XCTAssertFalse(NotificationDedup.suppressRemote(isRemote: false, hasEventId: false))
    }

    func testOnlyTheDeliveredPushOfTheSameEventIsRemoved() {
        let delivered = [
            NotificationDedup.Delivered(identifier: "push|$e", eventId: "$e", isRemote: true),
            NotificationDedup.Delivered(identifier: "@me:x|$e", eventId: "$e", isRemote: false),
            NotificationDedup.Delivered(identifier: "push|$other", eventId: "$other", isRemote: true),
            NotificationDedup.Delivered(identifier: "call", eventId: nil, isRemote: true),
        ]
        XCTAssertEqual(NotificationDedup.remoteDuplicates(of: delivered, eventId: "$e"), ["push|$e"])
    }

    func testNothingIsRemovedWithoutADeliveredPushForThatEvent() {
        let delivered = [NotificationDedup.Delivered(identifier: "@me:x|$e", eventId: "$e", isRemote: false)]
        XCTAssertEqual(NotificationDedup.remoteDuplicates(of: delivered, eventId: "$e"), [])
        XCTAssertEqual(NotificationDedup.remoteDuplicates(of: [], eventId: "$e"), [])
    }
}
