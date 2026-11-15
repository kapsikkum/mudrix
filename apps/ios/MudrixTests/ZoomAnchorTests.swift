import XCTest
import SwiftUI
@testable import Mudrix

/// Pinch zoom about the point between the fingers (M7): the arithmetic behind `ZoomableImage`
final class ZoomAnchorTests: XCTestCase {
    func testCentreAnchorMovesNothing() {
        let viewport = CGSize(width: 400, height: 300)
        let moved = ZoomAnchor.offset(current: .zero, anchor: .center, fromScale: 1, toScale: 3, viewport: viewport)
        XCTAssertEqual(moved.width, 0, accuracy: 0.001)
        XCTAssertEqual(moved.height, 0, accuracy: 0.001)
    }

    func testSameScaleKeepsTheOffset() {
        let current = CGSize(width: 12, height: -7)
        let moved = ZoomAnchor.offset(current: current, anchor: UnitPoint(x: 0.2, y: 0.8),
                                      fromScale: 2, toScale: 2, viewport: CGSize(width: 400, height: 300))
        XCTAssertEqual(moved.width, current.width, accuracy: 0.001)
        XCTAssertEqual(moved.height, current.height, accuracy: 0.001)
    }

    func testThePointUnderTheFingersStaysThere() {
        // A pinch at a quarter in from the left and three quarters down, from 1x to 1.5x, panned a little
        let viewport = CGSize(width: 400, height: 300)
        let anchor = UnitPoint(x: 0.25, y: 0.75)
        let before = CGSize(width: 10, height: -20)
        let after = ZoomAnchor.offset(current: before, anchor: anchor, fromScale: 1, toScale: 1.5, viewport: viewport)

        // In viewport coordinates measured from the centre the anchor sits at (-100, 75); the picture point
        // under it was at (-110, 95) at 1x, and must still land on (-100, 75) at 1.5x
        let content = CGPoint(x: (-100 - before.width), y: (75 - before.height))
        XCTAssertEqual(content.x * 1.5 + after.width, -100, accuracy: 0.001)
        XCTAssertEqual(content.y * 1.5 + after.height, 75, accuracy: 0.001)
    }

    func testEdgeAnchorZoomsTowardsThatEdge() {
        let viewport = CGSize(width: 400, height: 200)
        let moved = ZoomAnchor.offset(current: .zero, anchor: UnitPoint(x: 1, y: 0.5),
                                      fromScale: 1, toScale: 2, viewport: viewport)
        // The right edge stays put, so the picture shifts half its extra width to the left
        XCTAssertEqual(moved.width, -200, accuracy: 0.001)
        XCTAssertEqual(moved.height, 0, accuracy: 0.001)
    }

    func testDegenerateScalesAndViewportsKeepTheOffset() {
        let current = CGSize(width: 5, height: 6)
        XCTAssertEqual(ZoomAnchor.offset(current: current, anchor: .center, fromScale: 0, toScale: 2,
                                         viewport: CGSize(width: 400, height: 300)), current)
        XCTAssertEqual(ZoomAnchor.offset(current: current, anchor: .center, fromScale: 1, toScale: 0,
                                         viewport: CGSize(width: 400, height: 300)), current)
        XCTAssertEqual(ZoomAnchor.offset(current: current, anchor: .center, fromScale: 1, toScale: 2,
                                         viewport: .zero), current)
    }
}
