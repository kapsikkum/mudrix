import XCTest
import MudrixCore
@testable import Mudrix

/// Mirrors Android's `matrix/GalleryTagsTest.kt`
final class GalleryTagsTests: XCTestCase {
    func testOnlyStillPicturesCountTowardAGallery() {
        XCTAssertTrue(GalleryTags.isGalleryImage("image/jpeg"))
        XCTAssertTrue(GalleryTags.isGalleryImage("image/gif"))
        XCTAssertFalse(GalleryTags.isGalleryImage("image/svg+xml"))
        XCTAssertFalse(GalleryTags.isGalleryImage("video/mp4"))
        XCTAssertFalse(GalleryTags.isGalleryImage(nil))
    }

    func testImagesSentTogetherShareOneIdAndAreNumberedInOrder() {
        let tags = GalleryTags.plan(mimeTypes: ["image/jpeg", "video/mp4", "image/png", "image/gif"], id: "g1")
        XCTAssertEqual(tags[0], GalleryTags.Tag(id: "g1", index: 0, count: 3))
        XCTAssertNil(tags[1])
        XCTAssertEqual(tags[2], GalleryTags.Tag(id: "g1", index: 1, count: 3))
        XCTAssertEqual(tags[3], GalleryTags.Tag(id: "g1", index: 2, count: 3))
    }

    func testASingleImageOrASetOfOnlyOtherFilesIsNotTagged() {
        XCTAssertTrue(GalleryTags.plan(mimeTypes: ["image/jpeg"], id: "g1").allSatisfy { $0 == nil })
        XCTAssertTrue(GalleryTags.plan(mimeTypes: ["video/mp4", "video/mp4"], id: "g1").allSatisfy { $0 == nil })
    }

    func testAnIdThatIsEmptyOrTooLongIsNotUsed() {
        XCTAssertTrue(GalleryTags.plan(mimeTypes: ["image/jpeg", "image/png"], id: "").allSatisfy { $0 == nil })
        XCTAssertTrue(GalleryTags.plan(mimeTypes: ["image/jpeg", "image/png"],
                                        id: String(repeating: "x", count: 65)).allSatisfy { $0 == nil })
    }

    func testTheTagGoesUnderTheCurrentMudrixKeyWithIdIndexAndCount() throws {
        let content = GalleryTags.content(GalleryTags.Tag(id: "g1", index: 1, count: 2))
        XCTAssertEqual(GalleryTags.key, "io.github.kapsikkum.mudrix.gallery")
        let tag = try XCTUnwrap(content[GalleryTags.key])
        XCTAssertEqual(tag["id"]?.string, "g1")
        XCTAssertEqual(tag["index"]?.number, 1)
        XCTAssertEqual(tag["count"]?.number, 2)
    }
}
