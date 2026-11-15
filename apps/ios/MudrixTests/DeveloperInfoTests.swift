import XCTest
import MudrixCore
@testable import Mudrix

/// The text "Copy debug info" puts on the clipboard (K5)
final class DeveloperInfoTests: XCTestCase {
    private var snapshot: DeveloperInfo.Snapshot {
        DeveloperInfo.Snapshot(userId: "@alice:example.org", deviceId: "DEVICE",
                               homeserver: "https://example.org", version: "1.2.3 (45)",
                               syncState: "running", joined: 12, invited: 2,
                               encryption: EncryptionStatus(recovery: "enabled", deviceVerified: true,
                                                            backupEnabled: true, crossSigningComplete: true),
                               features: ServerFeatures(versions: ["v1.11", "v1.12"],
                                                        unstableFeatures: ["org.matrix.msc4380"]))
    }

    func testEverythingKnownIsListed() {
        let text = DeveloperInfo.text(snapshot)
        XCTAssertTrue(text.contains("User ID: @alice:example.org"))
        XCTAssertTrue(text.contains("Device ID: DEVICE"))
        XCTAssertTrue(text.contains("Homeserver: https://example.org"))
        XCTAssertTrue(text.contains("App version: 1.2.3 (45)"))
        XCTAssertTrue(text.contains("Sync state: running"))
        XCTAssertTrue(text.contains("Rooms: 12 joined, 2 invited"))
        XCTAssertTrue(text.contains("Cross-signing: true"))
        XCTAssertTrue(text.contains("Recovery: enabled"))
        XCTAssertTrue(text.contains("Key backup: true"))
        XCTAssertTrue(text.contains("Device verified: true"))
        XCTAssertTrue(text.contains("Spec versions: v1.11, v1.12"))
        XCTAssertTrue(text.contains("Server features: org.matrix.msc4380"))
    }

    func testMissingPartsAreLeftOutOrDashed() {
        let text = DeveloperInfo.text(DeveloperInfo.Snapshot(
            userId: nil, deviceId: nil, homeserver: nil, version: "?", syncState: "idle",
            joined: 0, invited: 0, encryption: nil, features: nil))
        XCTAssertTrue(text.contains("User ID: -"))
        XCTAssertTrue(text.contains("Device ID: -"))
        XCTAssertTrue(text.contains("Homeserver: -"))
        XCTAssertFalse(text.contains("Cross-signing"))
        XCTAssertFalse(text.contains("Spec versions"))
        XCTAssertFalse(text.contains("\n\n"))
    }
}
