import XCTest
import MudrixCore
@testable import Mudrix

/// Pooled, retryable, resumable pack uploads (M15), matching the web's `packUpload.ts`
final class PackUploadTests: XCTestCase {
    private func image(_ name: String) -> UploadedPackImage {
        UploadedPackImage(url: "mxc://s/\(name)", mimetype: "image/png", size: 10, width: 4, height: 4)
    }

    private final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var counts: [Int: Int] = [:]

        func hit(_ index: Int) {
            lock.lock()
            counts[index, default: 0] += 1
            lock.unlock()
        }

        func count(_ index: Int) -> Int {
            lock.lock()
            defer { lock.unlock() }
            return counts[index, default: 0]
        }
    }

    func testShortcodesFromFileNames() {
        XCTAssertEqual(PackUpload.shortcode(fromFile: "My Cool.Pic.png"), "my_cool_pic")
        XCTAssertEqual(PackUpload.shortcode(fromFile: "__A--b__.gif"), "a--b")
        XCTAssertEqual(PackUpload.shortcode(fromFile: "\u{1F600}.png"), "image")
        XCTAssertEqual(PackUpload.shortcode(fromFile: "???", fallback: "x"), "x")
    }

    func testTakenShortcodesGetANumber() {
        XCTAssertEqual(PackUpload.uniqueShortcode("cat", taken: []), "cat")
        XCTAssertEqual(PackUpload.uniqueShortcode("cat", taken: ["cat"]), "cat_2")
        XCTAssertEqual(PackUpload.uniqueShortcode("cat", taken: ["cat", "cat_2"]), "cat_3")
    }

    func testRetryDelaysDoubleAndAreCapped() {
        XCTAssertEqual(PackUpload.retryDelayMs(attempt: 0), 1000)
        XCTAssertEqual(PackUpload.retryDelayMs(attempt: 1), 2000)
        XCTAssertEqual(PackUpload.retryDelayMs(attempt: 8), 30_000)
    }

    func testARateLimitIsRetriedButOtherErrorsAreNot() async throws {
        let tries = Counter()
        let value = try await PackUpload.withRateLimitRetry(sleep: { _ in }) {
            tries.hit(0)
            if tries.count(0) < 3 { throw WizardError(code: "http", message: "slow down", errcode: "M_LIMIT_EXCEEDED") }
            return 7
        }
        XCTAssertEqual(value, 7)
        XCTAssertEqual(tries.count(0), 3)

        let other = Counter()
        do {
            _ = try await PackUpload.withRateLimitRetry(sleep: { _ in }) { () -> Int in
                other.hit(0)
                throw WizardError(code: "http", message: "no", errcode: "M_FORBIDDEN")
            }
            XCTFail("should have thrown")
        } catch {
            XCTAssertEqual(other.count(0), 1)
        }
    }

    func testEveryFileIsUploadedAndAFailureDoesNotStopTheRest() async {
        let ledger = PackUploadLedger()
        let result = await PackUpload.run(keys: ["a", "b", "c", "d"], ledger: ledger, concurrency: 2, upload: { index in
            if index == 1 { throw WizardError(code: "http", message: "boom") }
            return self.image("f\(index)")
        }, onProgress: { _, _, _ in })
        XCTAssertEqual(result.uploaded.compactMap { $0 }.count, 3)
        XCTAssertNil(result.uploaded[1])
        XCTAssertEqual(result.errors[1], "boom")
        XCTAssertEqual(result.failedCount, 1)
        XCTAssertFalse(result.cancelled)
        let kept = await ledger.count
        XCTAssertEqual(kept, 3)
    }

    func testRetryUploadsOnlyWhatIsMissing() async {
        let ledger = PackUploadLedger()
        let counter = Counter()
        let flaky: @Sendable (Int) async throws -> UploadedPackImage = { index in
            counter.hit(index)
            if index == 1 && counter.count(1) == 1 { throw WizardError(code: "http", message: "boom") }
            return self.image("f\(index)")
        }
        let first = await PackUpload.run(keys: ["a", "b", "c"], ledger: ledger, upload: flaky, onProgress: { _, _, _ in })
        XCTAssertEqual(first.failedCount, 1)
        let second = await PackUpload.run(keys: ["a", "b", "c"], ledger: ledger, upload: flaky, onProgress: { _, _, _ in })
        XCTAssertEqual(second.failedCount, 0)
        XCTAssertEqual(second.uploaded.compactMap { $0 }.count, 3)
        XCTAssertEqual(counter.count(0), 1)
        XCTAssertEqual(counter.count(2), 1)
        XCTAssertEqual(counter.count(1), 2)
    }

    func testAnEntryCarriesTheUploadInfo() {
        let entry = image("x").entry(shortcode: "cat")
        XCTAssertEqual(entry["url"] as? String, "mxc://s/x")
        XCTAssertEqual(entry["body"] as? String, "cat")
        let info = entry["info"] as? [String: Any]
        XCTAssertEqual(info?["w"] as? Int, 4)
        XCTAssertEqual(info?["mimetype"] as? String, "image/png")
    }
}
