package org.wizardchat.android.ui.theme

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.wizardchat.tokens.WZ

/**
 * The expected colours were computed with the web's `buildThemeColors` (apps/web/src/theme/themeTokens.ts)
 * run in node on the same nine-colour specs, so the two derivations must agree to the digit.
 */
class ThemeDeriveTest {
    private val dark = ThemeSpec("#1a1b1e", "#131416", "#232428", "#5865f2", "#dbdee1", "#949ba4", "#2b2d31", "#2e3036", "#131416")
    private val light = ThemeSpec("#f4efe6", "#e9e2d3", "#fffaf0", "#c2410c", "#2b2118", "#7c6f5f", "#d6ccb8", "#fde7d3", "#ece4d4")
    private val odd = ThemeSpec("#0f7a3b", "#0a5d2c", "#13914a", "#ff6b9d", "#f2fff6", "#a8d8b9", "#1d9c52", "#1fb25f", "#0d6b33")

    /** The web writes opaque colours as #rrggbb; the tokens always carry an alpha */
    private fun web(hex: String) = if (hex.length == 7) hex + "ff" else hex

    private fun hex(color: androidx.compose.ui.graphics.Color) = ThemeDerive.hexWithAlphaOf(color)

    @Test
    fun darkSpecMatchesTheWeb() {
        val c = ThemeDerive.build(dark)
        assertEquals(web("#0c0d0e"), hex(c.bgInput))
        assertEquals(web("#ffffff0f"), hex(c.bgHover))
        assertEquals(web("#5865f233"), hex(c.bgActive))
        assertEquals(web("#000000a6"), hex(c.bgOverlay))
        assertEquals(web("#b8bdc3"), hex(c.textSecondary))
        assertEquals(web("#696e75"), hex(c.textDisabled))
        assertEquals(web("#4ea8ff"), hex(c.textLink))
        assertEquals(web("#4853c6"), hex(c.accentHover))
        assertEquals(web("#5865f226"), hex(c.accentSoft))
        assertEquals(web("#5865f20d"), hex(c.accentGlow1))
        assertEquals(web("#5865f208"), hex(c.accentGlow2))
        assertEquals(web("#45494e"), hex(c.borderStrong))
        assertEquals(web("#929bf7"), hex(c.borderFocus))
        assertEquals(web("#f0642826"), hex(c.messageHighlight))
        assertEquals(web("#b94a48"), hex(c.statusDanger))
        assertEquals(web("#4ade80"), hex(c.presenceOnline))
        assertEquals(web("#4ea8ff"), hex(c.usernameC1))
        assertEquals(web("#4a301b"), hex(c.logoP0))
    }

    @Test
    fun anotherAccentRederivesWhatFollowsTheAccent() {
        val base = ThemeDerive.build(dark)
        val c = ThemeDerive.withAccent(base, "#ff0000", light = false)
        assertEquals(web("#ff0000"), hex(c.accentDefault))
        assertEquals(web("#d10000"), hex(c.accentHover))
        assertEquals(web("#ff000026"), hex(c.accentSoft))
        assertEquals(hex(base.bgApp), hex(c.bgApp))
    }

    @Test
    fun lightSpecMatchesTheWeb() {
        val c = ThemeDerive.build(light)
        assertTrue(ThemeDerive.isLightColor(light.bgPrimary))
        assertEquals(web("#e0d9cb"), hex(c.bgInput))
        assertEquals(web("#06060710"), hex(c.bgHover))
        assertEquals(web("#c2410c24"), hex(c.bgActive))
        assertEquals(web("#2b211866"), hex(c.bgOverlay))
        assertEquals(web("#54483c"), hex(c.textSecondary))
        assertEquals(web("#a69c8e"), hex(c.textDisabled))
        assertEquals(web("#1f6fd1"), hex(c.textLink))
        assertEquals(web("#9f350a"), hex(c.accentHover))
        assertEquals(web("#c2410c1f"), hex(c.accentSoft))
        assertEquals(web("#c0b5a2"), hex(c.borderStrong))
        assertEquals(web("#9f350a"), hex(c.borderFocus))
        assertEquals(web("#f064281f"), hex(c.messageHighlight))
        assertEquals(web("#b91c1c"), hex(c.statusDanger))
        assertEquals(web("#22c55e"), hex(c.presenceOnline))
    }

