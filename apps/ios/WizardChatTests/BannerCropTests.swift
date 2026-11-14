import XCTest
@testable import WizardChat

final class BannerCropTests: XCTestCase {
    func testImageAtTheBannerAspectIsKeptWhole() {
        XCTAssertEqual(BannerCrop.rect(width: 1200, height: 400, focus: 0.5),
                       BannerCrop.Rect(x: 0, y: 0, width: 1200, height: 400))
    }

    func testWideImageIsCroppedLeftAndRight() {
        XCTAssertEqual(BannerCrop.rect(width: 3000, height: 500, focus: 0),
                       BannerCrop.Rect(x: 0, y: 0, width: 1500, height: 500))
        XCTAssertEqual(BannerCrop.rect(width: 3000, height: 500, focus: 0.5),
                       BannerCrop.Rect(x: 750, y: 0, width: 1500, height: 500))
        XCTAssertEqual(BannerCrop.rect(width: 3000, height: 500, focus: 1),
                       BannerCrop.Rect(x: 1500, y: 0, width: 1500, height: 500))
    }

    func testTallImageIsCroppedTopAndBottom() {
        XCTAssertEqual(BannerCrop.rect(width: 900, height: 1800, focus: 0),
                       BannerCrop.Rect(x: 0, y: 0, width: 900, height: 300))
        XCTAssertEqual(BannerCrop.rect(width: 900, height: 1800, focus: 0.5),
                       BannerCrop.Rect(x: 0, y: 750, width: 900, height: 300))
        XCTAssertEqual(BannerCrop.rect(width: 900, height: 1800, focus: 1),
                       BannerCrop.Rect(x: 0, y: 1500, width: 900, height: 300))
    }

    func testFocusOutsideTheRangeIsClampedToTheEdges() {
        XCTAssertEqual(BannerCrop.rect(width: 3000, height: 500, focus: -2).x, 0)
        XCTAssertEqual(BannerCrop.rect(width: 3000, height: 500, focus: 4).x, 1500)
        XCTAssertEqual(BannerCrop.rect(width: 900, height: 1800, focus: -2).y, 0)
        XCTAssertEqual(BannerCrop.rect(width: 900, height: 1800, focus: 4).y, 1500)
    }

    func testTheKeptRectangleNeverLeavesTheImage() {
        let sizes = [(3, 1), (333, 1000), (1000, 333), (1920, 1080), (1080, 1920)]
        for (width, height) in sizes {
            for focus in [0.0, 0.25, 0.5, 0.75, 1.0] {
                let rect = BannerCrop.rect(width: width, height: height, focus: focus)
                XCTAssertGreaterThanOrEqual(rect.x, 0, "negative offset for \(width)x\(height) at \(focus)")
                XCTAssertGreaterThanOrEqual(rect.y, 0, "negative offset for \(width)x\(height) at \(focus)")
                XCTAssertLessThanOrEqual(rect.x + rect.width, width, "overflowing width for \(width)x\(height) at \(focus)")
                XCTAssertLessThanOrEqual(rect.y + rect.height, height, "overflowing height for \(width)x\(height) at \(focus)")
                XCTAssertGreaterThan(rect.width, 0, "empty rectangle for \(width)x\(height) at \(focus)")
                XCTAssertGreaterThan(rect.height, 0, "empty rectangle for \(width)x\(height) at \(focus)")
            }
        }
    }
}
