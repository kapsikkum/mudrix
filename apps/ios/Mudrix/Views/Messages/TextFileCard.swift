import MudrixCore
import QuickLook
import SwiftUI

/// The start of a small text file in a monospace card, with the whole file one tap away
/// (Android's `TextFileCard` in `ui/room/MessageContent.kt`, the web's file preview).
struct TextFileCard: View {
    let media: ChatEntry.MediaContent

    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var head: String?
    @State private var full: String?
    @State private var expanded = false
    @State private var loading = false
    @State private var previewURL: URL?

    private var text: String { (expanded ? full ?? head : head) ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(text)
                .font(.system(size: WZ.FontSize.sm, design: .monospaced))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(expanded ? 40 : 5)
                .frame(maxWidth: WZ.Size.sidebar, alignment: .leading)
            HStack(spacing: WZ.Space.space4) {
                Button {
                    Task { await open() }
                } label: {
                    VStack(alignment: .leading, spacing: WZ.Space.space1) {
                        Text(media.filename)
                            .font(.wizard(WZ.FontSize.md, .semibold))
                            .foregroundStyle(theme.textPrimary)
                            .lineLimit(1)
                        if let size = media.size {
                            Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if head != nil {
                    Button(expanded ? String(localized: "common.collapse") : String(localized: "common.expand")) {
                        Task { await toggle() }
                    }
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.accent)
                    .lineLimit(1)
                }
                if loading {
                    ProgressView()
                } else {
                    Button {
                        Task { await open() }
                    } label: {
                        Image("ph-download-simple-regular")
                            .font(.system(size: WZ.SizeIcon.md))
                            .foregroundStyle(theme.textMuted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "common.download"))
                }
            }
        }
        .padding(WZ.Space.space4)
        .frame(maxWidth: WZ.Size.sidebar, alignment: .leading)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .task(id: media.source) {
            guard let client = mediaLoader?.client else { return }
            let data = try? await client.mediaHead(source: media.source, length: TextFile.previewBytes)
            head = data.map { TextFile.decodeHead($0) }
        }
        .quickLookPreview($previewURL)
    }

    /// Opens the whole file with Quick Look
    private func open() async {
        guard let mediaLoader, !loading else { return }
        loading = true
        defer { loading = false }
        previewURL = try? await mediaLoader.file(for: media.source, filename: media.filename, mimetype: media.mimetype)
    }

    /// Shows the whole file in the card, downloading it when the head was not the whole file
    private func toggle() async {
        guard !loading else { return }
        if expanded {
            expanded = false
            return
        }
        if full != nil || (media.size ?? Int.max) <= TextFile.previewBytes {
            expanded = true
            return
        }
        guard let mediaLoader else { return }
        loading = true
        defer { loading = false }
        guard let url = try? await mediaLoader.file(for: media.source, filename: media.filename, mimetype: media.mimetype),
              let data = try? Data(contentsOf: url) else { return }
        full = TextFile.clampForCard(String(decoding: data, as: UTF8.self))
        expanded = true
    }
}
