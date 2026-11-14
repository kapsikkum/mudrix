import SwiftUI

/// The time since the call began, `m:ss` or `h:mm:ss`, counting up every second
struct CallTimerText: View {
    let startedAt: Int64

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            Text(CallTimer.format(Int64(context.date.timeIntervalSince1970 * 1000) - startedAt))
                .monospacedDigit()
        }
    }
}

/// Your sounds and the bundled ones; a tap plays a clip for everyone in the call
struct SoundboardSheet: View {
    @ObservedObject var soundboard: Soundboard

    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var notice: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WZ.Space.space6) {
                    if let notice {
                        Text(notice)
                            .font(.wizard(WZ.FontSize.sm, .semibold))
                            .foregroundStyle(theme.danger)
                    }
                    section(String(localized: "soundboard.panel.yourSounds"), clips: soundboard.personal,
                            empty: String(localized: "soundboard.panel.emptyPersonal"))
                    section(String(localized: "soundboard.panel.defaultSounds"), clips: SoundboardFormat.builtInClips, empty: nil)
                }
                .padding(WZ.Space.space6)
            }
            .background(theme.bgSecondary.ignoresSafeArea())
            .navigationTitle(String(localized: "soundboard.panel.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
        }
    }

    private func section(_ title: String, clips: [SoundboardClip], empty: String?) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(title).font(.wizard(WZ.FontSize.sm, .semibold)).foregroundStyle(theme.textMuted)
            if clips.isEmpty, let empty {
                Text(empty).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textMuted)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: WZ.Space.space3)], spacing: WZ.Space.space3) {
                    ForEach(clips) { clip in tile(clip) }
                }
            }
        }
    }

    private func tile(_ clip: SoundboardClip) -> some View {
        Button {
            Task { await press(clip) }
        } label: {
            VStack(spacing: WZ.Space.space2) {
                Text(clip.emoji ?? "\u{1F50A}").font(.system(size: 28))
                Text(clip.name)
                    .font(.wizard(WZ.FontSize.sm, .medium))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, WZ.Space.space4)
            .padding(.horizontal, WZ.Space.space2)
            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.format("soundboard.panel.playClip", clip.name))
    }

    private func press(_ clip: SoundboardClip) async {
        switch await soundboard.press(clip) {
        case .ok: notice = nil
        case .cooldown: break
        case .disabled: notice = String(localized: "soundboard.play.disabled")
        case .notInCall: notice = String(localized: "soundboard.play.notInCall")
        case .rateLimited: notice = String(localized: "soundboard.play.rateLimited")
        case .error: notice = String(localized: "soundboard.play.error")
        }
    }
}
