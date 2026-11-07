import XCTest
import WizardChatCore
@testable import WizardChat

final class SoundPacksTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    func testEveryResourceIsAFileInThePackage() throws {
        let raw = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("packages/sounds/raw")
        let names = Set(try FileManager.default.contentsOfDirectory(atPath: raw.path).map { ($0 as NSString).deletingPathExtension })
        XCTAssertFalse(names.isEmpty)
        for pack in SoundPacks.all {
            for (kind, resource) in pack.files {
                XCTAssertTrue(names.contains(resource), "\(pack.id)/\(kind.id): \(resource)")
            }
        }
    }

    func testFallsBackLikeTheWeb() {
        XCTAssertEqual(SoundPacks.resource("cinny", .mention), "snd_cinny_mention")
        // A pack without a mention sound plays its message sound, without ring the default pack's ring
        XCTAssertEqual(SoundPacks.resource("commet", .mention), "snd_commet_message")
        XCTAssertEqual(SoundPacks.resource("commet", .ring), "snd_megadrive2_ring")
        XCTAssertEqual(SoundPacks.resource("commet", .mute), "mute")
        XCTAssertEqual(SoundPacks.resource("wizardchat", .message), "alert")
        XCTAssertEqual(SoundPacks.resource("gone", .message), "snd_megadrive2_message")
    }

    func testOverridesBeatThePackAndOffSilences() {
        let overrides = ["mention": "glass", "message": SoundPacks.off, "join": "removed"]
        XCTAssertEqual(SoundPacks.resolve(.mention, mainPack: "warm", overrides: overrides), "glass")
        XCTAssertNil(SoundPacks.resolve(.message, mainPack: "warm", overrides: overrides))
        XCTAssertEqual(SoundPacks.resolve(.join, mainPack: "warm", overrides: overrides), "warm")
        XCTAssertEqual(SoundPacks.resolve(.leave, mainPack: "gone", overrides: overrides), "megadrive2")
    }

    func testVolumeFollowsTheSliderOnlyForMessagesAndCalls() {
        XCTAssertEqual(SoundPacks.volume(.message, slider: 30), 0.3, accuracy: 0.001)
        XCTAssertEqual(SoundPacks.volume(.mute, slider: 30), 0.5, accuracy: 0.001)
        XCTAssertEqual(SoundPacks.volume(.ring, slider: 400), 1, accuracy: 0.001)
    }

    func testSyncedOverridesKeepOnlyKnownSounds() {
        let raw = json("""
            {"mention":"glass","camera-on":"off","nope":"glass","join":"","leave":"Bad Name"}
            """)
        let clean = SoundPacks.sanitizeOverrides(raw)
        XCTAssertEqual(clean, ["mention": "glass", "camera-on": "off"])
        XCTAssertEqual(SoundPacks.sanitizeOverrides(SoundPacks.overridesJson(clean ?? [:])), clean)
        XCTAssertNil(SoundPacks.sanitizeOverrides(json("[]")))
    }
}
