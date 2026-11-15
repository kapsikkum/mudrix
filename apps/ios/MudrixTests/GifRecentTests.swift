import XCTest
@testable import Mudrix

/// The picker's Recent tab and the star on received GIFs (M11), matching the web's `gifRecentData.ts`
final class GifRecentTests: XCTestCase {
    private func gif(_ url: String) -> GiphyGif {
        GiphyGif(id: url, title: "t", url: url, previewUrl: url, width: 10, height: 20)
    }

    func testAddingMovesAnExistingGifToTheFront() {
        let list = [gif("https://a/1"), gif("https://a/2"), gif("https://a/3")]
        let next = GifRecent.adding(gif("https://a/3"), to: list)
        XCTAssertEqual(next.map(\.url), ["https://a/3", "https://a/1", "https://a/2"])
    }

    func testTheListIsCapped() {
        var list: [GiphyGif] = []
        for index in 0..<(GifRecent.cap + 5) { list = GifRecent.adding(gif("https://a/\(index)"), to: list) }
        XCTAssertEqual(list.count, GifRecent.cap)
        XCTAssertEqual(list.first?.url, "https://a/\(GifRecent.cap + 4)")
    }

    func testStoredListRoundTrips() {
        let list = [gif("https://a/1"), gif("https://a/2")]
        XCTAssertEqual(GifRecent.parse(GifRecent.encode(list)), list)
    }

    func testUnusableEntriesAreDroppedAndTheRestKept() {
        let raw = #"""
        [{"id":"1","title":"a","url":"https://a/1","previewUrl":"https://a/1","width":1,"height":1},
         {"nonsense":true},
         {"id":"2","title":"b","url":"","previewUrl":"","width":1,"height":1},
         {"id":"3","title":"c","url":"https://a/1","previewUrl":"https://a/1","width":1,"height":1},
         {"id":"4","title":"d","url":"https://a/4","previewUrl":"https://a/4","width":1,"height":1}]
        """#
        XCTAssertEqual(GifRecent.parse(Data(raw.utf8)).map(\.url), ["https://a/1", "https://a/4"])
    }

    func testNothingStoredIsAnEmptyList() {
        XCTAssertEqual(GifRecent.parse(nil), [])
        XCTAssertEqual(GifRecent.parse(Data("not json".utf8)), [])
    }

    func testEachAccountHasItsOwnList() {
        XCTAssertNotEqual(GifRecent.storageKey(userId: "@a:x"), GifRecent.storageKey(userId: "@b:x"))
    }

    func testOnlyAPlainMxcGifGetsAStar() {
        XCTAssertEqual(GifFavourites.receivedGifUrl(mimetype: "image/gif", url: "mxc://x/abc"), "mxc://x/abc")
        XCTAssertNil(GifFavourites.receivedGifUrl(mimetype: "image/png", url: "mxc://x/abc"))
        XCTAssertNil(GifFavourites.receivedGifUrl(mimetype: "image/gif", url: nil))
        XCTAssertNil(GifFavourites.receivedGifUrl(mimetype: "image/gif", url: "https://x/abc.gif"))
    }

    func testAFullListRefusesANewStarButStillAllowsRemoving() {
        let full = (0..<GifFavourites.cap).map { "https://a/\($0).gif" }
        XCTAssertTrue(GifFavourites.isFull(full, adding: "https://a/new.gif"))
        XCTAssertFalse(GifFavourites.isFull(full, adding: "https://a/3.gif"))
        XCTAssertFalse(GifFavourites.isFull([], adding: "https://a/new.gif"))
    }
}
