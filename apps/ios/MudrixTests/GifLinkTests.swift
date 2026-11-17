import XCTest
import MudrixCore
@testable import Mudrix

/// Bare GIPHY / KLIPY links in messages (M11), matching the web's `gifProviders/links.ts`
final class GifLinkTests: XCTestCase {
    func testGiphyMediaAndPageLinks() {
        XCTAssertEqual(GifLink.parse("https://media.giphy.com/media/abc123XY/giphy.gif"), .giphy(id: "abc123XY"))
        XCTAssertEqual(GifLink.parse("https://media2.giphy.com/media/abc123XY/giphy.gif"), .giphy(id: "abc123XY"))
        XCTAssertEqual(GifLink.parse("https://i.giphy.com/media/abc123XY/giphy.gif"), .giphy(id: "abc123XY"))
        XCTAssertEqual(GifLink.parse("https://i.giphy.com/abc123XY.gif"), .giphy(id: "abc123XY"))
        XCTAssertEqual(GifLink.parse("https://giphy.com/gifs/a-funny-title-abc123XY"), .giphy(id: "abc123XY"))
        XCTAssertEqual(GifLink.parse("https://www.giphy.com/gifs/abc123XY"), .giphy(id: "abc123XY"))
        XCTAssertEqual(GifLink.parse("https://giphy.com/embed/abc123XY"), .giphy(id: "abc123XY"))
    }

    func testSurroundingTextOtherHostsAndInsecureLinksAreNotGifs() {
        XCTAssertNil(GifLink.parse("look https://media.giphy.com/media/abc123XY/giphy.gif"))
        XCTAssertNil(GifLink.parse("https://media.giphy.com/media/abc123XY/giphy.gif and more"))
        XCTAssertNil(GifLink.parse("http://media.giphy.com/media/abc123XY/giphy.gif"))
        XCTAssertNil(GifLink.parse("https://notgiphy.com/gifs/abc123XY"))
        XCTAssertNil(GifLink.parse("https://giphy.com.evil.example/gifs/abc123XY"))
        XCTAssertNil(GifLink.parse("https://user:secret@media.giphy.com/media/abc123XY/giphy.gif"))
        XCTAssertNil(GifLink.parse(""))
        XCTAssertNil(GifLink.parse("   "))
    }

    func testTooShortAndTooLongIdsAreRejected() {
        XCTAssertNil(GifLink.parse("https://media.giphy.com/media/ab12/giphy.gif"))
        XCTAssertNil(GifLink.parse("https://media.giphy.com/media/\(String(repeating: "a", count: 33))/giphy.gif"))
    }

    func testAngleBracketedLinksCount() {
        XCTAssertEqual(GifLink.parse("<https://media.giphy.com/media/abc123XY/giphy.gif>"), .giphy(id: "abc123XY"))
    }

    func testKlipyPageAndDirectFiles() {
        XCTAssertEqual(GifLink.parse("https://klipy.com/gifs/some-funny-clip"), .klipySlug(slug: "some-funny-clip"))
        XCTAssertEqual(GifLink.parse("https://www.klipy.com/gifs/clip_01?ref=share"), .klipySlug(slug: "clip_01"))
        XCTAssertEqual(GifLink.parse("https://media.klipy.com/files/funny.gif"),
                       .klipyMedia(url: "https://media.klipy.com/files/funny.gif"))
        XCTAssertNil(GifLink.parse("https://media.klipy.com/files/funny.jpg"))
        XCTAssertNil(GifLink.parse("https://klipy.com/gifs/"))
        XCTAssertNil(GifLink.parse("https://klipy.com/search?q=cats"))
        XCTAssertNil(GifLink.parse("http://media.klipy.com/files/funny.gif"))
    }

    func testDirectResolutionAndWhichLinksNeedTheApi() {
        let giphy = GifLink.direct(.giphy(id: "abc123XY"))
        XCTAssertEqual(giphy?.url, "https://media.giphy.com/media/abc123XY/giphy.gif")
        XCTAssertEqual(giphy?.previewUrl, giphy?.url)
        XCTAssertEqual(GifLink.parse("https://giphy.com/gifs/abc123XY")?.needsApi, false)

        let media = GifLink.direct(.klipyMedia(url: "https://media.klipy.com/files/funny.gif"))
        XCTAssertEqual(media?.url, "https://media.klipy.com/files/funny.gif")

        XCTAssertNil(GifLink.direct(.klipySlug(slug: "some-funny-clip")))
        XCTAssertEqual(GifLink.parse("https://klipy.com/gifs/some-funny-clip")?.needsApi, true)
    }

    func testProvidersAndCacheKeys() {
        XCTAssertEqual(GifLink.parse("https://giphy.com/gifs/abc123XY")?.provider, GifProvider.giphy.id)
        XCTAssertEqual(GifLink.parse("https://klipy.com/gifs/clip")?.provider, GifProvider.klipy.id)
        XCTAssertEqual(GifLink.parse("https://giphy.com/gifs/abc123XY")?.cacheKey, "giphy:abc123XY")
        XCTAssertEqual(GifLink.parse("https://klipy.com/gifs/clip")?.cacheKey, "klipy:clip")
        XCTAssertEqual(GifLink.parse("https://klipy.com/gifs/clip")?.klipySlug, "clip")
        XCTAssertNil(GifLink.parse("https://giphy.com/gifs/abc123XY")?.klipySlug)
    }
}
