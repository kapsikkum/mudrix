import XCTest
@testable import WizardChat

final class SquareCropTests: XCTestCase {
    func testSquareKeepsItsSize() {
        XCTAssertEqual(SquareCrop.of(width: 128, height: 128), SquareCrop(x: 0, y: 0, size: 128))
    }

    func testWideImageIsCroppedFromTheMiddle() {
        XCTAssertEqual(SquareCrop.of(width: 400, height: 100), SquareCrop(x: 150, y: 0, size: 100))
    }

    func testTallImageIsCroppedFromTheMiddle() {
        XCTAssertEqual(SquareCrop.of(width: 90, height: 300), SquareCrop(x: 0, y: 105, size: 90))
    }

    func testLargeImageIsCapped() {
        XCTAssertEqual(SquareCrop.of(width: 1024, height: 1024), SquareCrop(x: 0, y: 0, size: 256))
    }

    func testSmallImageIsNotUpscaled() {
        XCTAssertEqual(SquareCrop.of(width: 80, height: 40, max: 256), SquareCrop(x: 20, y: 0, size: 40))
    }
}
