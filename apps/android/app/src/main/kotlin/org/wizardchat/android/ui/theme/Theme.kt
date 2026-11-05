package org.wizardchat.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The theme picked in settings: one of the themes, or light/dark following the system */
sealed interface ThemeSetting {
    data object System : ThemeSetting
    data class Fixed(val theme: WZ.Theme) : ThemeSetting

    val rawValue: String
        get() = when (this) {
            System -> "system"
            is Fixed -> theme.name.lowercase()
        }

    @Composable
    fun label(): String = when (this) {
        System -> tr("settings.themeSystem")
        is Fixed -> theme.label
    }

    fun resolved(systemDark: Boolean): WZ.Theme = when (this) {
        is Fixed -> theme
        System -> if (systemDark) WZ.Theme.CARBON else WZ.Theme.ETHEREAL
    }

    companion object {
        val allCases: List<ThemeSetting> = listOf(System) + listOf(
            WZ.Theme.CARBON, WZ.Theme.PEWTER, WZ.Theme.UMBRA, WZ.Theme.ECLIPSE, WZ.Theme.PARROT,
            WZ.Theme.HALLOW, WZ.Theme.GARNET, WZ.Theme.ETHEREAL, WZ.Theme.BLOSSOM,
        ).map(::Fixed)

        fun from(raw: String?): ThemeSetting = when (raw) {
            null, "", "system" -> System
            else -> WZ.Theme.entries.firstOrNull { it.name.equals(raw, ignoreCase = true) }?.let(::Fixed) ?: System
        }
    }
}

@Immutable
class WizardTheme(val id: WZ.Theme) {
    private val colors = id.colors

    val bgPrimary get() = colors.bgApp
    val bgSecondary get() = colors.bgSurface
    val bgTertiary get() = colors.bgRaised
    val bgInput get() = colors.bgInput
    val bgHover get() = colors.bgHover
    val bgActive get() = colors.bgActive
    val overlay get() = colors.bgOverlay
    val accent get() = colors.accentDefault
    val accentHover get() = colors.accentHover
    val textPrimary get() = colors.textPrimary
    val textSecondary get() = colors.textSecondary
    val textMuted get() = colors.textMuted
    val textOnAccent get() = colors.textOnAccent
    val control get() = colors.textPrimary
    val border get() = colors.borderDefault
    val msgMineBg get() = colors.messageMine
    val msgOtherBg get() = colors.messageOther
    val mention get() = colors.statusMention
    val error get() = colors.statusDanger
    val danger get() = colors.statusDanger
    val success get() = colors.statusSuccess
    val warningColor get() = colors.statusWarning
    val linkColor get() = colors.textLink
    val presenceOnline get() = colors.presenceOnline
    val presenceAway get() = colors.presenceAway
    val presenceBusy get() = colors.presenceBusy
    val presenceOffline get() = colors.presenceOffline
    val usernameColors
        get() = listOf(
            colors.usernameC1, colors.usernameC2, colors.usernameC3, colors.usernameC4,
            colors.usernameC5, colors.usernameC6, colors.usernameC7, colors.usernameC8,
        )
    val logo get() = listOf(colors.logoP0, colors.logoP1, colors.logoP2, colors.logoP3, colors.logoP4, colors.logoP5)
    val isDark get() = id.isDark

    val fill get() = bgHover
    val groupedBackground get() = if (isDark) bgPrimary else bgSecondary
    val groupedRow get() = if (isDark) bgSecondary else bgPrimary

    companion object {
        val default = WizardTheme(WZ.Theme.default)
        val baseLogo get() = default.logo
    }
}

val LocalTheme = staticCompositionLocalOf { WizardTheme.default }

/** The current theme */
val theme: WizardTheme
    @Composable get() = LocalTheme.current

/** Text in the app font (Roboto, Android's own) at a token size */
fun wizardFont(size: TextUnit, weight: FontWeight = FontWeight.Normal) = TextStyle(fontSize = size, fontWeight = weight)

@Composable
fun WizardThemeRoot(setting: ThemeSetting, content: @Composable () -> Unit) {
    val resolved = WizardTheme(setting.resolved(isSystemInDarkTheme()))
    val scheme = if (resolved.isDark) {
        darkColorScheme(
            primary = resolved.accent,
            onPrimary = resolved.textOnAccent,
            background = resolved.bgPrimary,
            onBackground = resolved.textPrimary,
            surface = resolved.bgPrimary,
            onSurface = resolved.textPrimary,
            surfaceVariant = resolved.bgSecondary,
            onSurfaceVariant = resolved.textMuted,
            surfaceContainer = resolved.bgSecondary,
            surfaceContainerHigh = resolved.bgTertiary,
            surfaceContainerLow = resolved.bgSecondary,
            surfaceContainerHighest = resolved.bgTertiary,
            outline = resolved.border,
            outlineVariant = resolved.border,
            error = resolved.error,
        )
    } else {
        lightColorScheme(
            primary = resolved.accent,
            onPrimary = resolved.textOnAccent,
            background = resolved.bgPrimary,
            onBackground = resolved.textPrimary,
            surface = resolved.bgPrimary,
            onSurface = resolved.textPrimary,
            surfaceVariant = resolved.bgSecondary,
            onSurfaceVariant = resolved.textMuted,
            surfaceContainer = resolved.bgSecondary,
            surfaceContainerHigh = resolved.bgTertiary,
            surfaceContainerLow = resolved.bgSecondary,
            surfaceContainerHighest = resolved.bgTertiary,
            outline = resolved.border,
            outlineVariant = resolved.border,
            error = resolved.error,
        )
    }
    CompositionLocalProvider(LocalTheme provides resolved) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

/** A stable colour per name, like the web's username colours */
fun hueColor(name: String): Color {
    val code = (name.firstOrNull()?.code ?: 63).toDouble()
    val hue = ((code * 137.508) % 360).toFloat()
    return Color.hsv(hue, 0.75f, 0.672f)
}
