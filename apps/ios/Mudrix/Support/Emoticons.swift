import Foundation

/// Plain-text emoticons turned into Unicode emoji on send; the same table and rules as the web's `util/emoticons.ts`
enum Emoticons {
    private static let table: [String: String] = [
        ":)": "🙂",
        ":-)": "🙂",
        "(:": "🙂",
        ":D": "😃",
        ":-D": "😃",
        "XD": "😆",
        "xD": "😆",
        ":(": "🙁",
        ":-(": "🙁",
        ":'(": "😢",
        ":P": "😛",
        ":-P": "😛",
        ":p": "😛",
        ";)": "😉",
        ";-)": "😉",
        ":O": "😮",
        ":-O": "😮",
        ":o": "😮",
        ":/": "😕",
        ":-/": "😕",
        ":|": "😐",
        ":-|": "😐",
        ":*": "😘",
        ":-*": "😘",
        "B)": "😎",
        "8)": "😎",
        ">:(": "😠",
        "<3": "❤️",
        "</3": "💔",
    ]

    // A token only counts when whitespace or the start of the text comes before it and whitespace, the end,
    // or sentence punctuation comes after, so "http://x", "a:D" and "(:" inside words are left alone.
    private static let emoticon: NSRegularExpression? = {
        let keys = table.keys.sorted { left, right in
            left.count != right.count ? left.count > right.count : left < right
        }
        let alternation = keys.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "|")
        return try? NSRegularExpression(pattern: "(^|\\s)(" + alternation + ")(?=$|\\s|[.,!?;])")
    }()

    private static let inlineCode: NSRegularExpression? = try? NSRegularExpression(pattern: "(`[^`]*`)")

    private static func replaceTokens(_ text: String) -> String {
        guard let emoticon else { return text }
        let ns = text as NSString
        var out = ""
        var last = 0
        for match in emoticon.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let lead = ns.substring(with: match.range(at: 1))
            let token = ns.substring(with: match.range(at: 2))
            out += ns.substring(with: NSRange(location: last, length: match.range.location - last))
            out += lead + (table[token] ?? token)
            last = match.range.location + match.range.length
        }
        out += ns.substring(from: last)
        return out
    }

    /// `text` with its emoticons replaced, except inside inline code
    static func replaceInText(_ text: String) -> String {
        guard let inlineCode else { return replaceTokens(text) }
        let ns = text as NSString
        var out = ""
        var last = 0
        for match in inlineCode.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out += replaceTokens(ns.substring(with: NSRange(location: last, length: match.range.location - last)))
            out += ns.substring(with: match.range)
            last = match.range.location + match.range.length
        }
        out += replaceTokens(ns.substring(from: last))
        return out
    }

    /// A message with its emoticons replaced, except inside inline code and fenced code blocks
    static func replaceInMessage(_ message: String) -> String {
        var inFence = false
        var lines: [String] = []
        for line in message.components(separatedBy: "\n") {
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                inFence.toggle()
                lines.append(line)
            } else if inFence {
                lines.append(line)
            } else {
                lines.append(replaceInText(line))
            }
        }
        return lines.joined(separator: "\n")
    }
}
