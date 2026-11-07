import XCTest
@testable import WizardChat

/// The expected colours were computed with the web's `buildThemeColors` (apps/web/src/theme/themeTokens.ts)
/// run in node on the same nine-colour specs, so the two derivations must agree to the digit.
final class ThemeDeriveTests: XCTestCase {
    private func spec(_ c: [String]) -> ThemeSpec {
        ThemeSpec(bgPrimary: c[0], bgSecondary: c[1], bgTertiary: c[2], accent: c[3], textPrimary: c[4],
                  textMuted: c[5], border: c[6], msgMineBg: c[7], msgOtherBg: c[8])
    }

    private func check(_ colors: [String], light: Bool, mention: String, _ expected: DerivedColors,
                       file: StaticString = #filePath, line: UInt = #line) {
        let input = spec(colors)
        XCTAssertEqual(ThemeDerive.isLightColor(input.bgPrimary), light, file: file, line: line)
        XCTAssertEqual(ThemeDerive.derive(input, mentionHex: mention), expected, file: file, line: line)
    }

    func testDarkSpec() {
        check(["#1a1b1e","#131416","#232428","#5865f2","#dbdee1","#949ba4","#2b2d31","#2e3036","#131416"], light: false, mention: "#f06428", DerivedColors(
            bgApp: "#1a1b1e",
            bgSurface: "#131416",
            bgRaised: "#232428",
            bgInput: "#0c0d0e",
            bgHover: "#ffffff0f",
            bgActive: "#5865f233",
            bgOverlay: "#000000a6",
            textPrimary: "#dbdee1",
            textSecondary: "#b8bdc3",
            textMuted: "#949ba4",
            textDisabled: "#696e75",
            textOnAccent: "#ffffff",
            textLink: "#4ea8ff",
            accentDefault: "#5865f2",
            accentHover: "#4853c6",
            accentSoft: "#5865f226",
            accentGlow1: "#5865f20d",
            accentGlow2: "#5865f208",
            borderDefault: "#2b2d31",
            borderStrong: "#45494e",
            borderFocus: "#929bf7",
            messageMine: "#2e3036",
            messageOther: "#131416",
            messageHighlight: "#f0642826"))
    }

    func testLightSpec() {
        check(["#f4efe6","#e9e2d3","#fffaf0","#c2410c","#2b2118","#7c6f5f","#d6ccb8","#fde7d3","#ece4d4"], light: true, mention: "#f06428", DerivedColors(
            bgApp: "#f4efe6",
            bgSurface: "#e9e2d3",
            bgRaised: "#fffaf0",
            bgInput: "#e0d9cb",
            bgHover: "#06060710",
            bgActive: "#c2410c24",
            bgOverlay: "#2b211866",
            textPrimary: "#2b2118",
            textSecondary: "#54483c",
            textMuted: "#7c6f5f",
            textDisabled: "#a69c8e",
            textOnAccent: "#ffffff",
            textLink: "#1f6fd1",
            accentDefault: "#c2410c",
            accentHover: "#9f350a",
            accentSoft: "#c2410c1f",
            accentGlow1: "#c2410c0d",
            accentGlow2: "#c2410c08",
            borderDefault: "#d6ccb8",
            borderStrong: "#c0b5a2",
            borderFocus: "#9f350a",
            messageMine: "#fde7d3",
            messageOther: "#ece4d4",
            messageHighlight: "#f064281f"))
    }

    func testSaturatedSpec() {
        check(["#0f7a3b","#0a5d2c","#13914a","#ff6b9d","#f2fff6","#a8d8b9","#1d9c52","#1fb25f","#0d6b33"], light: false, mention: "#f06428", DerivedColors(
            bgApp: "#0f7a3b",
            bgSurface: "#0a5d2c",
            bgRaised: "#13914a",
            bgInput: "#073c1d",
            bgHover: "#ffffff0f",
            bgActive: "#ff6b9d33",
            bgOverlay: "#000000a6",
            textPrimary: "#f2fff6",
            textSecondary: "#cdecd8",
            textMuted: "#a8d8b9",
            textDisabled: "#72b78d",
            textOnAccent: "#ffffff",
            textLink: "#4ea8ff",
            accentDefault: "#ff6b9d",
            accentHover: "#d15881",
            accentSoft: "#ff6b9d26",
            accentGlow1: "#ff6b9d0d",
            accentGlow2: "#ff6b9d08",
            borderDefault: "#1d9c52",
            borderStrong: "#40ab6c",
            borderFocus: "#ff9fbf",
            messageMine: "#1fb25f",
            messageOther: "#0d6b33",
            messageHighlight: "#f0642826"))
    }

