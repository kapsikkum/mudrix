import Foundation
import XCTest
@testable import Mudrix

/// "Check for updates" in Settings > About (K12): the newest GitHub release against this build
final class AppUpdatesTests: XCTestCase {
    func testTagsLoseTheirPrefix() {
        XCTAssertEqual(AppUpdates.tidy("v26.12.2"), "26.12.2")
        XCTAssertEqual(AppUpdates.tidy("V26.12.2"), "26.12.2")
        XCTAssertEqual(AppUpdates.tidy(" 26.12.2 "), "26.12.2")
        XCTAssertEqual(AppUpdates.tidy("26.12.2-next.1"), "26.12.2-next.1")
        XCTAssertEqual(AppUpdates.tidy("v"), "")
    }

    func testAnyDifferentVersionCountsAsNewer() {
        XCTAssertFalse(AppUpdates.isNewer(current: "26.12.2", latest: "v26.12.2"))
        XCTAssertTrue(AppUpdates.isNewer(current: "26.12.2", latest: "v26.12.3"))
        XCTAssertTrue(AppUpdates.isNewer(current: "26.12.2", latest: "26.11.0"))
        XCTAssertFalse(AppUpdates.isNewer(current: "26.12.2", latest: "26.12.2"))
    }

    func testTheReleaseVersionIsItsTag() {
        let release = Data(#"{"tag_name":"v26.12.2","name":"Mudrix 26.12.2"}"#.utf8)
        XCTAssertEqual(AppUpdates.latestVersion(fromRelease: release), "26.12.2")
        // A release without a tag falls back to its name
        XCTAssertEqual(AppUpdates.latestVersion(fromRelease: Data(#"{"name":"26.12.0"}"#.utf8)), "26.12.0")
        XCTAssertNil(AppUpdates.latestVersion(fromRelease: Data(#"{"tag_name":"","name":""}"#.utf8)))
        XCTAssertNil(AppUpdates.latestVersion(fromRelease: Data(#"{"message":"Not Found"}"#.utf8)))
        XCTAssertNil(AppUpdates.latestVersion(fromRelease: Data("not json".utf8)))
        XCTAssertNil(AppUpdates.latestVersion(fromRelease: Data()))
    }

    func testTheRunningVersionIsNotEmpty() {
        XCTAssertFalse(AppUpdates.currentVersion().isEmpty)
    }

    func testAVersionlessBundleReadsAsZero() {
        XCTAssertEqual(AppUpdates.version(from: nil), "0.0.0")
        XCTAssertEqual(AppUpdates.version(from: ["CFBundleShortVersionString": ""]), "0.0.0")
        XCTAssertEqual(AppUpdates.version(from: ["CFBundleShortVersionString": "26.12.2"]), "26.12.2")
    }

    func testTheReleasesPageIsTheUpdateLink() {
        XCTAssertEqual(AppUpdates.releasesUrl.absoluteString,
                       "https://github.com/kapsikkum/mudrix/releases/latest")
        XCTAssertEqual(AppUpdates.latestReleaseApiUrl.absoluteString,
                       "https://api.github.com/repos/kapsikkum/mudrix/releases/latest")
    }
}
