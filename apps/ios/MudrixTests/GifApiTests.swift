import XCTest
import MudrixCore
@testable import Mudrix

/// Turning KLIPY's answers into the composer's GIFs (M11), matching the web's `gifProviders/klipy.ts`
final class GifApiTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    private var page: JSONValue {
        json("""
        {"result":true,"data":{"data":[
          {"id":1234,"type":"gif","title":"Funny","file":{
            "md":{"gif":{"url":"https://media.klipy.com/a.gif","width":"480","height":"270","size":1234}},
            "sm":{"gif":{"url":"https://media.klipy.com/s.gif","width":320,"height":180,"size":800}}}},
          {"id":"second","type":"gif","title":"Other","file":{
            "hd":{"gif":{"url":"https://media.klipy.com/b.gif","width":640,"height":360,"size":2048}},
            "xs":{"gif":{"url":"https://media.klipy.com/b-small.gif","width":160,"height":90,"size":200}}}},
          {"id":"third","type":"video","title":"Not a GIF","file":{
            "sm":{"gif":{"url":"https://media.klipy.com/c.gif","width":320,"height":180,"size":800}}}}
        ],"has_next":true}}
        """)
    }

    func testPageKeepsGifsAndReportsMore() {
        let parsed = GifApi.klipyItems(page)
        XCTAssertEqual(parsed.items.map(\.id), ["1234", "second"])
        XCTAssertTrue(parsed.hasNext)
        XCTAssertEqual(parsed.items.first?.url, "https://media.klipy.com/a.gif")
        XCTAssertEqual(parsed.items.first?.previewUrl, "https://media.klipy.com/s.gif")
        XCTAssertEqual(parsed.items.first?.width, 320)
        XCTAssertEqual(parsed.items.first?.height, 180)
        XCTAssertEqual(parsed.items.first?.title, "Funny")
        // The second has no small file, so its hd plays and its xs is the thumbnail
        XCTAssertEqual(parsed.items.last?.url, "https://media.klipy.com/b.gif")
        XCTAssertEqual(parsed.items.last?.previewUrl, "https://media.klipy.com/b-small.gif")
        XCTAssertEqual(parsed.items.last?.width, 160)
    }

    func testFilesOffKlipyAndOversizedGifsAreSkipped() {
        let offHost = json("""
        {"data":{"data":[{"id":"x","type":"gif","file":{"sm":{"gif":{"url":"https://example.com/a.gif","size":10}}}}]}}
        """)
        XCTAssertTrue(GifApi.klipyItems(offHost).items.isEmpty)

        let tooBig = json("""
        {"data":{"data":[{"id":"x","type":"gif","file":{"sm":{"gif":{"url":"https://media.klipy.com/a.gif","size":999999999}}}}]}}
        """)
        XCTAssertTrue(GifApi.klipyItems(tooBig).items.isEmpty)

        let noId = json("""
        {"data":{"data":[{"type":"gif","file":{"sm":{"gif":{"url":"https://media.klipy.com/a.gif","size":10}}}}]}}
        """)
        XCTAssertTrue(GifApi.klipyItems(noId).items.isEmpty)
    }

    func testDuplicatesCountOnceAndMissingNextPageReadsFalse() {
        let duplicated = json("""
        {"data":{"data":[
          {"id":"same","type":"gif","file":{"sm":{"gif":{"url":"https://media.klipy.com/a.gif","size":10}}}},
          {"id":"same","type":"gif","file":{"sm":{"gif":{"url":"https://media.klipy.com/b.gif","size":10}}}}
        ]}}
        """)
        let parsed = GifApi.klipyItems(duplicated)
        XCTAssertEqual(parsed.items.map(\.id), ["same"])
        XCTAssertFalse(parsed.hasNext)
    }

    func testOnlyHttpsKlipyHostsAreAllowed() {
        XCTAssertTrue(GifApi.isAllowedKlipyUrl("https://media.klipy.com/x.gif"))
        XCTAssertTrue(GifApi.isAllowedKlipyUrl("https://klipy.com/x.gif"))
        XCTAssertFalse(GifApi.isAllowedKlipyUrl("http://media.klipy.com/x.gif"))
        XCTAssertFalse(GifApi.isAllowedKlipyUrl("https://evilklipy.com/x.gif"))
        XCTAssertFalse(GifApi.isAllowedKlipyUrl("https://klipy.com.evil.example/x.gif"))
        XCTAssertFalse(GifApi.isAllowedKlipyUrl("not a url"))
    }

    func testProviderNames() {
        XCTAssertEqual(GifProvider.klipy.title, "KLIPY")
        XCTAssertEqual(GifProvider.giphy.title, "GIPHY")
        XCTAssertEqual(GifProvider.klipy.id, "klipy")
    }
}
