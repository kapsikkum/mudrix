import WizardChatCore
import SwiftUI

enum Route: Hashable {
    case room(String)
    case space(String)
    case chat(String)
}

struct RoomListScreen: View {
    @ObservedObject var roomList: RoomListModel
    let selection: SidebarSelection
    var onOpenInbox: (() -> Void)?

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @State private var search = ""
    @State private var leaving: RoomSummary?
    @State private var showNewRoom = false
    @State private var showNewMessage = false
    @State private var showSpaceSettings = false

    private var title: String {
        switch selection {
        case .home: return String(localized: "room.home")
        case .dms: return String(localized: "room.dm.directMessages")
        case .space(let id): return roomList.space(id: id)?.name ?? String(localized: "explore.typeSpace")
        }
    }

    private var spaceId: String? {
        if case .space(let id) = selection { return id }
        return nil
    }

    private var rooms: [RoomSummary] {
        guard roomList.isLoaded else { return [] }
        let rooms = roomList.rooms(for: selection)
        guard !search.isEmpty else { return rooms }
        return rooms.filter { $0.displayName.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        List {
            if onOpenInbox != nil {
                VerificationBanner()
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }
            if !roomList.isLoaded {
                ForEach(0..<8, id: \.self) { _ in
                    SkeletonRow().listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            } else if rooms.isEmpty {
                Text(search.isEmpty ? emptyText : "home.noMatches")
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, WZ.Space.space9)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            ForEach(rooms) { room in
                NavigationLink(value: Route.room(room.id)) {
                    RoomRow(room: room,
                            showsHashIcon: !prefs.showRoomAvatars && !room.isDirect)
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                .listRowBackground(theme.bgPrimary)
                .listRowSeparator(.hidden)
                .swipeActions(edge: .leading) {
                    let unread = room.unreadCount > 0 || room.mentionCount > 0
                    Button {
                        Task { await roomList.setRead(room, read: unread) }
                    } label: {
                        Label(unread ? String(localized: "common.markRead") : String(localized: "home.markAsUnread"),
                              image: unread ? "ph-envelope-open-regular" : "ph-envelope-simple-regular")
                    }
                    .tint(theme.accent)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) { leaving = room } label: {
                        Label(String(localized: "common.leave"), image: "ph-sign-out-regular")
                    }
                }
                .contextMenu {
                    Button { Task { await roomList.setRead(room, read: true) } } label: {
                        Label(String(localized: "common.markRead"), image: "ph-envelope-open-regular")
                    }
                    Button { copyToClipboard("https://matrix.to/#/\(room.id)", message: String(localized: "timeline.linkCopied")) } label: {
                        Label(String(localized: "common.copyLink"), image: "ph-link-simple-regular")
                    }
                    Divider()
                    Button(role: .destructive) { leaving = room } label: {
                        Label(String(localized: "common.leave"), image: "ph-sign-out-regular")
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.bgPrimary.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
        // Under the title: iOS 26 would otherwise put it at the bottom, behind the tab island.
        // Typing searches everything, not just this list.
        .overlay {
            if !search.trimmingCharacters(in: .whitespaces).isEmpty {
                GlobalSearchResults(roomList: roomList, query: search)
            }
        }
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic),
                    prompt: Text(String(localized: "home.searchRoomsPeopleMessages")))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showNewMessage = true } label: { Label(String(localized: "common.newMessage"), image: "ph-note-pencil-regular") }
                    if selection != .dms {
                        Button { showNewRoom = true } label: { Label(String(localized: "rooms.newRoom"), image: "ph-hash-straight-regular") }
                    }
                    if spaceId != nil {
                        Divider()
                        Button { showSpaceSettings = true } label: { Label(String(localized: "home.spaceSettings"), image: "ph-gear-regular") }
                    }
                } label: {
                    Image("ph-plus-regular")
                }
                .accessibilityLabel(String(localized: "home.new"))
            }
            if let onOpenInbox {
                ToolbarItem(placement: .topBarTrailing) {
                    InboxButton(roomList: roomList, action: onOpenInbox)
                }
            }
        }
        .sheet(isPresented: $showNewMessage) { UserPickerView(mode: .directMessage) }
        .sheet(isPresented: $showNewRoom) { CreateRoomView(spaceId: spaceId) }
        .sheet(isPresented: $showSpaceSettings) {
            if let spaceId, let space = roomList.space(id: spaceId) {
                SpaceSettingsView(space: space, roomList: roomList)
            }
        }
        .confirmationDialog(
            L10n.format("room.leaveNamed2", leaving?.displayName ?? ""),
            isPresented: Binding(get: { leaving != nil }, set: { if !$0 { leaving = nil } }),
            titleVisibility: .visible
        ) {
            Button(String(localized: "common.leave"), role: .destructive) {
                if let room = leaving { Task { await roomList.leave(room) } }
            }
        }
    }

