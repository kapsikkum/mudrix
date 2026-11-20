import MudrixCore
import SwiftUI

/// How many of the latest rooms "Jump back in" lists
private let recentRoomCount = 6

/// The rooms to jump back into: joined, not spaces, newest activity first
func recentRooms(_ rooms: [RoomSummary]) -> [RoomSummary] {
    Array(rooms
        .filter { !$0.isSpace && $0.lastActivity != nil }
        .sorted { ($0.lastActivity ?? 0) > ($1.lastActivity ?? 0) }
        .prefix(recentRoomCount))
}

/// The top of the Home list: what is left to set up, what needs catching up on, the people now playing or listening
/// to something, and the latest rooms. Rows of a `List`; the unverified-session reminder is the
/// `VerificationBanner` above it.
struct HomeWelcome: View {
    @ObservedObject var roomList: RoomListModel
    let onOpenInbox: () -> Void
    /// Opens a room through the shell's path; without it the cards are NavigationLinks
    var onOpenRoom: ((String) -> Void)?

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var showAccount = false
    @State private var friends: [FriendActivity] = []

    /// One direct-chat partner with a live activity, newest first
    struct FriendActivity: Identifiable {
        let roomId: String
        let userId: String
        let name: String
        let avatar: String?
        let activity: ProfileActivity
        var id: String { userId }
    }

    var body: some View {
        let invites = roomList.invites
        let mentions = roomList.mentionRooms
        let recent = recentRooms(roomList.joinedRooms)
        Group {
            if session.avatarUrl == nil {
                heading(String(localized: "timeline.home.setupHeading"))
                Button { showAccount = true } label: {
                    card(title: String(localized: "timeline.home.profileTitle"), subtitle: String(localized: "timeline.home.profileDesc"),
                         icon: "ph-camera-regular", unread: 0, mention: false)
                }
                .buttonStyle(.plain)
                .welcomeRow()
            }
            if !invites.isEmpty || !mentions.isEmpty {
                heading(String(localized: "timeline.home.catchUpHeading"), action: String(localized: "timeline.home.inboxLink"),
                        onAction: onOpenInbox)
                ForEach(invites.prefix(3)) { invite in
                    Button(action: onOpenInbox) {
                        card(title: invite.displayName, subtitle: String(localized: "timeline.home.invitation"),
                             avatar: invite.avatarUrl, unread: 0, mention: false)
                    }
                    .buttonStyle(.plain)
                    .welcomeRow()
                }
                ForEach(mentions.prefix(3)) { room in
                    roomLink(room.id) {
                        card(title: room.displayName, subtitle: String(localized: "inbox.youWereMentioned"),
                             avatar: room.avatarUrl, unread: room.mentionCount, mention: true)
                    }
                    .welcomeRow()
                }
            }
            if !friends.isEmpty {
                heading(String(localized: "timeline.home.friendsHeading"))
                ForEach(friends) { friend in
                    roomLink(friend.roomId) {
                        card(title: friend.name, subtitle: ProfileActivityText.activityLine(friend.activity),
                             avatar: friend.avatar, unread: 0, mention: false)
                    }
                    .welcomeRow()
                }
            }
            if !recent.isEmpty {
                heading(String(localized: "timeline.home.recentHeading"))
                ForEach(recent) { room in
                    roomLink(room.id) {
                        card(title: room.displayName, subtitle: label(room), avatar: room.avatarUrl,
                             unread: room.mentionCount > 0 ? room.mentionCount : room.unreadCount,
                             mention: room.mentionCount > 0, showsUnreadText: true)
                    }
                    .welcomeRow()
                }
            }
            searchTip
        }
        .task(id: roomList.joinedRooms.count) { await loadFriends() }
        .sheet(isPresented: $showAccount) {
            NavigationStack {
                AccountSettings()
                    .navigationTitle(String(localized: "settings.account.title"))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(String(localized: "common.done")) { showAccount = false }
                        }
                    }
            }
            .presentationDragIndicator(.visible)
        }
    }

    /// A card that opens a room: a plain button through the shell's path (no disclosure chevron in
    /// the list), or a NavigationLink when the screen has no path of its own.
    @ViewBuilder
    private func roomLink<Content: View>(_ roomId: String, @ViewBuilder content: () -> Content) -> some View {
        if let onOpenRoom {
            Button { onOpenRoom(roomId) } label: { content() }
                .buttonStyle(.plain)
        } else {
            NavigationLink(value: Route.room(roomId)) { content() }
        }
    }

    /// "Playing X" / "Listening to Y" for each direct-chat partner sharing an activity right now
    private func loadFriends() async {
        guard let client = session.client else { return }
        var seen = Set<String>()
        var rows: [FriendActivity] = []
        for room in roomList.joinedRooms where room.isDirect {
            guard let userId = room.dmUserId, !seen.contains(userId) else { continue }
            seen.insert(userId)
            guard let raw = try? await client.profileFields(userId: userId) else { continue }
            let live = ProfileFields.live(ProfileFields.parse(raw).activities)
            guard let activity = live.first else { continue }
            rows.append(FriendActivity(roomId: room.id, userId: userId, name: room.dmUserName ?? userId,
                                       avatar: room.dmUserAvatar, activity: activity))
        }
        friends = Array(rows.prefix(20))
    }

    /// A quiet hint at the bottom of Home: the phone's search icon instead of the desktop's keyboard shortcut
    private var searchTip: some View {
        HStack(spacing: WZ.Space.space3) {
            Image("ph-magnifying-glass-regular")
                .font(.system(size: WZ.SizeIcon.sm))
                .foregroundStyle(theme.textMuted)
            Text(String(localized: "timeline.home.searchHintTouch"))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
        }
        .padding(.vertical, WZ.Space.space3)
        .welcomeRow()
    }

    private func label(_ room: RoomSummary) -> String {
        if room.isDirect { return String(localized: "timeline.home.dmLabel") }
        if room.isVoice { return String(localized: "timeline.home.voiceLabel") }
        return String(localized: "timeline.home.roomLabel")
    }

    private func heading(_ title: String, action: String? = nil, onAction: (() -> Void)? = nil) -> some View {
        HStack {
            Text(title).font(.wizard(WZ.FontSize.sm, .semibold)).foregroundStyle(theme.textMuted)
            Spacer()
            if let action, let onAction {
                Button(action, action: onAction)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.accent)
                    .buttonStyle(.plain)
            }
        }
        .padding(.top, WZ.Space.space3)
        .welcomeRow()
    }

    private func card(title: String, subtitle: String, avatar: String? = nil, icon: String? = nil, unread: Int,
                      mention: Bool, showsUnreadText: Bool = false) -> some View {
        HStack(spacing: WZ.Space.space4) {
            if let icon {
                Image(icon)
                    .font(.system(size: WZ.SizeIcon.lg))
                    .foregroundStyle(theme.accent)
                    .frame(width: WZ.SizeAvatar.sm, height: WZ.SizeAvatar.sm)
            } else {
                AvatarView(name: title, url: avatar, size: WZ.SizeAvatar.sm)
            }
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(title)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                Text(showsUnreadText && unread > 0 && !mention
                     ? "\(subtitle) \u{00B7} \(L10n.format("timeline.home.unreadBadge", unread))"
                     : subtitle)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer(minLength: 4)
            if unread > 0 { UnreadBadge(count: unread, isMention: mention) }
        }
        .padding(WZ.Space.space4)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .contentShape(Rectangle())
    }
}

private extension View {
    /// A row of the Home list that looks like a card or heading rather than a room
    func welcomeRow() -> some View {
        self
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }
}
