import UIKit
import XCTest
@testable import Mudrix

/// A picture chosen as a space's banner (R1)
final class SpaceBannerUploadTests: XCTestCase {
    private func png(width: CGFloat, height: CGFloat) -> Data {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).pngData { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    func testAWidePictureIsScaledDownToTheLimit() throws {
        let jpeg = try XCTUnwrap(SpaceModern.bannerJpeg(from: png(width: 3200, height: 800)))
        let image = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(image.size.width * image.scale, SpaceModern.bannerMaxWidth, accuracy: 1)
        XCTAssertEqual(image.size.height * image.scale, 400, accuracy: 1)
    }

    func testASmallPictureKeepsItsSize() throws {
        let jpeg = try XCTUnwrap(SpaceModern.bannerJpeg(from: png(width: 600, height: 200)))
        let image = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(image.size.width * image.scale, 600, accuracy: 1)
    }

    func testBytesThatAreNotAPictureGiveNothing() {
        XCTAssertNil(SpaceModern.bannerJpeg(from: Data("not an image".utf8)))
    }
}
