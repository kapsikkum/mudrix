import SwiftUI
import WizardChatCore

/// "Forward message": picks a room or chat and sends the message there (the sheet of Android's `ui/room/ForwardSheet.kt`).
struct ForwardSheet: View {
    let client: WizardClient
    let fromRoomId: String
    let eventId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var query = ""
    @State private var sendingTo: String?

    private var targets: [RoomSummary] {
        MessageForward.targets(session.roomList?.joinedRooms ?? [], query: query)
    }

    var body: some View {
        NavigationStack {
            ThemedList {
                if targets.isEmpty {
                    Text(String(localized: "search.switcher.noResults"))
                        .font(.wizard(WZ.FontSize.md))
                        .foregroundStyle(theme.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, WZ.Space.space8)
                }
                ForEach(targets) { room in
                    Button { Task { await send(to: room) } } label: {
                        HStack(spacing: WZ.Space.space5) {
                            AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.md)
                            Text(room.displayName)
                                .font(.wizard(WZ.FontSize.lg, .medium))
                                .foregroundStyle(theme.textPrimary)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            if sendingTo == room.id {
                                ProgressView().tint(theme.accent)
                            } else {
                                Image("ph-arrow-circle-right-regular")
                                    .font(.system(size: WZ.SizeIcon.md))
                                    .foregroundStyle(theme.textMuted)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(sendingTo != nil)
                    .accessibilityHint(String(localized: "timeline.forwardHint"))
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: String(localized: "timeline.forwardSearchPlaceholder"))
            .navigationTitle(String(localized: "timeline.forwardPickerTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
            }
            .overlay(alignment: .top) { CopyToastView().padding(.top, WZ.Space.space2) }
            .tint(theme.control)
        }
        .presentationDetents([.large])
    }

    private func send(to room: RoomSummary) async {
        sendingTo = room.id
        do {
            try await client.forwardEvent(fromRoomId: fromRoomId, eventId: eventId, toRoomId: room.id)
            CopyToast.shared.show(L10n.format("timeline.forwarded", room.displayName))
            dismiss()
        } catch {
            CopyToast.shared.show(L10n.format("timeline.forwardFailed", error.localizedDescription))
            sendingTo = nil
        }
    }
}
