import XCTest
import MudrixCore
@testable import Mudrix

/// Editing sound packs and who may play in them, matching the core's pack API
final class SoundboardEditTests: XCTestCase {
    private func sound(_ id: String, name: String = "Clip") -> Mudrix.SoundboardSound {
        Mudrix.SoundboardSound(id: id, name: name, emoji: nil, url: "mxc://s/\(id)", mimetype: "audio/mpeg", durationMs: 1000,
                        size: 100, volume: 1)
    }

    func testMimetypeFromTheTypeOrTheFileName() {
        XCTAssertEqual(SoundboardEdit.mimetype(contentType: "audio/mp3", fileName: nil), "audio/mpeg")
        XCTAssertEqual(SoundboardEdit.mimetype(contentType: nil, fileName: "boom.OGG"), "audio/ogg")
        XCTAssertEqual(SoundboardEdit.mimetype(contentType: "application/octet-stream", fileName: "a.wav"), "audio/wav")
        XCTAssertNil(SoundboardEdit.mimetype(contentType: "audio/flac", fileName: "a.flac"))
        XCTAssertNil(SoundboardEdit.mimetype(contentType: nil, fileName: nil))
    }

    func testFileChecksFollowTheCoresLimits() {
        XCTAssertNil(SoundboardEdit.check(mimetype: "audio/mpeg", size: 1000, durationMs: 2000))
        XCTAssertEqual(SoundboardEdit.check(mimetype: nil, size: 1000, durationMs: 2000), .type)
        XCTAssertEqual(SoundboardEdit.check(mimetype: "audio/mpeg", size: 0, durationMs: 2000), .size)
        XCTAssertEqual(SoundboardEdit.check(mimetype: "audio/mpeg", size: SoundboardFormat.maxSizeBytes + 1, durationMs: 2000), .size)
        XCTAssertEqual(SoundboardEdit.check(mimetype: "audio/mpeg", size: 1000, durationMs: 0), .decode)
        XCTAssertEqual(SoundboardEdit.check(mimetype: "audio/mpeg", size: 1000, durationMs: SoundboardFormat.maxDurationMs + 1), .duration)
    }

    func testNamesAndEmojiAreCleaned() {
        XCTAssertEqual(SoundboardEdit.cleanName("  big   boom \n"), "big boom")
        XCTAssertEqual(SoundboardEdit.cleanName(String(repeating: "a", count: 80)).count, SoundboardFormat.maxNameLength)
        XCTAssertNil(SoundboardEdit.cleanEmoji("  "))
        XCTAssertEqual(SoundboardEdit.cleanEmoji(" X "), "X")
    }

    func testShortcodesLookLikeTheStandardsAndDiffer() {
        let first = SoundboardEdit.newId()
        XCTAssertTrue(first.hasPrefix("c_"))
        XCTAssertEqual(first.count, 18)
        XCTAssertNotEqual(first, SoundboardEdit.newId())
        XCTAssertLessThanOrEqual(first.utf8.count, SoundboardFormat.maxShortcodeBytes)
    }

    func testBoardChanges() throws {
        let board = [sound("a"), sound("b")]
        XCTAssertEqual(try SoundboardEdit.added(board, sound("c")).map(\.id), ["a", "b", "c"])
        XCTAssertEqual(SoundboardEdit.removed(board, id: "a").map(\.id), ["b"])
        XCTAssertEqual(SoundboardEdit.replaced(board, sound("b", name: "New")).map(\.name), ["Clip", "New"])
    }

    func testAFullBoardRefusesAnotherClip() {
        let full = (0..<SoundboardFormat.maxSounds).map { sound("s\($0)") }
        XCTAssertThrowsError(try SoundboardEdit.added(full, sound("extra"))) { error in
            XCTAssertEqual((error as? SoundboardEdit.Failure)?.problem, .limit)
        }
    }

    func testCoreSoundsReadBackTheSame() {
        let board = [sound("a", name: "Boom"), Mudrix.SoundboardSound(id: "b", name: "Pop", emoji: "X", url: "mxc://s/b",
                                                               mimetype: "audio/wav", durationMs: 300, size: 50, volume: 1)]
        let core = board.map(SoundboardFormat.coreSound)
        XCTAssertEqual(core.map(\.shortcode), ["a", "b"])
        XCTAssertEqual(core.map(SoundboardFormat.sound), board)
    }

    func testSettingsContent() {
        XCTAssertEqual(SoundboardEdit.settingsContent(enabled: false, minPowerLevel: 50),
                       .object(["enabled": .bool(false), "minPowerLevel": .number(50)]))
    }

    func testErrorKeysAreTheSharedOnes() {
        XCTAssertEqual(SoundboardEdit.Problem.forbidden.key, "soundboard.error.forbidden")
        XCTAssertEqual(SoundboardEdit.Problem.limit.key, "soundboard.error.limit")
    }
}

/// The room and space rules over who may play
final class RoomSoundboardsRuleTests: XCTestCase {
    private func settings(_ enabled: Bool, _ level: Double) -> RoomSoundboards.Settings {
        RoomSoundboards.Settings(enabled: enabled, minPowerLevel: level)
    }

    func testSettingsNeedAFlagOrALevelAndIgnoreStrings() {
        XCTAssertNil(RoomSoundboards.sanitizeSettings(nil))
        XCTAssertNil(RoomSoundboards.sanitizeSettings([:]))
        XCTAssertNil(RoomSoundboards.sanitizeSettings(["enabled": .string("false")]))
        XCTAssertEqual(RoomSoundboards.sanitizeSettings(["enabled": .bool(false)]), settings(false, 0))
        XCTAssertEqual(RoomSoundboards.sanitizeSettings(["minPowerLevel": .number(50)]), settings(true, 50))
    }

    func testNothingSetMeansEveryonePlays() {
        XCTAssertEqual(RoomSoundboards.verdict([RoomSoundboards.Rules(settings: nil, level: 0)]), .ok)
        XCTAssertEqual(RoomSoundboards.verdict([]), .ok)
    }

    func testASpaceCanSwitchTheBoardOffForItsRooms() {
        let space = RoomSoundboards.Rules(settings: settings(false, 0), level: 100)
        let room = RoomSoundboards.Rules(settings: nil, level: 100)
        XCTAssertEqual(RoomSoundboards.verdict([space, room]), .roomDisabled)
    }

    func testTheHighestLevelAmongThemApplies() {
        let space = RoomSoundboards.Rules(settings: settings(true, 50), level: 0)
        let room = RoomSoundboards.Rules(settings: settings(true, 0), level: 0)
        XCTAssertEqual(RoomSoundboards.verdict([space, room]), .forbidden)
        let mod = RoomSoundboards.Rules(settings: settings(true, 50), level: 50)
        XCTAssertEqual(RoomSoundboards.verdict([mod, room]), .ok)
    }

    func testAnUnknownLevelFallsBackToTheCallRoomsLevel() {
        let space = RoomSoundboards.Rules(settings: settings(true, 50), level: nil)
        let room = RoomSoundboards.Rules(settings: nil, level: 100)
        XCTAssertEqual(RoomSoundboards.verdict([space, room]), .ok)
        let lowRoom = RoomSoundboards.Rules(settings: nil, level: 0)
        XCTAssertEqual(RoomSoundboards.verdict([space, lowRoom]), .forbidden)
    }
}
