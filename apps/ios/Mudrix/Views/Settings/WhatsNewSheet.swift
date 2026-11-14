import SwiftUI

enum WhatsNew {
    struct Entry: Identifiable {
        let version: String
        let markdown: String
        let date: Date?
        var id: String { version }
    }

    private struct Note {
        let meta: [String: String]
        let markdown: String
    }

    private static let seenKey = "whatsNew.seen"

    static func latest() -> Entry? {
        guard let folder = Bundle.main.url(forResource: "whatsnew", withExtension: nil),
              let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return nil }
        var notes: [String: [String: Note]] = [:]
        for file in files where file.pathExtension == "md" {
            let parts = file.deletingPathExtension().lastPathComponent.split(separator: ".")
            guard parts.count >= 3, let text = try? String(contentsOf: file, encoding: .utf8),
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            let version = parts.prefix(3).joined(separator: ".")
            let language = parts.count > 3 ? String(parts[3]) : ""
            notes[version, default: [:]][language] = parse(text.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        guard let newest = notes.keys.max(by: { $0.compare($1, options: .numeric) == .orderedAscending }) else { return nil }
        let language = Locale.current.language.languageCode?.identifier ?? ""
        let fallback = notes[newest]?[""]
        guard let note = notes[newest]?[language] ?? fallback, !note.markdown.isEmpty else { return nil }
        return Entry(version: newest, markdown: note.markdown, date: (note.meta["date"] ?? fallback?.meta["date"]).flatMap(day))
    }

    private static func day(_ text: String) -> Date? {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private static func parse(_ text: String) -> Note {
        let lines = text.components(separatedBy: .newlines)
        guard lines.first == "---", let end = lines.dropFirst().firstIndex(of: "---") else { return Note(meta: [:], markdown: text) }
        var meta: [String: String] = [:]
        for line in lines[1..<end] {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            if !value.isEmpty { meta[line[..<colon].trimmingCharacters(in: .whitespaces)] = value }
        }
        let markdown = lines[(end + 1)...].joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return Note(meta: meta, markdown: markdown)
    }

    static var unseen: Entry? {
        guard let entry = latest(), UserDefaults.standard.string(forKey: seenKey) != entry.version else { return nil }
        return entry
    }

    static func markSeen(_ entry: Entry) {
        UserDefaults.standard.set(entry.version, forKey: seenKey)
    }
}

struct WhatsNewSheet: View {
    let entry: WhatsNew.Entry
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    private static let changelogURL = URL(string: "https://github.com/kapsikkum/mudrix/releases")!
    private static let socials: [(icon: String, label: String, url: URL)] = [
        ("ph-globe-simple-regular", "GitHub", URL(string: "https://github.com/kapsikkum/mudrix")!),
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            rule
            ScrollView {
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                        lineView(line, first: index == 0)
                    }
                }
                .foregroundStyle(theme.textPrimary)
                .tint(theme.linkColor)
                .padding(WZ.Space.space7)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            rule
            footer
        }
        .background(theme.bgSecondary)
        .presentationDragIndicator(.hidden)
        .onDisappear { WhatsNew.markSeen(entry) }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: WZ.Space.space5) {
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                Text(String(localized: "whatsNew.title"))
                    .font(.wizard(WZ.FontSize.xl, .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(subtitle)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            Spacer(minLength: 0)
            Button { dismiss() } label: {
                Image("ph-x-regular")
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textMuted)
                    .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(String(localized: "common.close"))
        }
        .padding(.leading, WZ.Space.space7)
        .padding(.trailing, WZ.Space.space5)
        .padding(.vertical, WZ.Space.space6)
    }

    private var footer: some View {
        HStack(spacing: WZ.Space.space2) {
            ForEach(Self.socials, id: \.icon) { social in
                Link(destination: social.url) {
                    Image(social.icon)
                        .font(.system(size: WZ.SizeIcon.md))
                        .foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                }
                .accessibilityLabel(social.label)
            }
            Spacer(minLength: WZ.Space.space4)
            Link(destination: Self.changelogURL) {
                HStack(spacing: WZ.Space.space3) {
                    Text(String(localized: "whatsNew.fullChangelog"))
                    Image("ph-arrow-square-out-regular")
                }
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.trailing)
            }
        }
        .padding(.horizontal, WZ.Space.space6)
        .padding(.vertical, WZ.Space.space4)
    }

    private var rule: some View {
        Rectangle().fill(theme.border).frame(height: WZ.BorderWidth.thin)
    }

    private var subtitle: String {
        guard let date = entry.date else { return L10n.format("whatsNew.version", entry.version) }
        return L10n.format("whatsNew.dateVersion", date.formatted(date: .long, time: .omitted), entry.version)
    }

    private var lines: [String] {
        entry.markdown.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    @ViewBuilder
    private func lineView(_ line: String, first: Bool) -> some View {
        if line.hasPrefix("#") {
            HStack(spacing: WZ.Space.space5) {
                Text(inline(line.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)))
                    .font(.wizard(WZ.FontSize.md, .bold))
                    .foregroundStyle(theme.accent)
                    .layoutPriority(1)
                Rectangle().fill(theme.border).frame(height: WZ.BorderWidth.thin).frame(minWidth: WZ.Space.space8)
            }
            .padding(.top, first ? 0 : WZ.Space.space6)
        } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
            HStack(alignment: .firstTextBaseline, spacing: WZ.Space.space4) {
                Text(verbatim: "•").foregroundStyle(theme.textMuted)
                Text(inline(String(line.dropFirst(2))))
            }
            .font(.wizard(WZ.FontSize.md))
        } else {
            Text(inline(line)).font(.wizard(WZ.FontSize.md))
        }
    }

    private func inline(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(text)
    }
}
