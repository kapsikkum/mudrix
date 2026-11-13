import SwiftUI
import WizardChatCore

/// Where the Modern rail's selection is kept on this device, so a relaunch returns to it
enum RailSelectionStore {
    private static let key = "spaceRail.selected"

    static func load() -> String? {
        UserDefaults.standard.string(forKey: key)
    }

    static func save(_ selection: SidebarSelection) {
        if case .space(let id) = selection {
            UserDefaults.standard.set(id, forKey: key)
        } else {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
}

/// The Modern shell: a rail of Direct messages and the spaces beside one content pane, with your card floating over the bottom
struct ModernShell: View {
    @ObservedObject var roomList: RoomListModel
    @Binding var selection: SidebarSelection
    @Binding var path: [Route]
    let onOpenInbox: () -> Void
    let onCreateSpace: () -> Void
    let onExplore: () -> Void
    let onOpenCall: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @State private var dockHeight: CGFloat = 0
    @State private var showOwnProfile = false
    @State private var restored = false

    private var reduceMotion: Bool { prefs.reducesMotion(systemSetting: systemReduceMotion) }

    private var chatOpen: Bool {
        switch path.last {
        case .room?, .chat?: return true
        default: return false
        }
    }

    private var railSpaces: [RailSpace] {
        roomList.spaces.map { RailSpace(id: $0.id, name: $0.name, avatarUrl: $0.avatarUrl) }
    }

    private var railSlots: [RailSlot] {
        let rooms = roomList.joinedRooms.filter { !$0.isSpace }.map { room in
            RailRoom(spaceIds: Set(roomList.spaces.map(\.id).filter { roomList.spaceRooms[$0]?.contains(room.id) == true }),
                     unread: room.unreadCount > 0, mentions: room.mentionCount)
        }
        return SpaceRail.slots(spaces: railSpaces, rooms: rooms)
    }

    var body: some View {
        ZStack(alignment: .leading) {
            pane
                .padding(.leading, chatOpen ? 0 : 72)
            ModernRail(spaces: roomList.spaces, slots: railSlots, selection: selection, bottomInset: dockHeight,
                       onSelect: choose, onCreateSpace: onCreateSpace, onExplore: onExplore)
                .overlay(alignment: .trailing) {
                    Rectangle().fill(theme.border).frame(width: WZ.BorderWidth.thin).ignoresSafeArea()
                }
                .offset(x: chatOpen ? -72 : 0)
        }
        .overlay(alignment: .bottom) {
            if !chatOpen { dock }
        }
        .background(theme.bgPrimary.ignoresSafeArea())
        .animation(reduceMotion ? nil : .easeOut(duration: WZ.MotionDuration.normal), value: chatOpen)
        .fullScreenCover(isPresented: $showOwnProfile) {
            if let userId = session.userId {
                ModernOwnProfile(userId: userId)
            }
        }
        .onChange(of: selection) { _, next in RailSelectionStore.save(next) }
        .onChange(of: roomList.isLoaded, initial: true) { _, _ in syncRailWithSpaces() }
        .onChange(of: roomList.spaces.map(\.id)) { _, _ in syncRailWithSpaces() }
    }

    private var pane: some View {
        ZStack {
            NavigationStack(path: $path) {
                paneRoot
                    .navigationDestination(for: Route.self) { route in
                        destination(for: route)
                    }
            }
            .id(selection)
            .transition(.opacity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var paneRoot: some View {
        if case .space(let id) = selection {
            RoomListScreen(roomList: roomList, selection: .space(id))
                .contentMargins(.bottom, dockHeight, for: .scrollContent)
        } else {
            RoomListScreen(roomList: roomList, selection: selection, onOpenInbox: onOpenInbox, modernHeader: true)
                .contentMargins(.bottom, dockHeight, for: .scrollContent)
        }
    }

    @ViewBuilder
    private func destination(for route: Route) -> some View {
        switch route {
        case .room(let id), .chat(let id):
            if let room = roomList.room(id: id) {
                if room.isVoice, case .room = route {
                    VoiceRoomView(room: room, client: roomList.client) { path.append(.chat(id)) }
                } else {
                    RoomView(room: room, client: roomList.client).roomRoles(for: room.id).id(room.id)
                }
            } else {
                ProgressView().tint(theme.accent)
            }
        case .space(let id):
            RoomListScreen(roomList: roomList, selection: .space(id))
        }
    }

    private var dock: some View {
        VStack(spacing: WZ.Space.space2) {
            if calls.isInCall, calls.room != nil {
                CallBar(onOpen: onOpenCall)
                    .padding(.horizontal, WZ.Space.space6)
            }
            ModernUserCard(inboxBadge: !roomList.mentionRooms.isEmpty || !roomList.invites.isEmpty,
                           inboxMention: !roomList.mentionRooms.isEmpty,
                           onProfile: { showOwnProfile = true }, onInbox: onOpenInbox)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { dockHeight = $0 }
    }

    private func choose(_ next: SidebarSelection) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: WZ.MotionDuration.fast)) {
            selection = next
            path = []
        }
    }

    private func syncRailWithSpaces() {
        guard roomList.isLoaded else { return }
        let ids = roomList.spaces.map(\.id)
        if case .space(let id) = selection, !ids.contains(id) {
            selection = .home
        }
        guard !restored, !ids.isEmpty else { return }
        restored = true
        guard selection == .home, path.isEmpty,
              let saved = SpaceRail.selected(RailSelectionStore.load(), in: railSpaces) else { return }
        selection = .space(saved.id)
    }
}

/// The rail: Direct messages above a divider, then each top-level space, then the add and explore menu
private struct ModernRail: View {
    let spaces: [SpaceSummary]
    let slots: [RailSlot]
    let selection: SidebarSelection
    let bottomInset: CGFloat
    let onSelect: (SidebarSelection) -> Void
    let onCreateSpace: () -> Void
    let onExplore: () -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: WZ.Space.space0) {
            directMessages
            Rectangle()
                .fill(theme.border)
                .frame(height: WZ.BorderWidth.thin)
                .padding(.horizontal, WZ.Space.space6)
            ScrollView {
                LazyVStack(spacing: WZ.Space.space2) {
                    ForEach(spaces) { space in
                        spaceItem(space)
                    }
                    RailAddButton(onCreateSpace: onCreateSpace, onExplore: onExplore)
                }
                .padding(.vertical, WZ.Space.space2)
            }
            .contentMargins(.bottom, bottomInset, for: .scrollContent)
        }
        .frame(width: 72)
        .frame(maxHeight: .infinity)
        .background(theme.bgSecondary.ignoresSafeArea())
    }

    private var directMessages: some View {
        let first = slots.first
        let selected = selection == .home
        return RailSlotView(label: String(localized: "room.dm.directMessages"), selected: selected,
                            unread: first?.unread == true, mentions: first?.mentions ?? 0,
                            action: { onSelect(.home) }) {
            Icon("chat-circle", selected ? .fill : .regular, size: WZ.SizeIcon.lg)
                .foregroundStyle(selected ? theme.textOnAccent : theme.textMuted)
                .frame(width: 44, height: 44)
                .background(selected ? theme.accent : theme.fill,
                            in: RoundedRectangle(cornerRadius: selected ? 8 : 16, style: .continuous))
        }
        .padding(.top, WZ.Space.space4)
    }

    private func spaceItem(_ space: SpaceSummary) -> some View {
        let slot = slots.first { $0.space?.id == space.id }
        let selected = selection == .space(space.id)
        let unread = slot?.unread == true
        let mentions = slot?.mentions ?? 0
        return RailSlotView(label: railLabel(space.name, unread: unread, mentions: mentions), selected: selected,
                            unread: unread, mentions: mentions, action: { onSelect(.space(space.id)) }) {
            AvatarView(name: space.name, url: space.avatarUrl, size: 44, cornerRadius: selected ? 8 : 16)
        }
    }

    private func railLabel(_ name: String, unread: Bool, mentions: Int) -> String {
        if mentions == 1 {
            return name + ". " + String(localized: "inbox.youWereMentioned")
        }
        if mentions > 1 {
            return name + ". " + L10n.format("inbox.youWereMentionedTimes", mentions)
        }
        if unread {
            return name + ". " + String(localized: "timeline.unreadMessages")
        }
        return name
    }
}

/// One rail item: its icon in a 72 by 56 slot, the selection bar or unread dash on its left edge, and the mention badge
private struct RailSlotView<Content: View>: View {
    let label: String
    let selected: Bool
    let unread: Bool
    let mentions: Int
    let action: () -> Void
    @ViewBuilder let content: () -> Content

    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            content()
                .overlay(alignment: .bottomTrailing) {
                    if let text = SpaceRail.badge(mentions) {
                        Text(text)
                            .font(.wizard(WZ.FontSize.xs, .bold))
                            .foregroundStyle(theme.textOnAccent)
                            .lineLimit(1)
                            .padding(.horizontal, WZ.Space.space2)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(theme.mention, in: Capsule())
                            .overlay(Capsule().stroke(theme.bgSecondary, lineWidth: WZ.BorderWidth.thick))
                            .offset(x: WZ.Space.space1, y: WZ.Space.space1)
                    }
                }
                .frame(width: 72, height: 56)
                .overlay(alignment: .leading) { indicator }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder
    private var indicator: some View {
        if selected {
            UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0, bottomTrailingRadius: 2, topTrailingRadius: 2)
                .fill(theme.accent)
                .frame(width: 4, height: 32)
        } else if unread {
            UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0, bottomTrailingRadius: 2, topTrailingRadius: 2)
                .fill(theme.textPrimary)
                .frame(width: 4, height: 7)
        }
    }
}

