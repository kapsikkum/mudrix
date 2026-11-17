import XCTest
@testable import Mudrix

/// Custom cosmetics uploaded into the personal pack (P2), as the web's `uploadUser*` / `deleteUser*`
final class CosmeticUploadTests: XCTestCase {
    func testEachKindHasItsOwnUsage() {
        XCTAssertEqual(CosmeticUpload.usage(of: .decoration), "profile_decoration")
        XCTAssertEqual(CosmeticUpload.usage(of: .effect), "profile_effect")
        XCTAssertEqual(CosmeticUpload.usage(of: .nameplate), "nameplate")
        XCTAssertEqual(CosmeticUpload.usage(of: .profileFrame), "profile_frame")
    }

    func testOnlyAnimatedAndStillPictureFormatsAreTaken() {
        XCTAssertEqual(CosmeticUpload.mimetype(fileName: "a.PNG"), "image/png")
        XCTAssertEqual(CosmeticUpload.mimetype(fileName: "a.apng"), "image/png")
        XCTAssertEqual(CosmeticUpload.mimetype(fileName: "a.gif"), "image/gif")
        XCTAssertEqual(CosmeticUpload.mimetype(fileName: "a.webp"), "image/webp")
        XCTAssertNil(CosmeticUpload.mimetype(fileName: "a.jpg"))
        XCTAssertNil(CosmeticUpload.mimetype(fileName: "noending"))
    }

    func testChecks() {
        XCTAssertNil(CosmeticUpload.check(mimetype: "image/png", size: 1000))
        XCTAssertEqual(CosmeticUpload.check(mimetype: nil, size: 1000), .unsupported)
        XCTAssertEqual(CosmeticUpload.check(mimetype: "image/png", size: CosmeticUpload.maxBytes + 1), .tooLarge)
    }

    func testAddingToNoPackMakesThePersonalPack() {
        let added = CosmeticUpload.adding(to: nil, kind: .decoration, fileName: "Cat Ears.png", url: "mxc://s/a",
                                          mimetype: "image/png")
        XCTAssertEqual(added.shortcode, "cat_ears")
        XCTAssertEqual(added.name, "Cat Ears")
        let pack = added.content["pack"] as? [String: Any]
        XCTAssertEqual(pack?["display_name"] as? String, "personal")
        let images = added.content["images"] as? [String: Any]
        let entry = images?["cat_ears"] as? [String: Any]
        XCTAssertEqual(entry?["url"] as? String, "mxc://s/a")
        XCTAssertEqual(entry?["usage"] as? [String], ["profile_decoration"])
        XCTAssertEqual(entry?["body"] as? String, "Cat Ears")
        XCTAssertEqual(entry?["mimetype"] as? String, "image/png")
    }

    func testAnExistingPackAndItsImagesAreKeptAndTheShortcodeIsMadeUnique() {
        let existing: [String: Any] = [
            "pack": ["display_name": "mine", "usage": ["emoticon"]] as [String: Any],
            "images": ["glow": ["url": "mxc://s/old", "body": "glow"] as [String: Any]],
        ]
        let added = CosmeticUpload.adding(to: existing, kind: .effect, fileName: "glow.gif", url: "mxc://s/new",
                                          mimetype: "image/gif")
        XCTAssertEqual(added.shortcode, "glow_1")
        XCTAssertEqual(((added.content["pack"] as? [String: Any])?["display_name"]) as? String, "mine")
        XCTAssertEqual((added.content["images"] as? [String: Any])?.count, 2)
    }

    func testAFileNameWithNothingUsableFallsBackToTheKind() {
        let added = CosmeticUpload.adding(to: nil, kind: .profileFrame, fileName: "???.png", url: "mxc://s/a",
                                          mimetype: "image/png")
        XCTAssertEqual(added.shortcode, "frame")
    }

    func testRemovingTakesOutEveryImageWithThatUrl() {
        let pack: [String: Any] = [
            "images": [
                "a": ["url": "mxc://s/a"] as [String: Any],
                "b": ["url": "mxc://s/b"] as [String: Any],
            ],
        ]
        let after = CosmeticUpload.removing(url: "mxc://s/a", from: pack)
        XCTAssertEqual((after?["images"] as? [String: Any])?.keys.sorted(), ["b"])
        XCTAssertNil(CosmeticUpload.removing(url: "mxc://s/none", from: pack))
        XCTAssertNil(CosmeticUpload.removing(url: "mxc://s/a", from: nil))
    }
}