    private var emptyText: LocalizedStringKey {
        switch selection {
        case .dms: return "home.noDirectMessagesYet"
        default: return "home.noRoomsHereYet"
        }
    }
}

private struct InboxButton: View {
    @ObservedObject var roomList: RoomListModel
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        let mentions = !roomList.mentionRooms.isEmpty
        let badge = mentions || !roomList.invites.isEmpty
        Button(action: action) {
            Image("ph-tray-regular")
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle()
                            .fill(mentions ? theme.mention : theme.accent)
                            .frame(width: WZ.Space.space4, height: WZ.Space.space4)
                            .offset(x: WZ.Space.space2, y: -WZ.Space.space1)
                    }
                }
        }
        .accessibilityLabel(String(localized: "inbox.title"))
    }
}

struct RoomRow: View {
    let room: RoomSummary
    let showsHashIcon: Bool
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    private var avatarSize: CGFloat { prefs.roomAvatarSize }
    private var inCall: Bool { room.isVoice && !room.callParticipants.isEmpty }

    private func typeIcon(size: CGFloat) -> some View {
        Icon(room.isVoice ? "speaker-high" : "hash-straight", room.isVoice ? .fill : .bold, size: size)
            .foregroundStyle(inCall ? theme.success : theme.textMuted)
    }
    private var hasUnread: Bool { room.unreadCount > 0 || room.mentionCount > 0 }

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            if showsHashIcon {
                typeIcon(size: avatarSize * 0.45)
                    .frame(width: avatarSize, height: avatarSize)
                    .background(theme.fill, in: Circle())
            } else {
                AvatarView(name: room.displayName, url: room.avatarUrl, size: avatarSize)
                    .overlay(alignment: .bottomTrailing) {
                        if !room.isDirect {
                            typeIcon(size: WZ.SizeIcon.xs)
                                .frame(width: WZ.Space.space7, height: WZ.Space.space7)
                                .background(theme.bgPrimary, in: Circle())
                                .overlay(Circle().stroke(inCall ? theme.success : theme.border, lineWidth: WZ.BorderWidth.thin))
                                .offset(x: WZ.Space.space2, y: WZ.Space.space2)
                        }
                    }
            }
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.lg, hasUnread ? .semibold : .regular))
                    .foregroundStyle(hasUnread ? theme.textPrimary : theme.textPrimary.opacity(0.85))
                    .lineLimit(1)
                if room.isVoice && !room.callParticipants.isEmpty {
                    ParticipantStack(roomId: room.id, userIds: room.callParticipants)
                }
            }
            Spacer(minLength: 6)
            if room.mentionCount > 0 {
                UnreadBadge(count: room.mentionCount, isMention: true)
            } else if room.unreadCount > 0 {
                UnreadBadge(count: room.unreadCount, isMention: false)
            }
        }
        .padding(.vertical, prefs.roomRowPadding)
        .contentShape(Rectangle())
    }
}

struct SkeletonRow: View {
    @Environment(\.theme) private var theme
    @State private var pulse = false

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            Circle().fill(theme.fill).frame(width: WZ.Space.space10, height: WZ.Space.space10)
            Capsule().fill(theme.fill).frame(width: WZ.SizeAvatar.xxl, height: WZ.Space.space5)
        }
        .padding(.vertical, WZ.Space.space3)
        .opacity(pulse ? 1 : 0.5)
        .animation(.easeInOut(duration: 0.8).repeatForever(), value: pulse)
        .onAppear { pulse = true }
    }
}
