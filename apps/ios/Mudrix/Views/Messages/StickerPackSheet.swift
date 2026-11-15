import MudrixCore
import SwiftUI

/// A read-only look at the sticker pack a sticker in the timeline came from, as the web shows it
/// (Android's `ui/room/StickerPackSheet.kt`).
struct StickerPackSheet: View {
    let pack: ImagePack

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    private var roomId: String? {
        guard let roomId = pack.roomId, !roomId.isEmpty else { return nil }
        return roomId
    }

    private var roomName: String {
        guard let roomId else { return "" }
        return session.roomList?.room(id: roomId)?.displayName ?? roomId
    }

    private var subtitle: String {
        let count = L10n.plural("timeline.stickerPack.stickerCount", count: pack.images.count, pack.images.count)
        guard roomId != nil else { return count }
        return count + " · " + L10n.format("timeline.stickerPack.fromRoom", roomName)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WZ.Space.space5) {
                    HStack(spacing: WZ.Space.space4) {
                        if let avatar = pack.avatarUrl {
                            AvatarView(name: pack.name, url: avatar, size: WZ.SizeAvatar.md)
                        } else {
                            Image("ph-sticker-regular")
                                .font(.system(size: WZ.SizeAvatar.md))
                                .foregroundStyle(theme.textMuted)
                                .frame(width: WZ.SizeAvatar.md, height: WZ.SizeAvatar.md)
                        }
                        VStack(alignment: .leading, spacing: WZ.Space.space1) {
                            Text(pack.name)
                                .font(.wizard(WZ.FontSize.xl, .semibold))
                                .foregroundStyle(theme.textPrimary)
                                .lineLimit(1)
                            Text(subtitle)
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                                .lineLimit(2)
                        }
                        Spacer(minLength: 0)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: WZ.SizeAvatar.xl), spacing: WZ.Space.space4)],
                              spacing: WZ.Space.space4) {
                        ForEach(pack.images) { sticker in
                            PackThumb(url: sticker.url, animated: true)
                                .frame(width: WZ.SizeAvatar.xl, height: WZ.SizeAvatar.xl)
                                .accessibilityLabel(sticker.text)
                        }
                    }
                    if let roomId {
                        Button {
                            dismiss()
                            openRoom(roomId, notifier: notifier)
                        } label: {
                            HStack(spacing: WZ.Space.space3) {
                                Text(String(localized: "timeline.stickerPack.viewRoom"))
                                    .font(.wizard(WZ.FontSize.lg, .semibold))
                                Spacer(minLength: 0)
                                Image("ph-arrow-right-bold")
                                    .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                            }
                            .foregroundStyle(theme.accent)
                            .frame(minHeight: WZ.Size.touchTarget)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(WZ.Space.space6)
            }
            .background(theme.bgPrimary)
            .navigationTitle(pack.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