    func testBlackSpec() {
        check(["#000000","#050505","#121212","#ffffff","#ffffff","#808080","#222222","#101010","#080808"], light: false, mention: "#f06428", DerivedColors(
            bgApp: "#000000",
            bgSurface: "#050505",
            bgRaised: "#121212",
            bgInput: "#030303",
            bgHover: "#ffffff0f",
            bgActive: "#ffffff33",
            bgOverlay: "#000000a6",
            textPrimary: "#ffffff",
            textSecondary: "#c0c0c0",
            textMuted: "#808080",
            textDisabled: "#535353",
            textOnAccent: "#ffffff",
            textLink: "#4ea8ff",
            accentDefault: "#ffffff",
            accentHover: "#d1d1d1",
            accentSoft: "#ffffff26",
            accentGlow1: "#ffffff0d",
            accentGlow2: "#ffffff08",
            borderDefault: "#222222",
            borderStrong: "#3a3a3a",
            borderFocus: "#ffffff",
            messageMine: "#101010",
            messageOther: "#080808",
            messageHighlight: "#f0642826"))
    }

    func testWhiteSpec() {
        check(["#ffffff","#f5f5f5","#eeeeee","#0066ff","#000000","#777777","#dddddd","#e6f0ff","#f0f0f0"], light: true, mention: "#f06428", DerivedColors(
            bgApp: "#ffffff",
            bgSurface: "#f5f5f5",
            bgRaised: "#eeeeee",
            bgInput: "#ebebeb",
            bgHover: "#06060710",
            bgActive: "#0066ff24",
            bgOverlay: "#00000066",
            textPrimary: "#000000",
            textSecondary: "#3c3c3c",
            textMuted: "#777777",
            textDisabled: "#a7a7a7",
            textOnAccent: "#ffffff",
            textLink: "#1f6fd1",
            accentDefault: "#0066ff",
            accentHover: "#0054d1",
            accentSoft: "#0066ff1f",
            accentGlow1: "#0066ff0d",
            accentGlow2: "#0066ff08",
            borderDefault: "#dddddd",
            borderStrong: "#c4c4c4",
            borderFocus: "#0054d1",
            messageMine: "#e6f0ff",
            messageOther: "#f0f0f0",
            messageHighlight: "#f064281f"))
    }

    func testBorderlineLight() {
        check(["#8a8a8a","#7a7a7a","#9a9a9a","#336699","#101010","#303030","#707070","#6a6a6a","#808080"], light: false, mention: "#f06428", DerivedColors(
            bgApp: "#8a8a8a",
            bgSurface: "#7a7a7a",
            bgRaised: "#9a9a9a",
            bgInput: "#4f4f4f",
            bgHover: "#ffffff0f",
            bgActive: "#33669933",
            bgOverlay: "#000000a6",
            textPrimary: "#101010",
            textSecondary: "#202020",
            textMuted: "#303030",
            textDisabled: "#505050",
            textOnAccent: "#ffffff",
            textLink: "#4ea8ff",
            accentDefault: "#336699",
            accentHover: "#2a547d",
            accentSoft: "#33669926",
            accentGlow1: "#3366990d",
            accentGlow2: "#33669908",
            borderDefault: "#707070",
            borderStrong: "#606060",
            borderFocus: "#7a9cbd",
            messageMine: "#6a6a6a",
            messageOther: "#808080",
            messageHighlight: "#f0642826"))
    }

