import XCTest
@testable import WizardChat

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
