import CoreText
import SwiftUI
import UIKit

/// Themes by the name the synced settings use: a built-in theme's name (`Carbon`), or `custom:<id>`
/// for one the user made. The built-in ones come from the shared design tokens, already in the
/// order every app lists them in (the default first, dark by hue, light last).
enum Themes {
    static let all: [WZ.Theme] = WZ.Theme.allCases

    static var defaultName: String { WZ.Theme.default.name }
    static var defaultLightName: String { WZ.Theme.ethereal.name }

    static func builtin(named name: String) -> WZ.Theme? {
        WZ.Theme.allCases.first { $0.name == name }
    }

    /// Whether `name` is a built-in theme or has the shape of a custom theme's name (it may not exist yet)
    static func isValidName(_ name: String) -> Bool {
        builtin(named: name) != nil || CustomThemes.isCustomThemeName(name)
    }

    /// Whether `name` can be used right now
    static func exists(_ name: String, customs: [CustomTheme]) -> Bool {
        builtin(named: name) != nil || CustomThemes.find(name, in: customs) != nil
    }

    /// The theme `name` refers to; a name that does not exist falls back to the default
    static func resolve(_ name: String, customs: [CustomTheme]) -> WizardTheme {
        if let theme = builtin(named: name) { return WizardTheme(theme) }
        if let custom = CustomThemes.find(name, in: customs) {
            return WizardTheme(colors: ThemeDerive.build(custom.colors),
                               isLight: ThemeDerive.isLightColor(custom.colors.bgPrimary))
        }
        return WizardTheme.default
    }

    static func label(_ name: String, customs: [CustomTheme]) -> String {
        CustomThemes.find(name, in: customs)?.name ?? name
    }

    /// Whether the logo artwork of this theme exists as an alternate app icon
    static func hasThemedLogo(_ name: String) -> Bool {
        name == WZ.Theme.parrot.name || name == WZ.Theme.hallow.name
    }
}

struct WizardTheme {
    /// The built-in theme in use, or for a custom theme the default one of its light or dark kind
    let id: WZ.Theme
    let colorScheme: ColorScheme
    private let colors: WZ.ThemeColors

    init(_ theme: WZ.Theme) {
        id = theme
        colorScheme = theme.colorScheme
        colors = theme.colors
    }

    init(colors: WZ.ThemeColors, isLight: Bool) {
        id = isLight ? WZ.Theme.ethereal : WZ.Theme.default
        colorScheme = isLight ? ColorScheme.light : ColorScheme.dark
        self.colors = colors
    }

    var bgPrimary: Color { colors.bgApp }
    var bgSecondary: Color { colors.bgSurface }
    var bgTertiary: Color { colors.bgRaised }
    var bgInput: Color { colors.bgInput }
    var bgHover: Color { colors.bgHover }
    var bgActive: Color { colors.bgActive }
    var overlay: Color { colors.bgOverlay }
    var accent: Color { colors.accentDefault }
    var accentHover: Color { colors.accentHover }
    var textPrimary: Color { colors.textPrimary }
    var textSecondary: Color { colors.textSecondary }
    var textMuted: Color { colors.textMuted }
    var textOnAccent: Color { colors.textOnAccent }
    var control: Color { colors.textPrimary }
    var border: Color { colors.borderDefault }
    var msgMineBg: Color { colors.messageMine }
    var msgOtherBg: Color { colors.messageOther }
    var mention: Color { colors.statusMention }
    var error: Color { colors.statusDanger }
    var danger: Color { colors.statusDanger }
    var success: Color { colors.statusSuccess }
    var warningColor: Color { colors.statusWarning }
    var linkColor: Color { colors.textLink }
    var logo: [Color] { [colors.logoP0, colors.logoP1, colors.logoP2, colors.logoP3, colors.logoP4, colors.logoP5] }
    static var baseLogo: [Color] { WizardTheme(.default).logo }
    var presenceOnline: Color { colors.presenceOnline }
    var presenceAway: Color { colors.presenceAway }
    var presenceBusy: Color { colors.presenceBusy }
    var presenceOffline: Color { colors.presenceOffline }
    var roleFounder: Color { colors.roleFounder }
    var roleAdmin: Color { colors.roleAdmin }
    var roleModerator: Color { colors.roleModerator }
    var roleMember: Color { colors.roleMember }
    var usernameColors: [Color] {
        [colors.usernameC1, colors.usernameC2, colors.usernameC3, colors.usernameC4,
         colors.usernameC5, colors.usernameC6, colors.usernameC7, colors.usernameC8]
    }

