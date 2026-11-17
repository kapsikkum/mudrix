import XCTest
import MudrixCore
@testable import Mudrix

/// Mirrors Android's `matrix/ComposerUploadsTest.kt`
final class ComposerUploadsTests: XCTestCase {
    private let uploads = ComposerUploads()
    private let one = UUID()
    private let two = UUID()

    func testStartsInFlight() {
        let token = uploads.start(one)
        XCTAssertEqual(uploads.state(one), UploadState(status: .uploading, progress: 0))
        XCTAssertEqual(uploads.plan(one), .wait)
        XCTAssertTrue(uploads.isCurrent(one, token: token))
        XCTAssertNil(uploads.state(two))
        XCTAssertEqual(uploads.plan(two), .upload)
    }

    func testProgressIsRecordedAndClamped() {
        let token = uploads.start(one)
        uploads.progress(one, token: token, fraction: 0.4)
        XCTAssertEqual(uploads.state(one), UploadState(status: .uploading, progress: 0.4))
        uploads.progress(one, token: token, fraction: 2)
        XCTAssertEqual(uploads.state(one)?.progress, 1.0)
        uploads.progress(one, token: token, fraction: -1)
        XCTAssertEqual(uploads.state(one)?.progress, 0.0)
    }

    func testFinishingLetsTheSendReuseIt() {
        let token = uploads.start(one)
        uploads.progress(one, token: token, fraction: 0.7)
        uploads.finish(one, token: token)
        XCTAssertEqual(uploads.state(one), UploadState(status: .done, progress: 1))
        XCTAssertEqual(uploads.plan(one), .reuse)
    }

    func testFailureIsUploadedAtSendOrRetried() throws {
        let token = uploads.start(one)
        uploads.fail(one, token: token)
        XCTAssertEqual(uploads.state(one), UploadState(status: .failed, progress: 0))
        XCTAssertEqual(uploads.plan(one), .upload)

        let again = try XCTUnwrap(uploads.retry(one))
        XCTAssertEqual(uploads.state(one), UploadState(status: .uploading, progress: 0))
        XCTAssertEqual(uploads.plan(one), .wait)
        XCTAssertTrue(uploads.isCurrent(one, token: again))
        XCTAssertFalse(uploads.isCurrent(one, token: token))
    }

    func testRetryOnlyAfterAFailure() {
        let token = uploads.start(one)
        XCTAssertNil(uploads.retry(one))
        uploads.finish(one, token: token)
        XCTAssertNil(uploads.retry(one))
        XCTAssertNil(uploads.retry(two))
    }

    func testLateResultsOfAnOlderAttemptAreIgnored() throws {
        let first = uploads.start(one)
        uploads.fail(one, token: first)
        _ = try XCTUnwrap(uploads.retry(one))
        uploads.progress(one, token: first, fraction: 0.9)
        uploads.finish(one, token: first)
        uploads.fail(one, token: first)
        XCTAssertEqual(uploads.state(one), UploadState(status: .uploading, progress: 0))
        XCTAssertEqual(uploads.plan(one), .wait)
    }

    func testRemovingWhileInFlightDropsTheUpload() {
        let token = uploads.start(one)
        uploads.progress(one, token: token, fraction: 0.5)
        uploads.forget(one)
        XCTAssertNil(uploads.state(one))
        XCTAssertFalse(uploads.isCurrent(one, token: token))
        XCTAssertEqual(uploads.plan(one), .upload)
        uploads.finish(one, token: token)
        XCTAssertNil(uploads.state(one))
        XCTAssertNil(uploads.snapshot()[one])
    }

    func testSendingWhileInFlightWaitsAndThenReuses() {
        let token = uploads.start(one)
        uploads.progress(one, token: token, fraction: 0.25)
        XCTAssertEqual(uploads.plan(one), .wait)
        uploads.finish(one, token: token)
        XCTAssertEqual(uploads.plan(one), .reuse)
    }

    func testSeveralAttachmentsAreTrackedApart() {
        let first = uploads.start(one)
        let second = uploads.start(two)
        uploads.finish(one, token: first)
        uploads.progress(two, token: second, fraction: 0.5)
        XCTAssertEqual(uploads.plan(one), .reuse)
        XCTAssertEqual(uploads.plan(two), .wait)
        XCTAssertEqual(uploads.snapshot().count, 2)
    }

    func testPreuploadRulesMatchTheWeb() {
        let limit: Int64 = 100
        // An untouched video or photo goes up as soon as it is added
        XCTAssertTrue(ComposerUploads.canPreupload(size: 50, maxUploadBytes: limit, hasVideoTarget: false,
                                                  imageWillProcess: false))
        // A video to re-encode or a photo to clean must upload what comes out, at send time
        XCTAssertFalse(ComposerUploads.canPreupload(size: 50, maxUploadBytes: limit, hasVideoTarget: true,
                                                   imageWillProcess: false))
        XCTAssertFalse(ComposerUploads.canPreupload(size: 50, maxUploadBytes: limit, hasVideoTarget: false,
                                                   imageWillProcess: true))
        // Something the server would refuse is never uploaded in the background
        XCTAssertFalse(ComposerUploads.canPreupload(size: 150, maxUploadBytes: limit, hasVideoTarget: false,
                                                   imageWillProcess: false))
        // Exactly at the limit is fine, like the web's `size > maxUploadBytes`
        XCTAssertTrue(ComposerUploads.canPreupload(size: limit, maxUploadBytes: limit, hasVideoTarget: false,
                                                  imageWillProcess: false))
    }

    func testOnlyJpegAndPngPhotosAreEverProcessed() {
        let options = ImagePrep.Options(stripMetadata: true, maxSide: nil)
        XCTAssertTrue(ComposerUploads.imageWillProcess(mimetype: "image/jpeg", options: options))
        XCTAssertTrue(ComposerUploads.imageWillProcess(mimetype: "image/png", options: options))
        XCTAssertFalse(ComposerUploads.imageWillProcess(mimetype: "image/gif", options: options))
        XCTAssertFalse(ComposerUploads.imageWillProcess(mimetype: "image/jpeg", options: nil))
        XCTAssertFalse(ComposerUploads.imageWillProcess(
            mimetype: "image/jpeg", options: ImagePrep.Options(stripMetadata: false, maxSide: nil)))
    }
}
