package org.wizardchat.android.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import kotlin.math.pow
import org.wizardchat.tokens.WZ

/**
 * Fills in a whole theme from the nine colours of a custom theme. This is `buildThemeColors` of
 * the web (`apps/web/src/theme/themeTokens.ts`) and must give the same colours, so it works on
 * hex strings with the same rounding (`Math.round`, half up) instead of on floats.
 */
object ThemeDerive {
    private val HEX6 = Regex("^#[0-9a-fA-F]{6}$")

    fun isHexColor(value: String) = HEX6.matches(value)

    private fun rgb(hex: String): IntArray = intArrayOf(
        hex.substring(1, 3).toInt(16),
        hex.substring(3, 5).toInt(16),
        hex.substring(5, 7).toInt(16),
    )

    /** JavaScript's Math.round: halves go up */
    private fun round(value: Double): Int = Math.floor(value + 0.5).toInt()

    private fun channel(value: Double): String = round(value).toString(16).padStart(2, '0')

    fun mixHex(a: String, b: String, t: Double): String {
        val (ar, ag, ab) = rgb(a)
        val (br, bg, bb) = rgb(b)
        return "#" + channel(ar + (br - ar) * t) + channel(ag + (bg - ag) * t) + channel(ab + (bb - ab) * t)
    }

    /** `#rrggbb` with an alpha (0-1) as `#rrggbbaa`, the format the design tokens use */
    fun withAlpha(hex: String, alpha: Double): String = hex + channel(alpha * 255)

    fun luminance(hex: String): Double {
        val (r, g, b) = rgb(hex).map { v ->
            val c = v / 255.0
            if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /** True for a light background (relative luminance above the midpoint) */
    fun isLightColor(hex: String) = luminance(hex) > 0.4

    /** `#rrggbb` or `#rrggbbaa` as a colour */
    fun parse(hex: String): Color {
        val r = hex.substring(1, 3).toInt(16)
        val g = hex.substring(3, 5).toInt(16)
        val b = hex.substring(5, 7).toInt(16)
        val a = if (hex.length >= 9) hex.substring(7, 9).toInt(16) else 255
        return Color(((a shl 24) or (r shl 16) or (g shl 8) or b).toLong() and 0xFFFFFFFFL)
    }

    /** `#rrggbb` of a colour, without its alpha */
    fun hexOf(color: Color): String = "#" + "%06x".format(color.toArgb() and 0xFFFFFF)

    /** `#rrggbbaa` of a colour */
    fun hexWithAlphaOf(color: Color): String {
        val argb = color.toArgb()
        return "#" + "%06x".format(argb and 0xFFFFFF) + "%02x".format((argb ushr 24) and 0xFF)
    }

    /** The built-in theme whose status, presence and username colours a custom theme borrows */
    private fun firstOfScheme(dark: Boolean): WZ.Theme = WZ.Theme.entries.firstOrNull { it.isDark == dark } ?: WZ.Theme.entries.first()

    fun build(spec: ThemeSpec): WZ.ThemeColors {
        val light = isLightColor(spec.bgPrimary)
        val base = firstOfScheme(dark = !light).colors
        val logo = WZ.Theme.entries.first().colors
        val hover = mixHex(spec.accent, "#000000", 0.18)
        val mention = hexOf(base.statusMention)
        return base.copy(
            bgApp = parse(spec.bgPrimary),
            bgSurface = parse(spec.bgSecondary),
            bgRaised = parse(spec.bgTertiary),
            bgInput = parse(mixHex(spec.bgSecondary, "#000000", if (light) 0.04 else 0.35)),
            bgHover = parse(if (light) "#06060710" else "#ffffff0f"),
            bgActive = parse(withAlpha(spec.accent, if (light) 0.14 else 0.2)),
            bgOverlay = parse(if (light) withAlpha(spec.textPrimary, 0.4) else "#000000a6"),
            textPrimary = parse(spec.textPrimary),
            textSecondary = parse(mixHex(spec.textPrimary, spec.textMuted, 0.5)),
            textMuted = parse(spec.textMuted),
            textDisabled = parse(mixHex(spec.textMuted, spec.bgPrimary, 0.35)),
            textOnAccent = parse("#ffffff"),
            textLink = parse(if (light) "#1f6fd1" else "#4ea8ff"),
            accentDefault = parse(spec.accent),
            accentHover = parse(hover),
            accentSoft = parse(withAlpha(spec.accent, if (light) 0.12 else 0.15)),
            accentGlow1 = parse(withAlpha(spec.accent, 0.05)),
            accentGlow2 = parse(withAlpha(spec.accent, 0.03)),
            borderDefault = parse(spec.border),
            borderStrong = parse(mixHex(spec.border, spec.textMuted, 0.25)),
            borderFocus = parse(if (light) hover else mixHex(spec.accent, "#ffffff", 0.35)),
            messageMine = parse(spec.msgMineBg),
            messageOther = parse(spec.msgOtherBg),
            messageHighlight = parse(withAlpha(mention, if (light) 0.12 else 0.15)),
            logoP0 = logo.logoP0,
            logoP1 = logo.logoP1,
            logoP2 = logo.logoP2,
            logoP3 = logo.logoP3,
            logoP4 = logo.logoP4,
            logoP5 = logo.logoP5,
            logoHover = logo.logoHover,
            logoHoverGlow = logo.logoHoverGlow,
        )
    }
}
