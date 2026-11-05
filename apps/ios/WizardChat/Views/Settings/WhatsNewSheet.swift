import SwiftUI

enum WhatsNew {
    struct Entry: Identifiable {
        let version: String
        let markdown: String
        var id: String { version }
    }

    private static let seenKey = "whatsNew.seen"

    static func latest() -> Entry? {
        guard let folder = Bundle.main.url(forResource: "whatsnew", withExtension: nil),
              let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return nil }
        var notes: [String: [String: String]] = [:]
        for file in files where file.pathExtension == "md" {
            let parts = file.deletingPathExtension().lastPathComponent.split(separator: ".")
            guard parts.count >= 3, let text = try? String(contentsOf: file, encoding: .utf8),
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            let version = parts.prefix(3).joined(separator: ".")
            let language = parts.count > 3 ? String(parts[3]) : ""
            notes[version, default: [:]][language] = text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard let newest = notes.keys.max(by: { $0.compare($1, options: .numeric) == .orderedAscending }) else { return nil }
        let language = Locale.current.language.languageCode?.identifier ?? ""
        guard let markdown = notes[newest]?[language] ?? notes[newest]?[""] else { return nil }
        return Entry(version: newest, markdown: markdown)
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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        lineView(line)
                    }
                    Link(destination: URL(string: "https://gitlab.com/wizardchat/wizardchat/-/releases")!) {
                        Label(String(localized: "whatsNew.fullChangelog"), image: "ph-arrow-square-out-regular")
                            .font(.wizard(WZ.FontSize.md, .semibold))
                    }
                    .padding(.top, WZ.Space.space4)
                }
                .foregroundStyle(theme.textPrimary)
                .padding(WZ.Space.space7)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(theme.bgSecondary)
            .safeAreaInset(edge: .bottom) {
                Button(String(localized: "whatsNew.gotIt")) { dismiss() }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(WZ.Space.space7)
            }
            .navigationTitle(L10n.format("whatsNew.titleVersion", entry.version))
            .navigationBarTitleDisplayMode(.inline)
            .tint(theme.control)
        }
        .onDisappear { WhatsNew.markSeen(entry) }
    }

    private var lines: [String] {
        entry.markdown.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    @ViewBuilder
    private func lineView(_ line: String) -> some View {
        if line.hasPrefix("#") {
            Text(inline(line.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)))
                .font(.wizard(WZ.FontSize.lg, .bold))
                .padding(.top, WZ.Space.space4)
        } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
            HStack(alignment: .firstTextBaseline, spacing: WZ.Space.space3) {
                Text(verbatim: "•").foregroundStyle(theme.accent)
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
