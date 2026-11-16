import XCTest
import MudrixCore
@testable import Mudrix

/// GIF favourites in account data (K1), matching the web's `useGifFavourites.ts`.
///
/// `GifFavourites` is main-actor isolated, and XCTest discovers tests through Objective-C entry points
/// that Xcode 26 does not infer a class-level `@MainActor` onto: every test method is annotated, and the
/// isolated calls are made before the assertions (an assertion's autoclosure is nonisolated).
final class GifFavouritesTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    @MainActor
    func testOnlyWebAndMediaUrlsAreKept() {
        let gif = GifFavourites.isStorable("https://media.giphy.com/x.gif")
        let mxc = GifFavourites.isStorable("mxc://example.org/abc")
        let insecure = GifFavourites.isStorable("http://media.giphy.com/x.gif")
        let file = GifFavourites.isStorable("file:///etc/passwd")
        let empty = GifFavourites.isStorable("")
        XCTAssertTrue(gif)
        XCTAssertTrue(mxc)
        XCTAssertFalse(insecure)
        XCTAssertFalse(file)
        XCTAssertFalse(empty)
    }

    @MainActor
    func testSanitizeDropsDuplicatesOutsidersAndTheOldest() {
        let list = ["https://a/1.gif", "http://insecure/2.gif", "https://a/1.gif", "mxc://x/3", "", "https://a/4.gif"]
        let sanitized = GifFavourites.sanitize(list)
        XCTAssertEqual(sanitized, ["https://a/1.gif", "mxc://x/3", "https://a/4.gif"])
        let many = (0..<60).map { "https://a/\($0).gif" }
        let capped = GifFavourites.sanitize(many)
        let cap = GifFavourites.cap
        XCTAssertEqual(capped.count, cap)
        XCTAssertEqual(capped.last, "https://a/49.gif")
    }

    @MainActor
    func testTogglingPutsTheNewestFirst() {
        let start = ["https://a/1.gif", "https://a/2.gif"]
        let added = GifFavourites.toggled(start, url: "https://a/3.gif")
        XCTAssertEqual(added, ["https://a/3.gif", "https://a/1.gif", "https://a/2.gif"])
        let removed = GifFavourites.toggled(start, url: "https://a/1.gif")
        XCTAssertEqual(removed, ["https://a/2.gif"])
        // An unstorable URL leaves the list alone
        let unchanged = GifFavourites.toggled(start, url: "javascript:alert(1)")
        XCTAssertEqual(unchanged, start)
        // Starring into a full list drops the oldest
        let cap = GifFavourites.cap
        let full = (0..<cap).map { "https://a/\($0).gif" }
        let starred = GifFavourites.toggled(full, url: "https://a/new.gif")
        XCTAssertEqual(starred.count, cap)
        XCTAssertEqual(starred.first, "https://a/new.gif")
        XCTAssertFalse(starred.contains("https://a/49.gif"))
    }

    @MainActor
    func testTheStoredEventIsTheWebShape() {
        let content = GifFavourites.content(["https://a/1.gif", "nope"])
        XCTAssertEqual(content, json(#"{"urls":["https://a/1.gif"]}"#))
        let parsed = GifFavourites.parse(content)
        XCTAssertEqual(parsed, ["https://a/1.gif"])
        let deduped = GifFavourites.parse(json(#"{"urls":["https://a/1.gif","https://a/1.gif"]}"#))
        XCTAssertEqual(deduped, ["https://a/1.gif"])
        let emptyObject = GifFavourites.parse(json(#"{}"#))
        XCTAssertEqual(emptyObject, [])
        let emptyArray = GifFavourites.parse(json("[]"))
        XCTAssertEqual(emptyArray, [])
        let missing = GifFavourites.parse(nil)
        XCTAssertEqual(missing, [])
    }

    @MainActor
    func testTheOldDeviceListIsRead() throws {
        // What the picker saved before: whole GIFs
        let gifs = """
            [{"id":"abc","title":"Cat","url":"https://a/1.gif","previewUrl":"https://a/1p.gif",
              "width":200,"height":200}]
            """
        let fromGifs = GifFavourites.legacyUrls(from: Data(gifs.utf8))
        XCTAssertEqual(fromGifs, ["https://a/1.gif"])
        let fromStrings = GifFavourites.legacyUrls(from: Data(#"["https://a/2.gif","mxc://x/3"]"#.utf8))
        XCTAssertEqual(fromStrings, ["https://a/2.gif", "mxc://x/3"])
        let empty = GifFavourites.legacyUrls(from: Data())
        XCTAssertEqual(empty, [])
        let noUrls = GifFavourites.legacyUrls(from: Data(#"{"urls":[]}"#.utf8))
        XCTAssertEqual(noUrls, [])
    }

    @MainActor
    func testTheNamesMatchTheWebAndTheBase() {
        let type = GifFavourites.type
        let upstreamType = GifFavourites.upstreamType
        let readTypes = GifFavourites.readTypes
        let legacyKey = GifFavourites.legacyKey
        XCTAssertEqual(type, "io.github.kapsikkum.mudrix.gif_favourites")
        XCTAssertEqual(upstreamType, "org.wizardchat.gif_favourites")
        XCTAssertEqual(readTypes, [type, upstreamType])
        XCTAssertEqual(legacyKey, "gifFavourites")
    }
}
