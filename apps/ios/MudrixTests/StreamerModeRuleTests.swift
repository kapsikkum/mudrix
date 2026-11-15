import XCTest
@testable import Mudrix

/// When streamer mode hides private details (A15), as the web's `useStreamerMode`
final class StreamerModeRuleTests: XCTestCase {
    func testOffNeverHides() {
        XCTAssertFalse(StreamerMode.off.isActive(screenCaptured: true, ownScreenSharing: true))
    }

    func testOnAlwaysHides() {
        XCTAssertTrue(StreamerMode.on.isActive(screenCaptured: false, ownScreenSharing: false))
    }

    func testAutoFollowsTheScreenBeingCapturedOrShared() {
        XCTAssertFalse(StreamerMode.auto.isActive(screenCaptured: false, ownScreenSharing: false))
        XCTAssertTrue(StreamerMode.auto.isActive(screenCaptured: true, ownScreenSharing: false))
        XCTAssertTrue(StreamerMode.auto.isActive(screenCaptured: false, ownScreenSharing: true))
    }
}
