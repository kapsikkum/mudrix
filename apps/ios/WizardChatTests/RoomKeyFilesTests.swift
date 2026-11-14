import XCTest
@testable import WizardChat

final class RoomKeyFilesTests: XCTestCase {
    func testEmptyPassphraseIsRefused() {
        XCTAssertEqual(RoomKeyFiles.exportProblem(passphrase: "", confirm: ""), "settings.roomKeys.passphrase")
    }

    func testMismatchIsRefused() {
        XCTAssertEqual(RoomKeyFiles.exportProblem(passphrase: "a", confirm: "b"), "settings.roomKeys.passphraseMismatch")
    }

    func testMatchingPassphrasePasses() {
        XCTAssertNil(RoomKeyFiles.exportProblem(passphrase: "secret", confirm: "secret"))
    }

    func testImportErrorsMapToTheirNotice() {
        XCTAssertEqual(RoomKeyFiles.importErrorKey("Unsupported version 3"), "settings.roomKeys.error_version")
        XCTAssertEqual(RoomKeyFiles.importErrorKey("invalid rounds"), "settings.roomKeys.error_rounds")
        XCTAssertEqual(RoomKeyFiles.importErrorKey("MAC mismatch"), "settings.roomKeys.error_password")
        XCTAssertEqual(RoomKeyFiles.importErrorKey("bad header"), "settings.roomKeys.error_format")
        XCTAssertNil(RoomKeyFiles.importErrorKey("network down"))
        XCTAssertNil(RoomKeyFiles.importErrorKey(nil))
    }
}
