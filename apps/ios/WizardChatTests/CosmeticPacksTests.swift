import XCTest
import WizardChatCore
@testable import WizardChat

final class CosmeticPacksTests: XCTestCase {
    private func json(_ text: String) -> JSONValue {
        (try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))) ?? .null
    }

    private func mxc(_ id: String) -> String { "mxc://example.org/\(id)" }

    private func nameplatePack() -> JSONValue {
        json("""
            {"pack":{"display_name":"Plates","usage":["nameplate"]},
             "images":{"sunset":{"url":"mxc://example.org/sunset","body":"Sunset","info":{"palette":"berry"}},
                       "aurora":{"url":"mxc://example.org/aurora"}}}
            """)
    }

    func testAnEmojiPackHasNoCosmeticItems() {
        let pack = CosmeticPacks.parsePack(roomId: "!r:example.org", stateKey: "p", contents: [
            json("""
                {"pack":{"display_name":"Emoji","usage":["emoticon","sticker"]},
                 "images":{"a":{"url":"mxc://example.org/a"}}}
                """),
        ])
        XCTAssertNil(pack)
    }

    func testItemsTakeTheirUsageFromTheImageElseThePack() throws {
        let pack = try XCTUnwrap(CosmeticPacks.parsePack(roomId: "!r:example.org", stateKey: "p", contents: [
            json("""
                {"pack":{"display_name":"Mixed","usage":["nameplate"]},
                 "images":{"plate":{"url":"mxc://example.org/plate"},
                           "deco":{"url":"mxc://example.org/deco","usage":["avatar_decoration"],"body":"Halo"},
                           "emote":{"url":"mxc://example.org/emote","usage":["emoticon"]}}}
                """),
        ]))
        XCTAssertEqual(pack.displayName, "Mixed")
        let kinds = pack.items.map { "\($0.shortcode):\($0.kind.rawValue)" }.sorted()
        XCTAssertEqual(kinds, ["deco:decoration", "plate:nameplate"])
        XCTAssertEqual(CosmeticPacks.items(of: pack, kind: .decoration).map(\.name), ["Halo"])
    }

    func testNameplatePalettesAndFramePiecesAreKept() throws {
        let pack = try XCTUnwrap(CosmeticPacks.parsePack(roomId: nil, stateKey: "p", contents: [
            json("""
                {"pack":{"display_name":"Frames","usage":["profile_frame"]},
                 "images":{"frame":{"url":"mxc://example.org/frame",
                   "info":{"pieces":[
                     {"pos":"top","url":"mxc://example.org/top","layer":"back"},
                     {"pos":"side","url":"mxc://example.org/side"},
                     {"pos":"bottom","url":"https://example.org/x.png"}]}}}}
                """),
        ]))
        let frame = try XCTUnwrap(pack.items.first)
        XCTAssertEqual(frame.kind, .profileFrame)
        XCTAssertEqual(frame.pieces, [CosmeticFramePiece(url: mxc("top"), pos: "top", layer: "back")])
    }

    func testOnlyMxcImagesBecomeItems() throws {
        let pack = try XCTUnwrap(CosmeticPacks.parsePack(roomId: nil, stateKey: "p", contents: [
            json("""
                {"pack":{"display_name":"Bad","usage":["nameplate"]},
                 "images":{"remote":{"url":"https://example.org/a.png"},"local":{"url":"mxc://example.org/local"}}}
                """),
        ]))
        XCTAssertEqual(pack.items.map(\.shortcode), ["local"])
    }

    func testPacksAreParsedPerStateKeyAndEmptyOnesSkipped() {
        let packs = CosmeticPacks.parsePacks(roomId: "!r:example.org", byStateKey: [
            "plate": [nameplatePack()],
            "empty": [json("""
                {"pack":{"usage":["nameplate"]},"images":{}}
                """)],
        ])
        XCTAssertEqual(packs.count, 1)
        XCTAssertEqual(packs.first?.roomId, "!r:example.org")
        XCTAssertEqual(packs.first?.items.count, 2)
    }

    func testPackUsagesMapOntoTheFourKinds() {
        XCTAssertEqual(CosmeticPacks.kind(of: ["avatar_decoration"]), .decoration)
        XCTAssertEqual(CosmeticPacks.kind(of: ["avatar_frame"]), .decoration)
        XCTAssertEqual(CosmeticPacks.kind(of: ["profile_effect"]), .effect)
        XCTAssertEqual(CosmeticPacks.kind(of: ["nameplate"]), .nameplate)
        XCTAssertEqual(CosmeticPacks.kind(of: ["profile_frame"]), .profileFrame)
        XCTAssertNil(CosmeticPacks.kind(of: ["emoticon", "sticker"]))
        XCTAssertEqual(CosmeticKind.allCases.map(\.rawValue), ["decoration", "effect", "nameplate", "profile_frame"])
    }

    func testTheStoredValueOfAnItemMatchesTheProfileParsers() throws {
        func item(_ kind: CosmeticKind, _ palette: String? = nil, _ pieces: [CosmeticFramePiece] = []) -> CosmeticPackItem {
            CosmeticPackItem(shortcode: "x", name: "X", url: mxc("x"), kind: kind, palette: palette, pieces: pieces)
        }
        XCTAssertEqual(CosmeticPacks.profileValue(of: item(.decoration)), .string(mxc("x")))
        XCTAssertEqual(CosmeticPacks.profileValue(of: item(.nameplate, "berry")),
                       .object(["url": .string(mxc("x")), "palette": .string("berry")]))
        XCTAssertEqual(CosmeticPacks.profileValue(of: item(.nameplate)), .string(mxc("x")))
        let pieces = [CosmeticFramePiece(url: mxc("top"), pos: "top", layer: nil)]
        XCTAssertEqual(CosmeticPacks.profileValue(of: item(.profileFrame, nil, pieces)),
                       .object(["url": .string(mxc("x")),
                                "pieces": .array([.object(["url": .string(mxc("top")), "pos": .string("top")])])]))
        let stored = CosmeticPacks.parseNameplate(
            CosmeticPacks.profileValue(of: item(.nameplate, "berry")))
        XCTAssertEqual(stored, .nameplate(url: mxc("x"), palette: "berry"))
    }

    func testPackCosmeticsAreRecognisedInEveryStoredShape() {
        XCTAssertTrue(CosmeticPacks.isPackCosmetic(.id(mxc("a"))))
        XCTAssertTrue(CosmeticPacks.isPackCosmetic(.nameplate(url: mxc("a"), palette: "sky")))
        XCTAssertTrue(CosmeticPacks.isPackCosmetic(
            .frame(url: "", pieces: [CosmeticFramePiece(url: mxc("a"), pos: "top", layer: nil)])))
        XCTAssertFalse(CosmeticPacks.isPackCosmetic(.id("crown")))
        XCTAssertFalse(CosmeticPacks.isPackCosmetic(.frame(url: "", pieces: [])))
        XCTAssertFalse(CosmeticPacks.isPackCosmetic(nil))
    }

    func testBuiltinCosmeticsStayDrawnWithPacksOff() {
        let plate = CosmeticValue.nameplate(url: mxc("plate"), palette: "berry")
        XCTAssertEqual(CosmeticPacks.resolve(.id("crown"), showPacks: false), .id("crown"))
        XCTAssertEqual(CosmeticPacks.resolve(.id("claude-terminal"), showPacks: false), .id("claude-terminal"))
        XCTAssertNil(CosmeticPacks.resolve(.id(mxc("deco")), showPacks: false))
        XCTAssertNil(CosmeticPacks.resolve(plate, showPacks: false))
        XCTAssertNil(CosmeticPacks.resolve(
            .frame(url: "", pieces: [CosmeticFramePiece(url: mxc("a"), pos: "top", layer: nil)]), showPacks: false))
        XCTAssertNil(CosmeticPacks.resolve(nil, showPacks: false))
        XCTAssertEqual(CosmeticPacks.resolve(.id(mxc("deco")), showPacks: true), .id(mxc("deco")))
        XCTAssertEqual(CosmeticPacks.resolve(plate, showPacks: true), plate)
        XCTAssertEqual(CosmeticPacks.resolve(.id("crown"), showPacks: true), .id("crown"))
    }

    func testProfileValuesAreReadInTheirStringAndObjectForms() {
        XCTAssertEqual(CosmeticPacks.parseDecoration(.string("crown")), .id("crown"))
        XCTAssertEqual(CosmeticPacks.parseDecoration(.string(mxc("d"))), .id(mxc("d")))
        XCTAssertNil(CosmeticPacks.parseDecoration(.string("https://example.org/x.svg")))
        XCTAssertEqual(CosmeticPacks.parseEffect(.string("hearts")), .id("hearts"))
        XCTAssertNil(CosmeticPacks.parseEffect(.string("https://example.org/x.json")))
        XCTAssertEqual(CosmeticPacks.parseNameplate(json(#"{"url":"mxc://example.org/p","palette":"BERRY"}"#)),
                       .nameplate(url: mxc("p"), palette: "berry"))
        XCTAssertEqual(CosmeticPacks.parseNameplate(.string(#"{"url":"mxc://example.org/p","palette":"nope"}"#)),
                       .nameplate(url: mxc("p"), palette: nil))
        XCTAssertNil(CosmeticPacks.parseNameplate(json(#"{"url":"https://example.org/p"}"#)))
        XCTAssertEqual(CosmeticPacks.parseFrame(.string(mxc("f"))), .id(mxc("f")))
        XCTAssertEqual(CosmeticPacks.parseFrame(json("""
            {"url":"mxc://example.org/f","pieces":[{"pos":"bottom","url":"mxc://example.org/b","layer":"front"}]}
            """)),
                       .frame(url: mxc("f"), pieces: [CosmeticFramePiece(url: mxc("b"), pos: "bottom", layer: "front")]))
        XCTAssertNil(CosmeticPacks.parseFrame(json(#"{"pieces":[]}"#)))
    }

    func testSubscriptionsMergeTheStableAndUnstableAccountData() {
        let merged = CosmeticPacks.mergeSubscriptions([
            json(#"{"rooms":{"!a:example.org":{"one":{}}}}"#),
            json(#"{"rooms":{"!a:example.org":{"two":{}},"!b:example.org":{"three":{}}}}"#),
        ])
        XCTAssertEqual(merged.keys.sorted(), ["!a:example.org", "!b:example.org"])
        XCTAssertEqual(merged["!a:example.org"]?.keys.sorted(), ["one", "two"])
        XCTAssertTrue(CosmeticPacks.mergeSubscriptions([.null]).isEmpty)
    }

    func testOnePackCanBeSubscribedAndUnsubscribed() {
        var rooms = CosmeticPacks.withSubscription([:], roomId: "!a:example.org", stateKey: "pack", subscribed: true)
        XCTAssertTrue(CosmeticPacks.isSubscribed(rooms, roomId: "!a:example.org", stateKey: "pack"))
        rooms = CosmeticPacks.withSubscription(rooms, roomId: "!a:example.org", stateKey: "pack", subscribed: false)
        XCTAssertFalse(CosmeticPacks.isSubscribed(rooms, roomId: "!a:example.org", stateKey: "pack"))
        XCTAssertTrue(rooms.isEmpty)
    }

    func testSavingKeepsPacksOfRoomsThisClientCannotRead() {
        let existing = CosmeticPacks.mergeSubscriptions([
            json(#"{"rooms":{"!gone:example.org":{"pack":{}},"!here:example.org":{"old":{},"keep":{}}}}"#),
        ])
        let rooms = CosmeticPacks.subscriptionRooms(existing, [CosmeticPackRef(roomId: "!here:example.org", stateKey: "new")],
                                                     keepRoom: { $0 == "!gone:example.org" })
        XCTAssertEqual(rooms.keys.sorted(), ["!gone:example.org", "!here:example.org"])
        XCTAssertEqual(rooms["!here:example.org"]?.keys.sorted(), ["new"])
        XCTAssertTrue(CosmeticPacks.subscriptionRooms([:], [], keepRoom: { _ in true }).isEmpty)
    }

    func testEverySubscribedPackCanBeListedBack() {
        let rooms = CosmeticPacks.mergeSubscriptions([
            json(#"{"rooms":{"!a:example.org":{"one":{},"two":{}},"!b:example.org":{"three":{}}}}"#),
        ])
        let refs = CosmeticPacks.subscribedRefs(rooms).map { "\($0.roomId)/\($0.stateKey)" }
        XCTAssertEqual(refs.sorted(), ["!a:example.org/one", "!a:example.org/two", "!b:example.org/three"])
    }

    func testAPackEffectCarriesItsOneShotIntro() throws {
        let pack = try XCTUnwrap(CosmeticPacks.parsePack(roomId: nil, stateKey: "p", contents: [
            json("""
                {"pack":{"display_name":"Effects","usage":["profile_effect"]},
                 "images":{"burst":{"url":"mxc://example.org/burst",
                   "info":{"io.github.kapsikkum.mudrix.effect_intro":"mxc://example.org/burst-intro"}},
                   "remote":{"url":"mxc://example.org/remote",
                     "info":{"io.github.kapsikkum.mudrix.effect_intro":"https://example.org/intro.gif"}}}}
                """),
        ]))
        XCTAssertEqual(pack.items.first(where: { $0.shortcode == "burst" })?.intro, mxc("burst-intro"))
        XCTAssertEqual(CosmeticPacks.effectIntro(for: mxc("burst"), in: [pack]), mxc("burst-intro"))
        XCTAssertNil(CosmeticPacks.effectIntro(for: mxc("remote"), in: [pack]))
        XCTAssertNil(CosmeticPacks.effectIntro(for: mxc("none"), in: [pack]))
    }

    func testABareMediaNameplateFindsItsPaletteAmongLoadedPacks() throws {
        let pack = try XCTUnwrap(CosmeticPacks.parsePack(roomId: nil, stateKey: "p", contents: [nameplatePack()]))
        XCTAssertEqual(CosmeticPacks.nameplatePalette(for: mxc("sunset"), in: [pack]), "berry")
        XCTAssertNil(CosmeticPacks.nameplatePalette(for: mxc("aurora"), in: [pack]))
        XCTAssertNil(CosmeticPacks.nameplatePalette(for: mxc("unknown"), in: [pack]))
    }
}
