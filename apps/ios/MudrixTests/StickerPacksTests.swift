import XCTest
import MudrixCore
@testable import Mudrix

/// Mirrors Android's `matrix/StickerPacksTest.kt`
final class StickerPacksTests: XCTestCase {
    private func pack(room: String?, _ urls: String...) -> EmojiPack {
        EmojiPack(id: "pack", name: "Pack", roomId: room, images: urls.map { url in
            PackImage(shortcode: (url as NSString).lastPathComponent, url: url, emoticon: false, sticker: true)
        })
    }

    func testThePackHoldingTheImageIsFound() {
        let first = pack(room: "!a:x", "mxc://a/one")
        let second = pack(room: "!b:x", "mxc://b/two", "mxc://b/three")
        XCTAssertEqual(StickerPacks.find([first, second], url: "mxc://b/three"), second)
        XCTAssertNil(StickerPacks.find([first, second], url: "mxc://c/four"))
    }

    func testTheImageUrlIsReadFromPlainAndEncryptedMediaSources() {
        XCTAssertEqual(StickerPacks.imageUrl(.object(["url": .string("mxc://a/one")])), "mxc://a/one")
        XCTAssertEqual(StickerPacks.imageUrl(.object(["file": .object(["url": .string("mxc://a/two"), "key": .string("k")])])),
                       "mxc://a/two")
        XCTAssertNil(StickerPacks.imageUrl(.object(["file": .object(["key": .string("k")])])))
        XCTAssertNil(StickerPacks.imageUrl(.null))
    }

    func testTheRoomOnScreenIsSearchedFirstAndListedOnce() {
        XCTAssertEqual(StickerPacks.roomOrder(current: "!here:x", others: ["!a:x", "!here:x", "!b:x", "!a:x"]),
                       ["!here:x", "!a:x", "!b:x"])
        XCTAssertEqual(StickerPacks.roomOrder(current: nil, others: ["!a:x"]), ["!a:x"])
        XCTAssertEqual(StickerPacks.roomOrder(current: "", others: ["!a:x"]), ["!a:x"])
    }
}
