import XCTest
import MudrixCore
@testable import Mudrix

/// GIF favourites in account data (K1), matching the web's `useGifFavourites.ts`
@MainActor
final class GifFavouritesTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    func testOnlyWebAndMediaUrlsAreKept() {
        XCTAssertTrue(GifFavourites.isStorable("https://media.giphy.com/x.gif"))
        XCTAssertTrue(GifFavourites.isStorable("mxc://example.org/abc"))
        XCTAssertFalse(GifFavourites.isStorable("http://media.giphy.com/x.gif"))
        XCTAssertFalse(GifFavourites.isStorable("file:///etc/passwd"))
        XCTAssertFalse(GifFavourites.isStorable(""))
    }

    func testSanitizeDropsDuplicatesOutsidersAndTheOldest() {
        let list = ["https://a/1.gif", "http://insecure/2.gif", "https://a/1.gif", "mxc://x/3", "", "https://a/4.gif"]
        XCTAssertEqual(GifFavourites.sanitize(list), ["https://a/1.gif", "mxc://x/3", "https://a/4.gif"])
        let many = (0..<60).map { "https://a/\($0).gif" }
        XCTAssertEqual(GifFavourites.sanitize(many).count, GifFavourites.cap)
        XCTAssertEqual(GifFavourites.sanitize(many).last, "https://a/49.gif")
    }

    func testTogglingPutsTheNewestFirst() {
        let start = ["https://a/1.gif", "https://a/2.gif"]
        XCTAssertEqual(GifFavourites.toggled(start, url: "https://a/3.gif"),
                       ["https://a/3.gif", "https://a/1.gif", "https://a/2.gif"])
        XCTAssertEqual(GifFavourites.toggled(start, url: "https://a/1.gif"), ["https://a/2.gif"])
        // An unstorable URL leaves the list alone
        XCTAssertEqual(GifFavourites.toggled(start, url: "javascript:alert(1)"), start)
        // Starring into a full list drops the oldest
        let full = (0..<GifFavourites.cap).map { "https://a/\($0).gif" }
        let starred = GifFavourites.toggled(full, url: "https://a/new.gif")
        XCTAssertEqual(starred.count, GifFavourites.cap)
        XCTAssertEqual(starred.first, "https://a/new.gif")
        XCTAssertFalse(starred.contains("https://a/49.gif"))
    }

    func testTheStoredEventIsTheWebShape() {
        let content = GifFavourites.content(["https://a/1.gif", "nope"])
        XCTAssertEqual(content, json(#"{"urls":["https://a/1.gif"]}"#))
        XCTAssertEqual(GifFavourites.parse(content), ["https://a/1.gif"])
        XCTAssertEqual(GifFavourites.parse(json(#"{"urls":["https://a/1.gif","https://a/1.gif"]}"#)),
                       ["https://a/1.gif"])
        XCTAssertEqual(GifFavourites.parse(json(#"{}"#)), [])
        XCTAssertEqual(GifFavourites.parse(json("[]")), [])
        XCTAssertEqual(GifFavourites.parse(nil), [])
    }

    func testTheOldDeviceListIsRead() throws {
        // What the picker saved before: whole GIFs
        let gifs = """
            [{"id":"abc","title":"Cat","url":"https://a/1.gif","previewUrl":"https://a/1p.gif",
              "width":200,"height":200}]
            """
        XCTAssertEqual(GifFavourites.legacyUrls(from: Data(gifs.utf8)), ["https://a/1.gif"])
        XCTAssertEqual(GifFavourites.legacyUrls(from: Data(#"["https://a/2.gif","mxc://x/3"]"#.utf8)),
                       ["https://a/2.gif", "mxc://x/3"])
        XCTAssertEqual(GifFavourites.legacyUrls(from: Data()), [])
        XCTAssertEqual(GifFavourites.legacyUrls(from: Data(#"{"urls":[]}"#.utf8)), [])
    }

    func testTheNamesMatchTheWebAndTheBase() {
        XCTAssertEqual(GifFavourites.type, "io.github.kapsikkum.mudrix.gif_favourites")
        XCTAssertEqual(GifFavourites.upstreamType, "org.wizardchat.gif_favourites")
        XCTAssertEqual(GifFavourites.readTypes, [GifFavourites.type, GifFavourites.upstreamType])
        XCTAssertEqual(GifFavourites.legacyKey, "gifFavourites")
    }
}
