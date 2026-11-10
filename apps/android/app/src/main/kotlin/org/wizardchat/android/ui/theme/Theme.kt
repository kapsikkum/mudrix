package org.wizardchat.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import org.wizardchat.android.matrix.AppPreferences
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import org.wizardchat.android.LocalPrefs
import org.wizardchat.tokens.WZ

/**
 * Themes by the name the synced settings use: a built-in theme's name (`Carbon`), or `custom:<id>`
 * for one the user made. The built-in ones come from the shared design tokens, already in the
 * order every app lists them in (the default first, dark by hue, light last).
 */
object Themes {
    val builtin: List<WZ.Theme> get() = WZ.Theme.entries

    val defaultName: String get() = WZ.Theme.default.label
    val defaultLightName: String get() = WZ.Theme.ETHEREAL.label

    fun builtin(name: String): WZ.Theme? = WZ.Theme.entries.firstOrNull { it.label == name }

    /** Whether [name] is a built-in theme or has the shape of a custom theme's name (it may not exist yet) */
    fun isValidName(name: String) = builtin(name) != null || CustomThemes.isCustomThemeName(name)

    /** Whether [name] can be used right now */
    fun exists(name: String, customs: List<CustomTheme>) = builtin(name) != null || CustomThemes.find(name, customs) != null

    /** The theme [name] refers to; a name that does not exist falls back to the default */
    fun resolve(name: String, customs: List<CustomTheme>): WizardTheme {
        builtin(name)?.let { return WizardTheme(it) }
        CustomThemes.find(name, customs)?.let { custom ->
            val colors = ThemeDerive.build(custom.colors)
            return WizardTheme(colors, isDark = !ThemeDerive.isLightColor(custom.colors.bgPrimary))
        }
        return WizardTheme.default
    }

    fun label(name: String, customs: List<CustomTheme>): String = CustomThemes.find(name, customs)?.name ?: name

    /** The name of the built-in theme the logo artwork comes from (themed app icons exist for two) */
    fun hasThemedLogo(name: String) = name == WZ.Theme.PARROT.label || name == WZ.Theme.HALLOW.label
}

@Immutable
class WizardTheme(val colors: WZ.ThemeColors, val isDark: Boolean) {
    constructor(id: WZ.Theme) : this(id.colors, id.isDark)

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
    val roleFounder get() = colors.roleFounder
    val roleAdmin get() = colors.roleAdmin
    val roleModerator get() = colors.roleModerator
    val roleMember get() = colors.roleMember
    val usernameColors
        get() = listOf(
            colors.usernameC1, colors.usernameC2, colors.usernameC3, colors.usernameC4,
            colors.usernameC5, colors.usernameC6, colors.usernameC7, colors.usernameC8,
        )
    fun usernameColor(userId: String): Color {
        var hash = 0
        for (char in userId) hash = 31 * hash + char.code
        return usernameColors[kotlin.math.abs(hash % usernameColors.size)]
    }
    val logo get() = listOf(colors.logoP0, colors.logoP1, colors.logoP2, colors.logoP3, colors.logoP4, colors.logoP5)

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

@Composable
fun nameColor(userId: String?): Color =
    if (LocalPrefs.current.colorUsernames && !userId.isNullOrEmpty()) theme.usernameColor(userId) else theme.textPrimary

fun withNameColors(text: String, names: List<Pair<String, Color>>): AnnotatedString = buildAnnotatedString {
    append(text)
    var from = 0
    for ((name, color) in names) {
        if (name.isEmpty()) continue
        val start = text.indexOf(name, from).takeIf { it >= 0 } ?: continue
        addStyle(SpanStyle(color = color), start, start + name.length)
        from = start + name.length
    }
}

/** Text in the app font (Roboto, Android's own) at a token size */
fun wizardFont(size: TextUnit, weight: FontWeight = FontWeight.Normal) = TextStyle(fontSize = size, fontWeight = weight)

@Composable
fun WizardThemeRoot(resolved: WizardTheme, content: @Composable () -> Unit) {
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

/** The theme in use, following the system's light and dark mode when the settings say so */
@Composable
fun rememberAppTheme(prefs: AppPreferences): WizardTheme {
    val name = prefs.effectiveThemeName(isSystemInDarkTheme())
    val customs = prefs.customThemes
    return remember(name, customs) { Themes.resolve(name, customs) }
}
