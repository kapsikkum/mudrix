import WizardChatCore
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

/// The top of the Home list: a greeting, what is left to set up, what needs catching up on and the latest rooms.
/// Rows of a `List`; the unverified-session reminder is the `VerificationBanner` above it.
struct HomeWelcome: View {
    @ObservedObject var roomList: RoomListModel
    let onOpenInbox: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var showAccount = false

    private var name: String {
        if let display = session.displayName, !display.isEmpty { return display }
        return TimelineModel.localpart(session.userId ?? "")
    }

    var body: some View {
        let invites = roomList.invites
        let mentions = roomList.mentionRooms
        let recent = recentRooms(roomList.joinedRooms)
        Group {
            Text(L10n.format("timeline.home.greeting", name))
                .font(.wizard(WZ.FontSize.xxl, .bold))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(2)
                .welcomeRow()
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
                    NavigationLink(value: Route.room(room.id)) {
                        card(title: room.displayName, subtitle: String(localized: "inbox.youWereMentioned"),
                             avatar: room.avatarUrl, unread: room.mentionCount, mention: true)
                    }
                    .welcomeRow()
                }
            }
            if !recent.isEmpty {
                heading(String(localized: "timeline.home.recentHeading"))
                ForEach(recent) { room in
                    NavigationLink(value: Route.room(room.id)) {
                        card(title: room.displayName, subtitle: label(room), avatar: room.avatarUrl,
                             unread: room.mentionCount > 0 ? room.mentionCount : room.unreadCount,
                             mention: room.mentionCount > 0, showsUnreadText: true)
                    }
                    .welcomeRow()
                }
            }
        }
        .sheet(isPresented: $showAccount) {
            NavigationStack {
                AccountSettings()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { showAccount = false } }
                    }
            }
        }
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
