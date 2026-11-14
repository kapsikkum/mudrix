import Foundation
import SwiftUI
import UIKit

/// The colours derived from a custom theme's nine, as `#rrggbb` (opaque) or `#rrggbbaa` text, the
/// form the web's `buildThemeColors` produces. Kept as text so tests can compare them exactly.
struct DerivedColors: Equatable {
    var bgApp: String
    var bgSurface: String
    var bgRaised: String
    var bgInput: String
    var bgHover: String
    var bgActive: String
    var bgOverlay: String
    var textPrimary: String
    var textSecondary: String
    var textMuted: String
    var textDisabled: String
    var textOnAccent: String
    var textLink: String
    var accentDefault: String
    var accentHover: String
    var accentSoft: String
    var accentGlow1: String
    var accentGlow2: String
    var borderDefault: String
    var borderStrong: String
    var borderFocus: String
    var messageMine: String
    var messageOther: String
    var messageHighlight: String
}

/// Fills in a whole theme from the nine colours of a custom theme. This is `buildThemeColors` of
/// the web (`apps/web/src/theme/themeTokens.ts`) and must give the same colours, so it works on
/// hex strings with the same rounding (`Math.round`, half up) instead of on floats.
enum ThemeDerive {
    static func isHexColor(_ value: String) -> Bool {
        let chars = Array(value.utf8)
        guard chars.count == 7, chars[0] == UInt8(ascii: "#") else { return false }
        return chars.dropFirst().allSatisfy { ch in
            (ch >= 48 && ch <= 57) || (ch >= 65 && ch <= 70) || (ch >= 97 && ch <= 102)
        }
    }