/// The add and explore menu at the foot of the rail
private struct RailAddButton: View {
    let onCreateSpace: () -> Void
    let onExplore: () -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        Menu {
            Button { onCreateSpace() } label: {
                Label(menu: String(localized: "space.addSpace"), icon: "ph-plus-circle-regular")
            }
            Button { onExplore() } label: {
                Label(menu: String(localized: "explore.title"), icon: "ph-compass-regular")
            }
        } label: {
            Icon("plus", .bold, size: WZ.SizeIcon.md)
                .foregroundStyle(theme.textMuted)
                .frame(width: 44, height: 44)
                .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        }
        .accessibilityLabel(String(localized: "space.addSpace"))
        .padding(.vertical, WZ.Space.space3)
    }
}

/// Your card floating over the bottom: your avatar and status open your profile, the bell opens the inbox
private struct ModernUserCard: View {
    let inboxBadge: Bool
    let inboxMention: Bool
    let onProfile: () -> Void
    let onInbox: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    private var name: String { session.displayName ?? session.userId ?? "" }

    private var status: String {
        if let custom = session.customStatus, custom.expiresAt.map({ Double($0) / 1000 > Date.now.timeIntervalSince1970 }) ?? true {
            return custom.text
        }
        return prefs.showPresence ? String(localized: "presence.online") : String(localized: "presence.offline")
    }

