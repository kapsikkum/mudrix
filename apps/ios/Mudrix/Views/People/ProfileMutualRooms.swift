import SwiftUI
import MudrixCore

extension MutualRooms {
    /// One count for the profile header line and the Mutual Rooms tab badge: rooms plus spaces, so the two cannot disagree
    var total: Int { rooms.count + spaces.count }
}

extension MutualRoomsLookup {
    /// The rooms and spaces `userId` shares with us; nil when the server can't tell
    @MainActor
    static func load(client: MudrixClient, userId: String) async -> MutualRooms? {
        let stored = client.session
        guard let ids = await fetch(homeserverUrl: stored.homeserverUrl, accessToken: stored.accessToken, userId: userId) else {
            return nil
        }
        var rooms: [JoinedRoom] = []
        for id in ids {
            guard let details = try? await client.roomDetails(roomId: id) else { continue }
            rooms.append(JoinedRoom(id: id, name: details.name, avatarUrl: details.avatarUrl,
                                    isDirect: details.isDirect, isSpace: details.isSpace))
        }
        return entries(ids: ids, rooms: rooms)
    }
}

/// The mutual rooms and spaces on a profile's Mutual Rooms tab, grouped, with a row for each; rows of the profile's list
struct MutualRoomsSection: View {
    let mutual: MutualRooms?
    let onOpenRoom: (String) -> Void
    let onOpenSpace: (String) -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        Group {
            if let mutual {
                if mutual.isEmpty {
                    Section {
                        Text(String(localized: "profile.mutualEmpty"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                    }
                }
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
