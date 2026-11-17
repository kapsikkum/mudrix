import XCTest
import MudrixCore
@testable import Mudrix

/// The voice sound picker lists every sound, `moved` included (S4)
final class SoundKindPickerTests: XCTestCase {
    func testMovedCanBePickedAndHasItsName() {
        XCTAssertTrue(SoundKind.pickable.contains(.moved))
        XCTAssertEqual(SoundKind.pickable, SoundKind.allCases)
        XCTAssertEqual(SoundKind.moved.labelKey, "settings.voice.sound.moved")
        XCTAssertEqual(SoundKind.moved.fileName, "moved")
        // It answers something someone else did, so the notification switch does not silence it
        XCTAssertFalse(SoundKind.moved.gated)
    }

    func testEveryMudrixPackHasAMovedSound() {
        for pack in SoundPacks.all where pack.category == "mudrix" {
            XCTAssertEqual(pack.files[.moved], "snd_\(pack.id)_moved")
        }
        // An override for it is kept like the others
        let overrides = ["moved": "glass"]
        XCTAssertEqual(SoundPacks.sanitizeOverrides(.object(["moved": .string("glass")])), overrides)
        XCTAssertEqual(SoundPacks.resolve(.moved, mainPack: "nes", overrides: overrides), "glass")
    }
}
