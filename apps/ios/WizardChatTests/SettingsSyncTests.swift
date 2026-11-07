import XCTest
import WizardChatCore
@testable import WizardChat

final class SettingsSyncTests: XCTestCase {
    private func object(_ fields: [String: JSONValue]) -> JSONValue { .object(fields) }

    func testPickPrefersTheEarlierMudrixName() {
        let contents: [String: JSONValue] = [
            SettingsSync.settingsType: object(["theme": .string("Nord")]),
            SettingsSync.previousSettingsType: object(["theme": .string("Ocean")]),
            SettingsSync.wizardchatSettingsType: object(["theme": .string("Carbon")]),
        ]
        XCTAssertEqual(SettingsSync.pick(contents)?["theme"], .string("Ocean"))
        XCTAssertTrue(SettingsSync.hasMudrixSettings(contents))
    }

    func testPickFallsBackToTheBaseSettings() {
        let contents: [String: JSONValue] = [
            SettingsSync.wizardchatSettingsType: object(["language": .string("de")]),
        ]
        XCTAssertEqual(SettingsSync.pick(contents)?["language"], .string("de"))
        XCTAssertFalse(SettingsSync.hasMudrixSettings(contents))
        XCTAssertNil(SettingsSync.pick([:]))
    }

    func testStableIgnoresKeyOrder() {
        let a: JSONValue = object(["a": .number(1), "b": object(["x": .bool(true), "y": .string("q\"")])])
        let b: JSONValue = object(["b": object(["y": .string("q\""), "x": .bool(true)]), "a": .number(1)])
        XCTAssertEqual(SettingsSync.stable(a), SettingsSync.stable(b))
        XCTAssertNotEqual(SettingsSync.stable(a), SettingsSync.stable(object(["a": .number(2)])))
        XCTAssertEqual(SettingsSync.stable(.number(15)), "15")
    }

    func testMergeWritesOnlyWhatChangedAndKeepsUnknownKeys() {
        let stored = object([
            "theme": .string("Carbon"),
            "futureKey": .string("kept"),
            "preferences": object(["prettifyLinks": .bool(true), "futurePref": .number(7)]),
        ])
        let contents: [String: JSONValue] = [SettingsSync.settingsType: stored]
        let current: [String: JSONValue] = [
            "theme": .string("Carbon"),
            "preferences": object(["prettifyLinks": .bool(true), "autoplayGifs": .bool(true)]),
        ]
        let next: [String: JSONValue] = [
            "theme": .string("Nord"),
            "preferences": object(["prettifyLinks": .bool(true), "autoplayGifs": .bool(false)]),
        ]
        let merged = SettingsSync.mergeForWrite(contents: contents, type: SettingsSync.settingsType, next: next,
                                                current: current, writeAll: false)
        XCTAssertEqual(merged["theme"], .string("Nord"))
        XCTAssertEqual(merged["futureKey"], .string("kept"))
        let prefs = SettingsSync.object(merged["preferences"]) ?? [:]
        XCTAssertEqual(prefs["autoplayGifs"], .bool(false))
        XCTAssertEqual(prefs["futurePref"], .number(7))
        XCTAssertEqual(prefs["prettifyLinks"], .bool(true))
    }

    func testMergeWritesEverythingForAnAccountWithoutMudrixSettings() {
        let next: [String: JSONValue] = [
            "theme": .string("Carbon"),
            "preferences": object(["prettifyLinks": .bool(true)]),
        ]
        let merged = SettingsSync.mergeForWrite(contents: [:], type: SettingsSync.settingsType, next: next,
                                                current: next, writeAll: true)
        XCTAssertEqual(merged["theme"], .string("Carbon"))
        XCTAssertEqual(SettingsSync.object(merged["preferences"])?["prettifyLinks"], .bool(true))
    }

    func testNamespaceNames() {
        XCTAssertEqual(Namespace.mudrixKey("settings"), "io.github.kapsikkum.mudrix.settings")
        XCTAssertEqual(Namespace.legacyMudrixKey("settings"), "chat.mudrix.settings")
        XCTAssertEqual(Namespace.wizardchatKey("settings"), "org.wizardchat.settings")
    }

    func testCustomThemesKeepWellFormedEntriesOnly() {
        let good: JSONValue = object([
            "id": .string("abc123"), "name": .string("  My   theme "),
            "colors": ThemeSpec.starter.json,
        ])
        let badId: JSONValue = object(["id": .string("A"), "name": .string("x"), "colors": ThemeSpec.starter.json])
        let badColor: JSONValue = object([
            "id": .string("def456"), "name": .string("y"),
            "colors": object(["bgPrimary": .string("red")]),
        ])
        let list = CustomThemes.sanitize(.array([good, badId, badColor, good]))
        XCTAssertEqual(list.count, 1)
        XCTAssertEqual(list[0].name, "My theme")
        XCTAssertEqual(list[0].themeName, "custom:abc123")
    }

    func testSharedThemeRoundTrip() {
        let theme = CustomTheme(id: "abc123", name: "Plum \"dark\"", colors: ThemeSpec.starter)
        let text = CustomThemes.serialize(theme)
        let parsed = CustomThemes.parseShared(text)
        XCTAssertEqual(parsed?.name, "Plum \"dark\"")
        XCTAssertEqual(parsed?.colors, ThemeSpec.starter)
        XCTAssertNil(CustomThemes.parseShared("{\"name\": \"x\"}"))
        XCTAssertNil(CustomThemes.parseShared("not json"))
    }
}
