import XCTest
import WizardChatCore
@testable import WizardChat

final class SoundboardTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    func testEventTypesMatchTheWeb() {
        XCTAssertEqual(SoundboardFormat.playType, "io.github.kapsikkum.mudrix.soundboard.play")
        XCTAssertEqual(SoundboardFormat.playTypes.last, "chat.mudrix.soundboard.play")
        XCTAssertEqual(SoundboardFormat.boardType, "io.github.kapsikkum.mudrix.soundboard")
    }

    func testBuiltInClipsHaveUniqueIdsAndBundledFileNames() {
        let ids = SoundboardFormat.builtIn.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count)
        XCTAssertEqual(ids.count, 18)
        XCTAssertEqual(SoundboardFormat.builtIn.first { $0.id == "sad-trombone" }?.resource, "sb_sad_trombone")
    }

    func testBoardKeepsOnlyWellFormedClips() {
        let board = SoundboardFormat.parseBoard(json("""
            {"sounds":[
             {"id":"a","name":"Boom","emoji":"X","url":"mxc://s/a","mimetype":"audio/mp3","durationMs":9000,"size":100,"volume":3},
             {"id":"a","name":"Duplicate","url":"mxc://s/b","mimetype":"audio/mpeg","durationMs":100,"size":1},
             {"id":"b","name":"Flac","url":"mxc://s/c","mimetype":"audio/flac","durationMs":100,"size":1},
             {"id":"c","name":"Web","url":"https://x/y.mp3","mimetype":"audio/mpeg","durationMs":100,"size":1},
             {"id":"d","name":"Wav","url":"mxc://s/d","mimetype":"audio/x-wav; codecs=1","durationMs":500,"size":2}]}
            """))
        XCTAssertEqual(board.map(\.id), ["a", "d"])
        XCTAssertEqual(board[0].mimetype, "audio/mpeg")
        XCTAssertEqual(board[0].durationMs, SoundboardFormat.maxDurationMs)
        XCTAssertEqual(board[0].volume, 1)
        XCTAssertEqual(board[1].mimetype, "audio/wav")
        XCTAssertEqual(SoundboardFormat.parseBoard(nil), [])
    }

    func testPressRoundTripsBuiltInAndCustomClips() throws {
        let builtIn = try XCTUnwrap(SoundboardFormat.builtInClip("airhorn"))
        let press = try XCTUnwrap(SoundboardFormat.parsePress(SoundboardFormat.playContent(builtIn)))
        XCTAssertTrue(press.builtIn)
        XCTAssertEqual(press.id, "airhorn")
        XCTAssertNil(press.url)

        let sound = SoundboardSound(id: "x", name: "Mine", emoji: nil, url: "mxc://s/x", mimetype: "audio/ogg",
                                    durationMs: 1200, size: 10, volume: 0.5)
        let custom = try XCTUnwrap(SoundboardFormat.parsePress(SoundboardFormat.playContent(SoundboardFormat.clip(sound))))
        XCTAssertFalse(custom.builtIn)
        XCTAssertEqual(custom.url, "mxc://s/x")
        XCTAssertEqual(custom.mimetype, "audio/ogg")
        XCTAssertEqual(custom.durationMs, 1200)
        XCTAssertEqual(custom.volume, 0.5)
    }

    func testPressRejectsUnknownBuiltInsAndForeignUrls() {
        XCTAssertNil(SoundboardFormat.parsePress(json(#"{"sound":{"id":"nope","builtin":true}}"#)))
        XCTAssertNil(SoundboardFormat.parsePress(json(#"{"sound":{"id":"a","url":"https://x/y","mimetype":"audio/mpeg"}}"#)))
        XCTAssertNil(SoundboardFormat.parsePress(json(#"{"sound":{"id":"a","url":"mxc://s/a","mimetype":"video/mp4"}}"#)))
        XCTAssertNil(SoundboardFormat.parsePress(json(#"{"other":1}"#)))
        XCTAssertNil(SoundboardFormat.parsePress(nil))
    }

    func testSendingIsLimitedByGapBurstAndCooldown() {
        let limiter = SoundboardLimiter.forSending()
        XCTAssertEqual(limiter.check("@me:s", "a", now: 0), .ok)
        XCTAssertEqual(limiter.check("@me:s", "b", now: 100), .rateLimited)
        XCTAssertEqual(limiter.check("@me:s", "a", now: 500), .cooldown)
        XCTAssertEqual(limiter.check("@me:s", "b", now: 500), .ok)
        XCTAssertEqual(limiter.check("@me:s", "c", now: 1000), .ok)
        XCTAssertEqual(limiter.check("@me:s", "d", now: 1500), .ok)
        XCTAssertEqual(limiter.check("@me:s", "e", now: 2000), .ok)
        // Five in the last ten seconds
        XCTAssertEqual(limiter.check("@me:s", "f", now: 2500), .rateLimited)
        XCTAssertEqual(limiter.check("@me:s", "f", now: 10_500), .ok)
    }

    func testEachSenderHasItsOwnLimits() {
        let limiter = SoundboardLimiter.forReceiving()
        XCTAssertEqual(limiter.check("@a:s", "x", now: 0), .ok)
        XCTAssertEqual(limiter.check("@b:s", "x", now: 10), .ok)
        XCTAssertEqual(limiter.check("@a:s", "y", now: 100), .rateLimited)
    }
}

final class CallTimerTests: XCTestCase {
    func testFormatsMinutesAndHours() {
        XCTAssertEqual(CallTimer.format(0), "0:00")
        XCTAssertEqual(CallTimer.format(9_000), "0:09")
        XCTAssertEqual(CallTimer.format(65_000), "1:05")
        XCTAssertEqual(CallTimer.format(3_599_000), "59:59")
        XCTAssertEqual(CallTimer.format(3_600_000), "1:00:00")
        XCTAssertEqual(CallTimer.format(3_725_000), "1:02:05")
        XCTAssertEqual(CallTimer.format(-5000), "0:00")
    }
}