    /// The red, green and blue of `#rrggbb` (anything after the sixth digit is ignored)
    static func rgb(_ hex: String) -> [Int] {
        let value = Int(hex.dropFirst().prefix(6), radix: 16) ?? 0
        return [(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]
    }

    /// JavaScript's Math.round: halves go up
    static func jsRound(_ value: Double) -> Int {
        Int((value + 0.5).rounded(.down))
    }

    static func channel(_ value: Double) -> String {
        let text = String(jsRound(value), radix: 16)
        return text.count < 2 ? "0" + text : text
    }

    static func mixHex(_ a: String, _ b: String, _ t: Double) -> String {
        let from = rgb(a)
        let to = rgb(b)
        var out = "#"
        for index in 0..<3 {
            out += channel(Double(from[index]) + Double(to[index] - from[index]) * t)
        }
        return out
    }

    /// `#rrggbb` with an alpha (0-1) as `#rrggbbaa`, the format the design tokens use
    static func withAlpha(_ hex: String, _ alpha: Double) -> String {
        hex + channel(alpha * 255)
    }

    static func luminance(_ hex: String) -> Double {
        let parts = rgb(hex).map { value -> Double in
            let c = Double(value) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]
    }

    /// True for a light background (relative luminance above the midpoint)
    static func isLightColor(_ hex: String) -> Bool {
        luminance(hex) > 0.4
    }

    /// `#rrggbb` or `#rrggbbaa` as a colour
    static func parse(_ hex: String) -> Color {
        let value = UInt64(hex.dropFirst(), radix: 16) ?? 0
        var red = (value >> 16) & 0xFF
        var green = (value >> 8) & 0xFF
        var blue = value & 0xFF
        var alpha: UInt64 = 255
        if hex.count >= 9 {
            red = (value >> 24) & 0xFF
            green = (value >> 16) & 0xFF
            blue = (value >> 8) & 0xFF
            alpha = value & 0xFF
        }
        return Color(.sRGB, red: Double(red) / 255, green: Double(green) / 255,
                     blue: Double(blue) / 255, opacity: Double(alpha) / 255)
    }

    /// `#rrggbb` of a colour, without its alpha
    static func hexOf(_ color: Color) -> String {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        _ = UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return "#" + channel(Double(red) * 255) + channel(Double(green) * 255) + channel(Double(blue) * 255)
    }

    /// The colours that follow from the spec; `mentionHex` is the mention colour of the built-in
    /// theme the custom one borrows its status colours from
    static func derive(_ spec: ThemeSpec, mentionHex: String) -> DerivedColors {
        let light = isLightColor(spec.bgPrimary)
        let hover = mixHex(spec.accent, "#000000", 0.18)
        return DerivedColors(
            bgApp: spec.bgPrimary,
            bgSurface: spec.bgSecondary,
            bgRaised: spec.bgTertiary,
            bgInput: mixHex(spec.bgSecondary, "#000000", light ? 0.04 : 0.35),
            bgHover: light ? "#06060710" : "#ffffff0f",
            bgActive: withAlpha(spec.accent, light ? 0.14 : 0.2),
            bgOverlay: light ? withAlpha(spec.textPrimary, 0.4) : "#000000a6",
            textPrimary: spec.textPrimary,
            textSecondary: mixHex(spec.textPrimary, spec.textMuted, 0.5),
            textMuted: spec.textMuted,
            textDisabled: mixHex(spec.textMuted, spec.bgPrimary, 0.35),
            textOnAccent: "#ffffff",
            textLink: light ? "#1f6fd1" : "#4ea8ff",
            accentDefault: spec.accent,
            accentHover: hover,
            accentSoft: withAlpha(spec.accent, light ? 0.12 : 0.15),
            accentGlow1: withAlpha(spec.accent, 0.05),
            accentGlow2: withAlpha(spec.accent, 0.03),
            borderDefault: spec.border,
            borderStrong: mixHex(spec.border, spec.textMuted, 0.25),
            borderFocus: light ? hover : mixHex(spec.accent, "#ffffff", 0.35),
            messageMine: spec.msgMineBg,
            messageOther: spec.msgOtherBg,
            messageHighlight: withAlpha(mentionHex, light ? 0.12 : 0.15)
        )
    }

    /// The first built-in theme of a scheme: where a custom theme's status, presence and username colours come from
    private static func firstBuiltin(light: Bool) -> WZ.Theme {
        WZ.Theme.allCases.first { ($0.colorScheme == .light) == light } ?? WZ.Theme.default
    }

    /// All colours of a custom theme
    static func build(_ spec: ThemeSpec) -> WZ.ThemeColors {
        let light = isLightColor(spec.bgPrimary)
        let base = firstBuiltin(light: light).colors
        let logo = WZ.Theme.default.colors
        let d = derive(spec, mentionHex: hexOf(base.statusMention))
        return WZ.ThemeColors(
            bgApp: parse(d.bgApp),
            bgSurface: parse(d.bgSurface),
            bgRaised: parse(d.bgRaised),
            bgInput: parse(d.bgInput),
            bgHover: parse(d.bgHover),
            bgActive: parse(d.bgActive),
            bgOverlay: parse(d.bgOverlay),
            textPrimary: parse(d.textPrimary),
            textSecondary: parse(d.textSecondary),
            textMuted: parse(d.textMuted),
            textDisabled: parse(d.textDisabled),
            textOnAccent: parse(d.textOnAccent),
            textLink: parse(d.textLink),
            accentDefault: parse(d.accentDefault),
            accentHover: parse(d.accentHover),
            accentSoft: parse(d.accentSoft),
            accentGlow1: parse(d.accentGlow1),
            accentGlow2: parse(d.accentGlow2),
            borderDefault: parse(d.borderDefault),
            borderStrong: parse(d.borderStrong),
            borderFocus: parse(d.borderFocus),
            statusDanger: base.statusDanger,
            statusError: base.statusError,
            statusSuccess: base.statusSuccess,
            statusWarning: base.statusWarning,
            statusInfo: base.statusInfo,
            statusMention: base.statusMention,
            presenceOnline: base.presenceOnline,
            presenceAway: base.presenceAway,
            presenceBusy: base.presenceBusy,
            presenceOffline: base.presenceOffline,
            roleFounder: base.roleFounder,
            roleAdmin: base.roleAdmin,
            roleModerator: base.roleModerator,
            roleMember: base.roleMember,
            logoP0: logo.logoP0,
            logoP1: logo.logoP1,
            logoP2: logo.logoP2,
            logoP3: logo.logoP3,
            logoP4: logo.logoP4,
            logoP5: logo.logoP5,
            logoHover: logo.logoHover,
            logoHoverGlow: logo.logoHoverGlow,
            messageMine: parse(d.messageMine),
            messageOther: parse(d.messageOther),
            messageHighlight: parse(d.messageHighlight),
            usernameC1: base.usernameC1,
            usernameC2: base.usernameC2,
            usernameC3: base.usernameC3,
            usernameC4: base.usernameC4,
            usernameC5: base.usernameC5,
            usernameC6: base.usernameC6,
            usernameC7: base.usernameC7,
            usernameC8: base.usernameC8
        )
    }
}
