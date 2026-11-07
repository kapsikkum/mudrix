import XCTest
@testable import WizardChat

/// The cases of the web's `imageStrip.test.ts`, on the Swift port
final class ImageStripTests: XCTestCase {
    private func text(_ value: String) -> [Int] { value.unicodeScalars.map { Int($0.value) } }
    private func be16(_ n: Int) -> [Int] { [(n >> 8) & 0xff, n & 0xff] }
    private func be32(_ n: Int) -> [Int] { [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff] }
    private func bytes(_ parts: [Int]...) -> [UInt8] { parts.flatMap { $0 }.map { UInt8($0) } }

    private func segment(_ marker: Int, _ body: [Int]) -> [Int] {
        [0xff, marker] + be16(body.count + 2) + body
    }

    /// Exif segment body with one IFD0 entry: orientation
    private func exif(_ orientation: Int) -> [Int] {
        var tiff = text("MM") + be16(42) + be32(8) + be16(1)
        tiff += be16(0x0112) + be16(3) + be32(1) + be16(orientation) + [0, 0] + be32(0)
        return text("Exif") + [0, 0] + tiff
    }

    private let scan = [0xff, 0xda, 0, 4, 0, 0, 1, 2, 3, 0xff, 0xd9]

    private func contains(_ haystack: [UInt8], _ needle: [Int]) -> Bool {
        let wanted = needle.map { UInt8($0) }
        if wanted.count > haystack.count { return false }
        for start in 0...(haystack.count - wanted.count) where Array(haystack[start..<(start + wanted.count)]) == wanted {
            return true
        }
        return false
    }

    func testJpegDropsExifCommentsAndXmpButKeepsTheIccProfileAndThePicture() throws {
        let icc = segment(0xe2, text("ICC_PROFILE") + [0, 1, 2, 3])
        let jfif = segment(0xe0, text("JFIF") + [0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
        let xmp = segment(0xe1, text("http://ns.adobe.com/xap/1.0/") + [0, 1])
        let file = bytes([0xff, 0xd8], jfif, segment(0xe1, exif(6)), xmp, icc, segment(0xfe, text("hello")), scan)
        let out = try XCTUnwrap(ImageStrip.stripJpeg(file))
        XCTAssertEqual(out.orientation, 6)
        XCTAssertFalse(contains(out.data, text("Exif")))
        XCTAssertFalse(contains(out.data, text("xap")))
        XCTAssertFalse(contains(out.data, text("hello")))
        XCTAssertTrue(contains(out.data, text("ICC_PROFILE")))
        XCTAssertTrue(contains(out.data, text("JFIF")))
        XCTAssertEqual(Array(out.data.suffix(scan.count)), bytes(scan))
    }

    func testJpegWithoutExifIsUpright() {
        let file = bytes([0xff, 0xd8], segment(0xe0, text("JFIF-abcdefg")), scan)
        XCTAssertEqual(ImageStrip.stripJpeg(file)?.orientation, 1)
    }

    func testLittleEndianExifOrientationIsRead() {
        // "II", 42, IFD at 8, one entry: tag 0x0112, short, 1 value, 8
        var tiff = text("II") + [42, 0] + [8, 0, 0, 0] + [1, 0]
        tiff += [0x12, 0x01] + [3, 0] + [1, 0, 0, 0] + [8, 0] + [0, 0] + [0, 0, 0, 0]
        let file = bytes([0xff, 0xd8], segment(0xe1, text("Exif") + [0, 0] + tiff), scan)
        XCTAssertEqual(ImageStrip.stripJpeg(file)?.orientation, 8)
    }

    func testNotAJpegIsRejected() {
        XCTAssertNil(ImageStrip.stripJpeg([1, 2, 3, 4, 5]))
    }

    func testTruncatedJpegIsRejected() {
        let file = bytes([0xff, 0xd8], [0xff, 0xe1, 0x01, 0x00, 1, 2, 3])
        XCTAssertNil(ImageStrip.stripJpeg(file))
    }

    private func chunk(_ type: String, _ data: [Int]) -> [Int] {
        be32(data.count) + text(type) + data + [0, 0, 0, 0]
    }

    private let sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

    private var header: [Int] { chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]) }

    func testPngDropsTextExifAndTimeChunksOnly() {
        let file = bytes(
            sig, header,
            chunk("tEXt", text("Comment-secret")),
            chunk("eXIf", [1, 2, 3]),
            chunk("tIME", [1, 2, 3, 4, 5, 6, 7]),
            chunk("IDAT", [9, 9, 9]),
            chunk("IEND", []))
        let expected = bytes(sig, header, chunk("IDAT", [9, 9, 9]), chunk("IEND", []))
        XCTAssertEqual(ImageStrip.stripPng(file), expected)
    }

    func testNotAPngIsRejected() {
        XCTAssertNil(ImageStrip.stripPng([UInt8](repeating: 0, count: 30)))
    }

    func testAnimatedPngsAreRecognisedAndKeepTheirAnimationChunks() throws {
        let animated = bytes(
            sig, header,
            chunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0]),
            chunk("tEXt", text("Comment-secret")),
            chunk("IDAT", [9]),
            chunk("IEND", []))
        let still = bytes(sig, header, chunk("IDAT", [9]), chunk("IEND", []))
        XCTAssertTrue(ImageStrip.isAnimatedPng(animated))
        XCTAssertFalse(ImageStrip.isAnimatedPng(still))
        let out = try XCTUnwrap(ImageStrip.stripPng(animated))
        XCTAssertTrue(ImageStrip.isAnimatedPng(out))
        XCTAssertFalse(contains(out, text("Comment")))
    }

    func testFormatsAreRecognised() {
        XCTAssertEqual(ImagePrep.formatOf([0xff, 0xd8, 0xff, 0xe0]), .jpeg)
        XCTAssertEqual(ImagePrep.formatOf(bytes(sig, [0, 0])), .png)
        XCTAssertNil(ImagePrep.formatOf(bytes(text("GIF89a"), [0, 0, 0])))
    }
}
