import XCTest
import MudrixCore
@testable import Mudrix

final class SoundboardTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    func testTopicsMatchTheStandardAndTheOldClients() {
        XCTAssertEqual(SoundboardFormat.topic, "moe.crafty.soundboard")
        XCTAssertEqual(SoundboardFormat.playType, "io.github.kapsikkum.mudrix.soundboard.play")
        XCTAssertEqual(SoundboardFormat.playTypes.last, "chat.mudrix.soundboard.play")
        XCTAssertEqual(SoundboardFormat.emojiKey, "org.wizardchat.emoji")
    }

    func testOldBuiltInClipsHaveUniqueIdsAndBundledFileNames() {
        let ids = SoundboardFormat.builtIn.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count)
        XCTAssertEqual(ids.count, 18)
        XCTAssertEqual(SoundboardFormat.builtIn.first { $0.id == "sad-trombone" }?.resource, "sb_sad_trombone")
    }

    func testStandardPressCarriesOnlyUrlShortcodeAndEmoji() throws {
        let clip = SoundboardFormat.clip(MudrixCore.SoundboardSound(
            shortcode: "applause", url: "mxc://s/a", body: "Applause", emoji: "👏", mimetype: "audio/mpeg",
            size: 10, durationMs: 3400))
        let message = SoundboardFormat.message(clip)
        XCTAssertEqual(message["url"], JSONValue.string("mxc://s/a"))
        XCTAssertEqual(message["shortcode"], JSONValue.string("applause"))
        XCTAssertEqual(message[SoundboardFormat.emojiKey], JSONValue.string("👏"))

        let data = try JSONSerialization.data(withJSONObject: message.mapValues(\.any))
        let play = try XCTUnwrap(SoundboardFormat.parsePlay(data))
        XCTAssertEqual(play.url, "mxc://s/a")
        XCTAssertEqual(play.shortcode, "applause")
        XCTAssertEqual(play.emoji, "👏")
    }

    func testStandardPressIsChecked() {
        XCTAssertNil(SoundboardFormat.parsePlay(Data(#"{"url":"https://x/y","shortcode":"a"}"#.utf8)))
        XCTAssertNil(SoundboardFormat.parsePlay(Data(#"{"shortcode":"a"}"#.utf8)))
        XCTAssertNil(SoundboardFormat.parsePlay(Data("[]".utf8)))
        XCTAssertNil(SoundboardFormat.parsePlay(Data(repeating: 32, count: SoundboardFormat.maxMessageBytes + 1)))
        let long = #"{"url":"mxc://s/a","shortcode":"\#(String(repeating: "x", count: 200))"}"#
        XCTAssertNil(SoundboardFormat.parsePlay(Data(long.utf8))?.shortcode)
        let emoji = #"{"url":"mxc://s/a","org.wizardchat.emoji":"\#(String(repeating: "x", count: 40))"}"#
        XCTAssertNil(SoundboardFormat.parsePlay(Data(emoji.utf8))?.emoji)
    }

    func testOldPressStillPlaysFor26124Clients() throws {
        let ok = #"{"sound":{"id":"a","name":"x","volume":2,"url":"mxc://s/id","mimetype":"audio/x-wav; codecs=1","durationMs":20000}}"#
        let press = try XCTUnwrap(SoundboardFormat.parsePress(json(ok)))
        XCTAssertEqual(press.mimetype, "audio/wav")
        XCTAssertEqual(press.volume, 1)
        XCTAssertEqual(press.durationMs, SoundboardFormat.maxDurationMs)

        XCTAssertNil(SoundboardFormat.parsePress(json(#"{"sound":{"id":"a","url":"https://x/y","mimetype":"audio/mpeg"}}"#)))
        XCTAssertNil(SoundboardFormat.parsePress(json(#"{"sound":{"id":"a","url":"mxc://s/a","mimetype":"video/mp4"}}"#)))
        XCTAssertNil(SoundboardFormat.parsePress(json(#"{"sound":{"id":"nope","builtin":true}}"#)))
        XCTAssertNil(SoundboardFormat.parsePress(nil))

        let builtIn = try XCTUnwrap(SoundboardFormat.parsePress(json(#"{"sound":{"id":"sad-trombone","builtin":true}}"#)))
        XCTAssertTrue(builtIn.builtIn)
        XCTAssertEqual(builtIn.durationMs, 3782)
    }

    func testAPackBecomesClipsWithItsShortcodes() throws {
        let pack = MudrixCore.SoundPack(id: "!room/default", source: .room, roomId: "!room", stateKey: "default",
                             name: "Kitchen", roomName: "Kitchen", everywhere: false, canEdit: true,
                             sounds: [MudrixCore.SoundboardSound(shortcode: "ding", url: "mxc://s/d", body: "Ding")])
        let clips = SoundboardFormat.clips(pack)
        XCTAssertEqual(clips.map(\.id), ["ding"])
        XCTAssertEqual(clips[0].name, "Ding")
        XCTAssertEqual(clips[0].packRoomId, "!room")
        XCTAssertEqual(clips[0].packStateKey, "default")
        XCTAssertFalse(clips[0].builtIn)

        let standard = MudrixCore.SoundPack(id: "builtin", source: .builtIn, everywhere: true, canEdit: false,
                                 sounds: [MudrixCore.SoundboardSound(shortcode: "sad_trombone", url: "mxc://s/s")])
        XCTAssertTrue(SoundboardFormat.clips(standard)[0].builtIn)
        XCTAssertEqual(SoundboardFormat.clips(standard)[0].name, "Sad trombone")
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

    func testFormatsLikeTheWeb() {
        XCTAssertEqual(CallTimer.format(59_999), "0:59")
        XCTAssertEqual(CallTimer.format(12 * 3_600_000 + 3 * 60_000 + 7_000), "12:03:07")
    }
}
