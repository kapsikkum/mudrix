import XCTest
import MudrixCore
@testable import Mudrix

/// The pack editor's size meter and split (M15), matching the web's `packSize.ts`
final class PackSizeTests: XCTestCase {
    private func pack(images: Int, name: String = "Pack") -> [String: Any] {
        var all: [String: Any] = [:]
        for index in 0..<images {
            all["emote_\(String(format: "%04d", index))"] = [
                "url": "mxc://example.org/\(String(repeating: "a", count: 24))",
                "body": "emote_\(index)",
                "info": ["mimetype": "image/png", "size": 1234, "w": 64, "h": 64] as [String: Any],
            ] as [String: Any]
        }
        return ["pack": ["display_name": name, "usage": ["emoticon", "sticker"]] as [String: Any], "images": all]
    }

    func testTheLimitsAreTheWebs() {
        XCTAssertEqual(PackSize.eventCapBytes, 65536)
        XCTAssertEqual(PackSize.budgetBytes, 61440)
    }

    func testContentBytesCountUtf8WithoutEscapedSlashes() {
        XCTAssertEqual(PackSize.contentBytes(["a": "b"]), #"{"a":"b"}"#.utf8.count)
        XCTAssertEqual(PackSize.contentBytes(["u": "mxc://x/y"]), #"{"u":"mxc://x/y"}"#.utf8.count)
        XCTAssertEqual(PackSize.contentBytes(["n": "é"]), #"{"n":"é"}"#.utf8.count)
    }

    func testLevelsWarnFromEightyPercentAndRefuseOverTheBudget() {
        XCTAssertEqual(PackSize.level(bytes: 100), .ok)
        XCTAssertEqual(PackSize.level(bytes: PackSize.budgetBytes), .near)
        XCTAssertEqual(PackSize.level(bytes: Int(Double(PackSize.budgetBytes) * 0.8)), .ok)
        XCTAssertEqual(PackSize.level(bytes: PackSize.budgetBytes + 1), .over)
    }

    func testKilobytesFormat() {
        XCTAssertEqual(PackSize.formatKb(1536), "1.5 KB")
        XCTAssertEqual(PackSize.formatKb(20 * 1024), "20 KB")
    }

    func testAPackThatFitsIsNotSplit() {
        let parts = PackSize.split(pack(images: 5))
        XCTAssertEqual(parts.count, 1)
        XCTAssertEqual((parts[0]["images"] as? [String: Any])?.count, 5)
    }

    func testABigPackSplitsIntoPartsThatEachFitAndKeepEveryImage() {
        let big = pack(images: 600)
        XCTAssertEqual(PackSize.level(bytes: PackSize.contentBytes(big)), .over)
        let parts = PackSize.split(big)
        XCTAssertGreaterThan(parts.count, 1)
        var seen = Set<String>()
        for part in parts {
            XCTAssertLessThanOrEqual(PackSize.contentBytes(part), PackSize.budgetBytes)
            XCTAssertEqual((part["pack"] as? [String: Any])?["display_name"] as? String, "Pack")
            seen.formUnion((part["images"] as? [String: Any] ?? [:]).keys)
        }
        XCTAssertEqual(seen.count, 600)
    }

    func testPartsAreNamedAndKeyedInOrder() {
        XCTAssertEqual(PackSize.numberedName("Cats", index: 0, total: 1), "Cats")
        XCTAssertEqual(PackSize.numberedName("Cats", index: 1, total: 3), "Cats (2)")
        XCTAssertEqual(PackSize.partKey("cats", index: 0), "cats")
        XCTAssertEqual(PackSize.partKey("cats", index: 2), "cats_3")
    }

    func testTheServersSizeRefusalIsRecognised() {
        XCTAssertTrue(PackSize.isTooLarge(WizardError(code: "http", message: "x", errcode: "M_TOO_LARGE")))
        XCTAssertTrue(PackSize.isTooLarge(WizardError(code: "http", message: "Event is too large")))
        XCTAssertFalse(PackSize.isTooLarge(WizardError(code: "http", message: "Forbidden", errcode: "M_FORBIDDEN")))
    }

    func testEstimateIsPositiveAndGrowsWithTheShortcode() {
        let short = PackSize.estimateEntryBytes(shortcode: "a", homeserverDomain: "example.org")
        let long = PackSize.estimateEntryBytes(shortcode: String(repeating: "a", count: 40), homeserverDomain: "example.org")
        XCTAssertGreaterThan(short, 50)
        XCTAssertGreaterThan(long, short)
    }
}
