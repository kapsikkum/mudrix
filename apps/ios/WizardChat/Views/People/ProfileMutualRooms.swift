import SwiftUI
import WizardChatCore

/// "3 mutual rooms · 1 mutual space" on a profile; tapping lists them, nothing shows when the server can't tell or there are none
struct MutualRoomsSection: View {
    let userId: String
    let name: String

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var mutual: MutualRooms?
    @State private var showing = false

    private var summary: String {
        let rooms = mutual.flatMap { $0.rooms.isEmpty ? nil : L10n.plural("profile.mutualRooms", count: $0.rooms.count, $0.rooms.count) }
        let spaces = mutual.flatMap { $0.spaces.isEmpty ? nil : L10n.plural("profile.mutualSpaces", count: $0.spaces.count, $0.spaces.count) }
        return [rooms, spaces].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        Group {
            if let mutual, !mutual.isEmpty {
                Section {
                    Button { showing = true } label: {
                        HStack(spacing: WZ.Space.space4) {
                            Image("ph-users-regular")
                                .font(.system(size: WZ.SizeIcon.sm))
                                .foregroundStyle(theme.textMuted)
                            Text(summary)
                                .font(.wizard(WZ.FontSize.md))
                                .foregroundStyle(theme.textPrimary)
                            Spacer(minLength: WZ.Space.space4)
                            Image("ph-caret-right-bold")
                                .font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                                .foregroundStyle(theme.textMuted)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .sheet(isPresented: $showing) {
            if let mutual {
                MutualRoomsSheet(
                    mutual: mutual,
                    name: name,
                    onOpenRoom: { roomId in
                        showing = false
                        dismiss()
                        openRoom(roomId, notifier: notifier)
                    },
                    onOpenSpace: { spaceId in
                        showing = false
                        dismiss()
                        notifier.spaceToOpen = spaceId
                    })
            }
        }
        .task(id: userId) { await load() }
    }

    private func load() async {
        guard let client = session.client else { return }
        let stored = client.session
        guard let ids = await MutualRoomsLookup.fetch(homeserverUrl: stored.homeserverUrl,
                                                      accessToken: stored.accessToken, userId: userId),
              !ids.isEmpty else { return }
        var rooms: [MutualRoomsLookup.JoinedRoom] = []
        for id in ids {
            guard let details = try? await client.roomDetails(roomId: id) else { continue }
            rooms.append(MutualRoomsLookup.JoinedRoom(id: id, name: details.name, avatarUrl: details.avatarUrl,
                                                      isDirect: details.isDirect, isSpace: details.isSpace))
        }
        mutual = MutualRoomsLookup.entries(ids: ids, rooms: rooms)
    }
}

/// The mutual rooms and spaces, grouped, with a row for each
private struct MutualRoomsSheet: View {
    let mutual: MutualRooms
    let name: String
    let onOpenRoom: (String) -> Void
    let onOpenSpace: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            ThemedList {
                if !mutual.spaces.isEmpty {
                    Section {
                        ForEach(mutual.spaces) { entry in
                            Button { onOpenSpace(entry.id) } label: { row(entry) }
                        }
                    } header: {
                        Text(String(localized: "profile.mutualSpacesHeading"))
                    }
                }
                if !mutual.rooms.isEmpty {
                    Section {
                        ForEach(mutual.rooms) { entry in
                            Button { onOpenRoom(entry.id) } label: { row(entry) }
                        }
                    } header: {
                        Text(String(localized: "profile.mutualRoomsHeading"))
                    }
                }
            }
            .navigationTitle(L10n.format("profile.mutualTitle", name))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
            .tint(theme.control)
        }
    }

    private func row(_ entry: MutualEntry) -> some View {
        HStack(spacing: WZ.Space.space4) {
            AvatarView(name: entry.name, url: entry.avatarUrl, size: WZ.SizeAvatar.sm)
            Text(entry.name)
                .font(.wizard(WZ.FontSize.lg, .medium))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
        }
        .contentShape(Rectangle())
    }
}
