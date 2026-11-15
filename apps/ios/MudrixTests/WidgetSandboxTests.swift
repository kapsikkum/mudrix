import XCTest
@testable import Mudrix

/// Which widget pages the in-app viewer will load (I5, read only)
final class WidgetSandboxTests: XCTestCase {
    func testOnlyHttpsPagesWithAHostAreLoaded() {
        XCTAssertTrue(WidgetSandbox.allows(URL(string: "https://widgets.example.org/board?theme=dark")!))
        XCTAssertFalse(WidgetSandbox.allows(URL(string: "http://widgets.example.org/")!))
        XCTAssertFalse(WidgetSandbox.allows(URL(string: "file:///etc/passwd")!))
        XCTAssertFalse(WidgetSandbox.allows(URL(string: "javascript:alert(1)")!))
        XCTAssertFalse(WidgetSandbox.allows(URL(string: "https:///nohost")!))
    }

    func testAddressesWithACredentialAreRefused() {
        XCTAssertFalse(WidgetSandbox.allows(URL(string: "https://user:secret@widgets.example.org/")!))
        XCTAssertFalse(WidgetSandbox.allows(URL(string: "https://user@widgets.example.org/")!))
    }

    func testTheHostIsWhatTheCodeIsFrom() {
        XCTAssertEqual(WidgetSandbox.host(of: URL(string: "https://widgets.example.org/a/b")!), "widgets.example.org")
    }
}