    var body: some View {
        HStack(spacing: WZ.Space.space3) {
            Button(action: onProfile) {
                HStack(spacing: WZ.Space.space3) {
                    CosmeticAvatar(userId: session.userId ?? "", name: name, url: session.avatarUrl, size: WZ.SizeAvatar.md)
                    VStack(alignment: .leading, spacing: WZ.Space.space0) {
                        Text(name)
                            .font(.wizard(WZ.FontSize.md, .bold))
                            .foregroundStyle(theme.textPrimary)
                            .lineLimit(1)
                        Text(status)
                            .font(.wizard(WZ.FontSize.xs))
                            .foregroundStyle(theme.textMuted)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, WZ.Space.space2)
                .padding(.vertical, WZ.Space.space1)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button(action: onInbox) {
                Icon("bell", size: WZ.SizeIcon.md)
                    .foregroundStyle(theme.textMuted)
                    .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                    .overlay(alignment: .topTrailing) {
                        if inboxBadge {
                            Circle()
                                .fill(inboxMention ? theme.mention : theme.accent)
                                .frame(width: WZ.Space.space4, height: WZ.Space.space4)
                                .offset(x: WZ.Space.space2, y: -WZ.Space.space1)
                        }
                    }
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "inbox.title"))
        }
        .padding(.horizontal, WZ.Space.space3)
        .padding(.vertical, WZ.Space.space2)
        .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: WZ.Shadow.md.color, radius: WZ.Shadow.md.blur / 2, x: WZ.Shadow.md.x, y: WZ.Shadow.md.y)
        .padding(.horizontal, WZ.Space.space4)
        .padding(.bottom, WZ.Space.space4)
    }
}

/// Your profile full screen, with Settings one tap away
private struct ModernOwnProfile: View {
    let userId: String
    @State private var showSettings = false

    var body: some View {
        UserProfileSheet(userId: userId, onOpenSettings: { showSettings = true })
            .fullScreenCover(isPresented: $showSettings) {
                SettingsView(isTab: false)
            }
    }
}
