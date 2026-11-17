import XCTest
import MudrixCore
@testable import Mudrix

/// Mirrors Android's `media/TextFileTest.kt`
final class TextFileTests: XCTestCase {
    func testTextFilesArePickedByExtensionOrMimeType() {
        XCTAssertTrue(TextFile.showsCard(filename: "notes.md", mimetype: nil, size: nil))
        XCTAssertTrue(TextFile.showsCard(filename: "config.JSON", mimetype: "application/octet-stream", size: 10))
        XCTAssertTrue(TextFile.showsCard(filename: "notes", mimetype: "text/plain", size: 10))
        XCTAssertFalse(TextFile.showsCard(filename: "photo.png", mimetype: "image/png", size: 10))
        XCTAssertFalse(TextFile.showsCard(filename: "document.txt", mimetype: "application/pdf", size: 10))
        XCTAssertFalse(TextFile.showsCard(filename: "document.pdf", mimetype: nil, size: 10))
    }

    func testOnlySmallFilesGetTheCard() {
        XCTAssertTrue(TextFile.showsCard(filename: "a.txt", mimetype: "text/plain", size: TextFile.cardMaxBytes))
        XCTAssertFalse(TextFile.showsCard(filename: "a.txt", mimetype: "text/plain", size: TextFile.cardMaxBytes + 1))
    }

    func testTheHeadStopsAtTheLimitWithoutAHalfCharacter() {
        let bytes = Data("héllo".utf8)
        XCTAssertEqual(TextFile.decodeHead(bytes, limit: 2), "h")
        XCTAssertEqual(TextFile.decodeHead(bytes, limit: bytes.count), "héllo")
        XCTAssertEqual(TextFile.decodeHead(bytes), "héllo")
    }

    func testAnExpandedCardIsCapped() {
        let long = String(repeating: "x", count: TextFile.maxCardCharacters + 20)
        XCTAssertEqual(TextFile.clampForCard(long).count, TextFile.maxCardCharacters)
        XCTAssertEqual(TextFile.clampForCard("short"), "short")
    }
}
