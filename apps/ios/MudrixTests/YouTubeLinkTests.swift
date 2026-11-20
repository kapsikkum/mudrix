import MudrixCore
import XCTest
@testable import Mudrix

final class YouTubeLinkTests: XCTestCase {
    func testWatchLinks() {
        XCTAssertEqual(YouTubeLink.parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
                       YouTubeVideo(id: "dQw4w9WgXcQ", start: 0))
        XCTAssertEqual(YouTubeLink.parse("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=90"),
                       YouTubeVideo(id: "dQw4w9WgXcQ", start: 90))
        XCTAssertEqual(YouTubeLink.parse("https://youtu.be/dQw4w9WgXcQ?t=1h2m3s"),
                       YouTubeVideo(id: "dQw4w9WgXcQ", start: 3723))
    }

    func testOtherShapes() {
        XCTAssertEqual(YouTubeLink.parse("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.id, "dQw4w9WgXcQ")
        XCTAssertEqual(YouTubeLink.parse("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30")?.start, 30)
        XCTAssertEqual(YouTubeLink.parse("https://www.youtube.com/live/dQw4w9WgXcQ")?.id, "dQw4w9WgXcQ")
    }

    func testRejects() {
        XCTAssertNil(YouTubeLink.parse("https://example.com/watch?v=dQw4w9WgXcQ"))
        XCTAssertNil(YouTubeLink.parse("https://www.youtube.com/watch?v=short"))
        XCTAssertNil(YouTubeLink.parse("https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx"))
        XCTAssertNil(YouTubeLink.parse("ftp://youtu.be/dQw4w9WgXcQ"))
    }

    func testEmbedUrl() {
        XCTAssertEqual(YouTubeLink.embedUrl(YouTubeVideo(id: "dQw4w9WgXcQ", start: 0)),
                       "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1")
        XCTAssertTrue(YouTubeLink.embedUrl(YouTubeVideo(id: "dQw4w9WgXcQ", start: 5)).hasSuffix("&start=5"))
    }
}

final class LinkEmbedTests: XCTestCase {
    private func match(_ url: String) -> LinkEmbedMatch? { LinkEmbedLinks.match(url) }

    func testPostLinksPickTheirService() {
        XCTAssertEqual(match("https://x.com/JesseCohenInv/status/2120962452137431338"),
                       LinkEmbedMatch(service: .x, url: "https://x.com/JesseCohenInv/status/2120962452137431338"))
        XCTAssertEqual(match("https://mobile.twitter.com/jack/status/20?s=1")?.url, "https://x.com/jack/status/20")
        XCTAssertEqual(match("https://twitter.com/jack")?.service, .x)
        XCTAssertEqual(match("https://www.instagram.com/reel/Df7kllksYsl/?igsh=1")?.url, "https://www.instagram.com/reel/Df7kllksYsl/")
        XCTAssertEqual(match("https://instagram.com/share/BAbc123")?.service, .instagram)
        XCTAssertEqual(match("https://www.tiktok.com/@sanilarena/video/7316987797758279723")?.service, .tiktok)
        XCTAssertEqual(match("https://vm.tiktok.com/ZMabc/")?.service, .tiktok)
        XCTAssertEqual(match("https://www.tiktok.com/t/ZTabc/")?.service, .tiktok)
        XCTAssertEqual(match("https://old.reddit.com/r/steinsgate/comments/1ig9m0c/steinsgate_pilgrimage/")?.url,
                       "https://www.reddit.com/r/steinsgate/comments/1ig9m0c/steinsgate_pilgrimage/")
        XCTAssertEqual(match("https://redd.it/1ig9m0c")?.service, .reddit)
        XCTAssertEqual(match("https://www.facebook.com/watch/?v=123456")?.url, "https://www.facebook.com/watch/?v=123456")
        XCTAssertEqual(match("https://www.facebook.com/share/p/abc123/")?.service, .facebook)
        XCTAssertEqual(match("https://fb.watch/abc/")?.service, .facebook)
        XCTAssertEqual(match("https://www.facebook.com/someone/posts/987654")?.url, "https://www.facebook.com/someone/posts/987654")
        XCTAssertEqual(match("https://www.threads.com/@amie1128/post/DAbc_1")?.url, "https://www.threads.net/@amie1128/post/DAbc_1")
        XCTAssertEqual(match("https://bsky.app/profile/tapenori.bsky.social/post/3kabc")?.service, .bluesky)
        XCTAssertEqual(match("https://mastodon.social/@Mastodon/116839714185151652")?.service, .mastodon)
        XCTAssertEqual(match("https://fosstodon.org/users/someone/statuses/111222333444")?.service, .mastodon)
        XCTAssertEqual(match("https://www.pinterest.com/pin/123456789/")?.service, .pinterest)
        XCTAssertEqual(match("https://de.pinterest.com/pin/123456789")?.url, "https://www.pinterest.com/pin/123456789/")
        XCTAssertEqual(match("https://pin.it/abcd")?.service, .pinterest)
        XCTAssertEqual(match("https://www.linkedin.com/posts/someone_abc-activity-1")?.service, .linkedin)
        XCTAssertEqual(match("https://www.linkedin.com/feed/update/urn:li:activity:7000000000/")?.service, .linkedin)
        XCTAssertEqual(match("https://lnkd.in/abc")?.service, .linkedin)
        XCTAssertEqual(match("https://www.tumblr.com/someblog/123456789")?.url, "https://www.tumblr.com/someblog/123456789")
        XCTAssertEqual(match("https://someblog.tumblr.com/post/123456789/slug")?.url, "https://www.tumblr.com/someblog/123456789")
    }

    func testRejects() {
        XCTAssertNil(match("https://example.com/watch?v=abc"))
        XCTAssertNil(match("https://example.com/about"))
    }

    func testUnsafeAddressesAreNeverMatched() {
        XCTAssertNil(match("ftp://x.com/jack/status/20"))
        XCTAssertNil(match("https://user:pw@x.com/jack/status/20"))
        XCTAssertNil(match("https://x.com:8443/jack/status/20"))
        XCTAssertNil(match("https://192.168.1.2/@someone/123456"))
        XCTAssertNil(match("https://intranet/@someone/123456"))
        XCTAssertNil(match("https://printer.local/@someone/123456"))
        XCTAssertNil(match("https://www.reddit.com/r/a/comments/xx/"), "ids that are too short")
        XCTAssertNil(match("https://x.com/jack/status/notanumber"))
        XCTAssertNil(match("https://youtu.be/dQw4w9WgXcQ"), "YouTube keeps its own card")
        XCTAssertNil(match("https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8"))
        XCTAssertNil(match("https://bsky.app/profile/someone"))
    }

    func testMastodonDoesNotStealOtherServicesLinks() {
        XCTAssertEqual(match("https://www.threads.net/@someone/post/Dabc")?.service, .threads)
        XCTAssertNil(match("https://www.instagram.com/@someone/123456"))
        XCTAssertNil(match("https://www.tumblr.com/@someone/123456"))
    }

    func testPlanFollowsTheMode() {
        XCTAssertNil(LinkEmbedPlan.plan(for: .off))
        XCTAssertEqual(LinkEmbedPlan.plan(for: .ask), .prompt)
        XCTAssertEqual(LinkEmbedPlan.plan(for: .on), .card)
    }

    @MainActor func testEveryServiceHasItsOwnPreference() {
        XCTAssertEqual(LinkEmbedService.allCases.count, 13)
        XCTAssertEqual(Set(LinkEmbedService.allCases.map { "\($0.modeKey)" }).count, 13)
        XCTAssertEqual(LinkEmbedService.players, [.youtube, .spotify])
        XCTAssertEqual(LinkEmbedService.cards.count, 11)
        XCTAssertEqual(LinkEmbedService.x.descriptionKey, "settings.media.linkEmbeds.desc.x")
    }

    private func flat(_ markdown: String) -> [[String]] {
        LinkEmbedMarkdown.lines(markdown).map { line in line.runs.map { ($0.bold ? "*" : "") + $0.text + ($0.url.map { "<\($0.absoluteString)>" } ?? "") } }
    }

    func testMarkdownBoldLinkSmallAndBreaks() {
        let lines = LinkEmbedMarkdown.lines("**[Jesse (@Jesse)](https://x.com/Jesse)**\nHello \\- world \\(ok\\)\n-# 12 November 2026\n**49K likes**")
        XCTAssertEqual(lines.count, 4)
        XCTAssertEqual(lines[0].runs, [.init(text: "Jesse (@Jesse)", bold: true, url: URL(string: "https://x.com/Jesse"))])
        XCTAssertEqual(lines[1].runs, [.init(text: "Hello - world (ok)")])
        XCTAssertTrue(lines[2].small)
        XCTAssertEqual(lines[2].runs, [.init(text: "12 November 2026")])
        XCTAssertFalse(lines[3].small)
        XCTAssertEqual(lines[3].runs, [.init(text: "49K likes", bold: true)])
    }

    func testMarkdownKeepsBlankLinesInsideAndTrimsTheEnds() {
        XCTAssertEqual(flat("\nA\n\nB\n"), [["A"], [], ["B"]])
    }

    func testMarkdownLinksOnlyWhenHttps() {
        XCTAssertEqual(flat("[a](javascript:alert\\(1\\)) [b](http://example.com) [c](https://example.com/x\\(1\\))"),
                       [["a b ", "c<https://example.com/x(1)>"]])
    }

    func testMarkdownIsLenientWithBrokenSyntax() {
        XCTAssertEqual(flat("**open"), [["**open"]])
        XCTAssertEqual(flat("[no close](https://e.com"), [["[no close](https://e.com"]])
        XCTAssertEqual(flat("a \\ b"), [["a \\ b"]])
        XCTAssertTrue(LinkEmbedMarkdown.lines(String(repeating: "x", count: 100_000)).first!.runs.first!.text.count <= LinkEmbedMarkdown.maxLength)
    }

    func testUnsafeMediaAddressesAreRefused() {
        XCTAssertNotNil(EmbedURL.https("https://pbs.twimg.com/a.jpg"))
        XCTAssertNil(EmbedURL.https("http://pbs.twimg.com/a.jpg"))
        XCTAssertNil(EmbedURL.https("https://127.0.0.1/a.jpg"))
        XCTAssertNil(EmbedURL.https("file:///etc/passwd"))
        XCTAssertEqual(EmbedURL.color(nil, fallback: .red), .red)
    }

    @MainActor
    func testLoaderCachesSuccessesAndMissesButNotFailures() async throws {
        struct Boom: Error {}
        final class Counter: @unchecked Sendable { var calls = 0; var fail = true }
        let counter = Counter()
        let card = LinkEmbedCard(service: "X", url: "https://x.com/a/status/1", accent: 0x1D9BF0,
                                 blocks: [.text(.init(markdown: "**hi**"))])
        let loader = LinkEmbedLoader { url in
            counter.calls += 1
            if url.hasSuffix("/none") { return nil }
            if counter.fail { counter.fail = false; throw Boom() }
            return card
        }
        do { _ = try await loader.card(for: "https://x.com/a/status/1"); XCTFail("should throw") } catch {}
        XCTAssertFalse(loader.isCached("https://x.com/a/status/1"))
        let first = try await loader.card(for: "https://x.com/a/status/1")
        XCTAssertEqual(first, card)
        let again = try await loader.card(for: "https://x.com/a/status/1")
        XCTAssertEqual(again, card)
        XCTAssertEqual(counter.calls, 2)
        let miss = try await loader.card(for: "https://x.com/a/status/none")
        XCTAssertNil(miss)
        _ = try await loader.card(for: "https://x.com/a/status/none")
        XCTAssertEqual(counter.calls, 3)
    }

    @MainActor
    func testLoaderSharesOneRequestForTheSameLink() async throws {
        final class Counter: @unchecked Sendable { var calls = 0 }
        let counter = Counter()
        let loader = LinkEmbedLoader { _ in
            counter.calls += 1
            try await Task.sleep(nanoseconds: 50_000_000)
            return nil
        }
        async let one = loader.card(for: "https://x.com/a/status/2")
        async let two = loader.card(for: "https://x.com/a/status/2")
        _ = try await (one, two)
        XCTAssertEqual(counter.calls, 1)
    }
}