    func testBorderlineDark() {
        check(["#858585","#757575","#959595","#993366","#fafafa","#e0e0e0","#656565","#555555","#7a7a7a"], light: false, mention: "#f06428", DerivedColors(
            bgApp: "#858585",
            bgSurface: "#757575",
            bgRaised: "#959595",
            bgInput: "#4c4c4c",
            bgHover: "#ffffff0f",
            bgActive: "#99336633",
            bgOverlay: "#000000a6",
            textPrimary: "#fafafa",
            textSecondary: "#ededed",
            textMuted: "#e0e0e0",
            textDisabled: "#c0c0c0",
            textOnAccent: "#ffffff",
            textLink: "#4ea8ff",
            accentDefault: "#993366",
            accentHover: "#7d2a54",
            accentSoft: "#99336626",
            accentGlow1: "#9933660d",
            accentGlow2: "#99336608",
            borderDefault: "#656565",
            borderStrong: "#848484",
            borderFocus: "#bd7a9c",
            messageMine: "#555555",
            messageOther: "#7a7a7a",
            messageHighlight: "#f0642826"))
    }

    func testRoundingSpec() {
        check(["#12345f","#0b2548","#1c4472","#7fb2e9","#e3ebf5","#8da3bd","#2f4f7a","#285a99","#16365c"], light: false, mention: "#f06428", DerivedColors(
            bgApp: "#12345f",
            bgSurface: "#0b2548",
            bgRaised: "#1c4472",
            bgInput: "#07182f",
            bgHover: "#ffffff0f",
            bgActive: "#7fb2e933",
            bgOverlay: "#000000a6",
            textPrimary: "#e3ebf5",
            textSecondary: "#b8c7d9",
            textMuted: "#8da3bd",
            textDisabled: "#627c9c",
            textOnAccent: "#ffffff",
            textLink: "#4ea8ff",
            accentDefault: "#7fb2e9",
            accentHover: "#6892bf",
            accentSoft: "#7fb2e926",
            accentGlow1: "#7fb2e90d",
            accentGlow2: "#7fb2e908",
            borderDefault: "#2f4f7a",
            borderStrong: "#47648b",
            borderFocus: "#accdf1",
            messageMine: "#285a99",
            messageOther: "#16365c",
            messageHighlight: "#f0642826"))
    }

    func testHalfSteps() {
        check(["#101112","#0d0e0f","#17181a","#10a0c1","#d1d7dd","#7d858e","#1f2125","#1b2a33","#0f1417"], light: false, mention: "#f06428", DerivedColors(
            bgApp: "#101112",
            bgSurface: "#0d0e0f",
            bgRaised: "#17181a",
            bgInput: "#08090a",
            bgHover: "#ffffff0f",
            bgActive: "#10a0c133",
            bgOverlay: "#000000a6",
            textPrimary: "#d1d7dd",
            textSecondary: "#a7aeb6",
            textMuted: "#7d858e",
            textDisabled: "#575c63",
            textOnAccent: "#ffffff",
            textLink: "#4ea8ff",
            accentDefault: "#10a0c1",
            accentHover: "#0d839e",
            accentSoft: "#10a0c126",
            accentGlow1: "#10a0c10d",
            accentGlow2: "#10a0c108",
            borderDefault: "#1f2125",
            borderStrong: "#373a3f",
            borderFocus: "#64c1d7",
            messageMine: "#1b2a33",
            messageOther: "#0f1417",
            messageHighlight: "#f0642826"))
    }

    func testHexColors() {
        XCTAssertTrue(ThemeDerive.isHexColor("#a1B2c3"))
        XCTAssertFalse(ThemeDerive.isHexColor("a1b2c3"))
        XCTAssertFalse(ThemeDerive.isHexColor("#a1b2c"))
        XCTAssertFalse(ThemeDerive.isHexColor("#a1b2c3ff"))
        XCTAssertFalse(ThemeDerive.isHexColor("#a1b2cz"))
    }

    func testBuiltThemeKeepsTheSpecColours() {
        let input = spec(["#1a1b1e","#131416","#232428","#5865f2","#dbdee1","#949ba4","#2b2d31","#2e3036","#131416"])
        XCTAssertEqual(ThemeDerive.hexOf(ThemeDerive.build(input).bgApp), "#1a1b1e")
        XCTAssertEqual(ThemeDerive.hexOf(ThemeDerive.build(input).accentDefault), "#5865f2")
    }
}
