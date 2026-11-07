import XCTest
@testable import WizardChat

final class EmoticonsTests: XCTestCase {
    func testReplacesWholeEmoticons() {
        XCTAssertEqual(Emoticons.replaceInText("hi :)"), "hi 🙂")
        XCTAssertEqual(Emoticons.replaceInText("<3 you!"), "❤️ you!")
        XCTAssertEqual(Emoticons.replaceInText("</3."), "💔.")
        XCTAssertEqual(Emoticons.replaceInText(":) :)"), "🙂 🙂")
    }

    func testLeavesEmoticonsInsideWordsAndLinksAlone() {
        XCTAssertEqual(Emoticons.replaceInText("http://x and a:D"), "http://x and a:D")
    }

    func testSkipsInlineCodeAndFences() {
        XCTAssertEqual(Emoticons.replaceInText("`:)` :)"), "`:)` 🙂")
        XCTAssertEqual(Emoticons.replaceInMessage("```\n:)\n```\n:)"), "```\n:)\n```\n🙂")
    }

    func testNumericDatesFollowTheSetting() {
        XCTAssertEqual(DisplayFormats.numericDate(year: 2026, month: 3, day: 7, .dmy), "07/03/2026")
        XCTAssertEqual(DisplayFormats.numericDate(year: 2026, month: 3, day: 7, .mdy), "03/07/2026")
        XCTAssertEqual(DisplayFormats.numericDate(year: 2026, month: 3, day: 7, .ymd), "2026-03-07")
        XCTAssertNil(DisplayFormats.numericDate(year: 2026, month: 3, day: 7, .long))
    }

    func testOnlyEmojiMessages() {
        XCTAssertTrue(DisplayFormats.isOnlyEmoji("😀"))
        XCTAssertTrue(DisplayFormats.isOnlyEmoji("😀 🎉"))
        XCTAssertFalse(DisplayFormats.isOnlyEmoji("hi 😀"))
        XCTAssertFalse(DisplayFormats.isOnlyEmoji("   "))
        XCTAssertFalse(DisplayFormats.isOnlyEmoji(""))
    }
}
