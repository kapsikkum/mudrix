import Foundation

/// The numeric date forms of the date format setting; the same as `formatNumericDate` of the web's `util/format.ts`
enum DisplayFormats {
    /// `07/03/2026`, `03/07/2026` or `2026-03-07`; nil for the localised long form
    static func numericDate(year: Int, month: Int, day: Int, _ style: DateFormatStyle) -> String? {
        let dd = twoDigits(day)
        let mm = twoDigits(month)
        switch style {
        case .long: return nil
        case .dmy: return "\(dd)/\(mm)/\(year)"
        case .mdy: return "\(mm)/\(dd)/\(year)"
        case .ymd: return "\(year)-\(mm)-\(dd)"
        }
    }

    private static func twoDigits(_ value: Int) -> String {
        value < 10 ? "0\(value)" : "\(value)"
    }

    /// Whether a message is only emoji (and spaces), which are then shown larger. Like the web
    /// (`isRenderedEmojiOnly`), every character has to be drawn as an emoji by default.
    static func isOnlyEmoji(_ text: String) -> Bool {
        var hasContent = false
        for scalar in text.unicodeScalars {
            if scalar.properties.isWhitespace { continue }
            if !scalar.properties.isEmojiPresentation { return false }
            hasContent = true
        }
        return hasContent
    }
}

/// Times and dates as the time and date format settings say (the device's own by default)
enum Formats {
    private static let lock = NSLock()
    private static var formatters: [String: DateFormatter] = [:]

    /// Every row asks for its time while it is drawn; building a formatter each time shows up in scrolling
    private static func formatter(template: String) -> DateFormatter {
        let key = template + "|" + Locale.current.identifier
        lock.lock()
        defer { lock.unlock() }
        if let found = formatters[key] { return found }
        let made = DateFormatter()
        made.locale = Locale.current
        made.timeZone = TimeZone.autoupdatingCurrent
        made.setLocalizedDateFormatFromTemplate(template)
        formatters[key] = made
        return made
    }

    /// "14:05" or "2:05 PM"
    static func time(_ date: Date, _ format: TimeFormat) -> String {
        switch format {
        case .auto: return date.formatted(date: .omitted, time: .shortened)
        case .h12: return formatter(template: "hm").string(from: date)
        case .h24: return formatter(template: "Hm").string(from: date)
        }
    }

    private static func numericText(_ date: Date, _ style: DateFormatStyle) -> String? {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return DisplayFormats.numericDate(year: parts.year ?? 0, month: parts.month ?? 0, day: parts.day ?? 0, style)
    }

    static func abbreviatedDate(_ date: Date, _ style: DateFormatStyle) -> String {
        numericText(date, style) ?? date.formatted(date: .abbreviated, time: .omitted)
    }

    static func abbreviatedDateTime(_ date: Date, _ style: DateFormatStyle, _ timeFormat: TimeFormat) -> String {
        if let text = numericText(date, style) {
            return text + " " + time(date, timeFormat)
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    /// "October 31, 2026"
    static func longDate(_ date: Date, _ style: DateFormatStyle) -> String {
        numericText(date, style) ?? formatter(template: "MMMMdy").string(from: date)
    }
}
