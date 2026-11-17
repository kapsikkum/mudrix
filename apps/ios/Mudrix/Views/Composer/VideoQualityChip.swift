import SwiftUI

/// What is known about a video in the attachment tray, and what it will be sent as
struct VideoInfo {
    var meta: VideoMeta?
    var size: Int64
    var quality: VideoQuality
}

/// Under each video of the attachment tray: what it is sent as, with a menu of the other ways (Original, Smart, 720p, 480p)
struct VideoQualityChip: View {
    let info: VideoInfo
    let choices: [VideoChoice]
    let onPick: (VideoQuality) -> Void
    @Environment(\.theme) private var theme

    /// The way the video will really go: what is picked, or Original when that saves nothing
    private var current: VideoQuality {
        choices.contains { $0.quality == info.quality } ? info.quality : .original
    }

    private var currentChoice: VideoChoice? {
        choices.first { $0.quality == current }
    }

    private static func name(_ quality: VideoQuality) -> String {
        switch quality {
        case .original: return String(localized: "attachment.qualityOriginal")
        case .smart: return String(localized: "attachment.qualitySmart")
        case .fixed(let height): return "\(height)p"
        }
    }

    private static func sizeText(_ choice: VideoChoice) -> String? {
        guard let size = choice.size else { return nil }
        let text = ByteCountFormatter.string(fromByteCount: size, countStyle: .file)
        return choice.quality == .original ? text : L10n.format("attachment.qualityEstimate", text)
    }

    private static func label(_ choice: VideoChoice) -> String {
        guard let size = sizeText(choice) else { return name(choice.quality) }
        return name(choice.quality) + " · " + size
    }

    var body: some View {
        if choices.count > 1 {
            Menu {
                Picker(String(localized: "attachment.videoQuality"), selection: Binding(get: { current }, set: onPick)) {
                    ForEach(choices, id: \.quality) { choice in
                        Text(verbatim: Self.label(choice)).tag(choice.quality)
                    }
                }
            } label: {
                VStack(spacing: WZ.Space.space0) {
                    Text(verbatim: Self.name(current))
                        .font(.wizard(WZ.FontSize.xs, .semibold))
                        .foregroundStyle(theme.textPrimary)
                    if let choice = currentChoice, let size = Self.sizeText(choice) {
                        Text(verbatim: size)
                            .font(.wizard(WZ.FontSize.xs))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                .padding(.horizontal, WZ.Space.space3)
                .padding(.vertical, WZ.Space.space1)
                .background(theme.fill, in: Capsule())
            }
            .accessibilityLabel(String(localized: "attachment.videoQuality"))
        }
    }
}