    func usernameColor(_ userId: String) -> Color {
        var hash: Int32 = 0
        for unit in userId.utf16 { hash = hash &* 31 &+ Int32(unit) }
        return usernameColors[Int(abs(Int64(hash)) % Int64(usernameColors.count))]
    }

    func nameColor(_ userId: String?, colored: Bool) -> Color {
        guard colored, let userId, !userId.isEmpty else { return textPrimary }
        return usernameColor(userId)
    }

    static let radiusSm = WZ.Radius.sm
    static let radiusMd = WZ.Radius.md
    static let radiusLg = WZ.Radius.xl

    static let `default` = WizardTheme(.default)
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue = WizardTheme.default
}

extension EnvironmentValues {
    var theme: WizardTheme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

extension Color {
    init(hex: String) {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

extension Font {
    static func wizard(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let scaled = UIFontMetrics(forTextStyle: textStyle(for: size)).scaledValue(for: size)
        let name: String
        switch weight {
        case .bold, .heavy, .black: name = "Roboto-Bold"
        case .semibold: name = "Roboto-SemiBold"
        case .medium: name = "Roboto-Medium"
        default: name = "Roboto-Regular"
        }
        return .custom(name, fixedSize: scaled)
    }

    static func wizardUIFont(_ size: CGFloat) -> UIFont {
        let scaled = UIFontMetrics(forTextStyle: textStyle(for: size)).scaledValue(for: size)
        if let roboto = UIFont(name: "Roboto-Regular", size: scaled) { return roboto }
        return .systemFont(ofSize: scaled)
    }

    private static func textStyle(for size: CGFloat) -> UIFont.TextStyle {
        switch size {
        case 30...: return .largeTitle
        case 25..<30: return .title1
        case 21..<25: return .title2
        case 19..<21: return .title3
        case 16.5..<19: return .body
        case 15.5..<16.5: return .callout
        case 14..<15.5: return .subheadline
        case 12.5..<14: return .footnote
        case 11.5..<12.5: return .caption1
        default: return .caption2
        }
    }
}

enum FontRegistry {
    /// Registers the bundled Roboto files (copied from @fontsource/roboto) and
    /// uses them for the navigation bars and their buttons, which SwiftUI draws with UIKit
    static func registerFonts() {
        let urls = Bundle.main.urls(forResourcesWithExtension: "woff2", subdirectory: nil) ?? []
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        func roboto(_ name: String, _ size: CGFloat, _ style: UIFont.TextStyle) -> UIFont {
            let font = UIFont(name: name, size: size) ?? .systemFont(ofSize: size)
            return UIFontMetrics(forTextStyle: style).scaledFont(for: font)
        }
        let bar = UINavigationBar.appearance()
        bar.titleTextAttributes = [.font: roboto("Roboto-SemiBold", 17, .headline)]
        bar.largeTitleTextAttributes = [.font: roboto("Roboto-Bold", 34, .largeTitle)]
        let button = UIBarButtonItem.appearance()
        for state: UIControl.State in [.normal, .highlighted, .disabled] {
            button.setTitleTextAttributes([.font: roboto("Roboto-Regular", 17, .body)], for: state)
        }
    }
}

func withNameColors(_ text: String, _ names: [(String, Color)]) -> AttributedString {
    var result = AttributedString(text)
    var searchStart = result.startIndex
    for (name, color) in names where !name.isEmpty {
        guard let range = result[searchStart...].range(of: name) else { continue }
        result[range].foregroundColor = color
        searchStart = range.upperBound
    }
    return result
}