    @Test
    fun saturatedSpecMatchesTheWeb() {
        val c = ThemeDerive.build(odd)
        assertFalse(ThemeDerive.isLightColor(odd.bgPrimary))
        assertEquals(web("#073c1d"), hex(c.bgInput))
        assertEquals(web("#cdecd8"), hex(c.textSecondary))
        assertEquals(web("#72b78d"), hex(c.textDisabled))
        assertEquals(web("#d15881"), hex(c.accentHover))
        assertEquals(web("#40ab6c"), hex(c.borderStrong))
        assertEquals(web("#ff9fbf"), hex(c.borderFocus))
    }

    @Test
    fun theColoursThePickerGivesAreKept() {
        val c = ThemeDerive.build(dark)
        assertEquals(web(dark.bgPrimary), hex(c.bgApp))
        assertEquals(web(dark.accent), hex(c.accentDefault))
        assertEquals(web(dark.msgMineBg), hex(c.messageMine))
    }

    @Test
    fun allBuiltInThemesAreThereInTheSharedOrder() {
        assertEquals(29, WZ.Theme.entries.size)
        assertEquals(WZ.Theme.default, WZ.Theme.entries.first())
    }

    @Test
    fun customThemesSurviveASyncRoundTrip() {
        val theme = CustomTheme("0123456789ab", "  My   theme ", dark)
        val json = CustomThemes.toJson(listOf(theme))
        val parsed = CustomThemes.sanitize(Json.parseToJsonElement(json.toString()))
        assertEquals(1, parsed.size)
        assertEquals("My theme", CustomThemes.cleanName(theme.name))
        assertEquals(dark, parsed[0].colors)
        assertEquals("custom:0123456789ab", parsed[0].themeName)
    }

    @Test
    fun badCustomThemesAreDropped() {
        val raw = Json.parseToJsonElement(
            """[
              {"id":"short","name":"x","colors":{}},
              {"id":"0123456789ab","name":"","colors":{"bgPrimary":"#000000"}},
              {"id":"abcdef123456","name":"Fine","colors":{"bgPrimary":"#AABBCC","bgSecondary":"#000000","bgTertiary":"#000000","accent":"#000000","textPrimary":"#000000","textMuted":"#000000","border":"#000000","msgMineBg":"#000000","msgOtherBg":"#000000"}}
            ]""",
        )
        val parsed = CustomThemes.sanitize(raw)
        assertEquals(1, parsed.size)
        assertEquals("#aabbcc", parsed[0].colors.bgPrimary)
        assertTrue(CustomThemes.sanitize(JsonArray(emptyList())).isEmpty())
    }

    @Test
    fun sharedThemesParseAndExport() {
        val theme = CustomTheme("0123456789ab", "Shared", light)
        val text = CustomThemes.serialize(theme)
        val parsed = CustomThemes.parseShared(text)
        assertNotNull(parsed)
        assertEquals("Shared", parsed!!.first)
        assertEquals(light, parsed.second)
        assertNull(CustomThemes.parseShared("not json"))
        assertNull(CustomThemes.parseShared("""{"name":"x","colors":{"bgPrimary":"red"}}"""))
    }

    @Test
    fun customThemeNamesHaveTheWebShape() {
        assertTrue(CustomThemes.isCustomThemeName("custom:0123456789ab"))
        assertFalse(CustomThemes.isCustomThemeName("custom:ab"))
        assertFalse(CustomThemes.isCustomThemeName("Carbon"))
    }
}
