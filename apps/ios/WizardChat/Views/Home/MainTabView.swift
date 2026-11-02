import SwiftUI

struct MainTabView: View {
    enum Tab: String, CaseIterable { case home, dms, spaces, me }

    @ObservedObject var roomList: RoomListModel
    @EnvironmentObject private var notifier: MessageNotifier
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.theme) private var theme

    @State private var tab: Tab = .home
    @State private var paths: [Tab: [Route]] = [:]
    @State private var keyboardVisible = false
    @State private var showCreateSpace = false
    @State private var showInbox = false
    @State private var showExplore = false

    static let islandHeight: CGFloat = WZ.Size.tabBar + WZ.Space.space5 + WZ.Space.space1
    static let callBarHeight: CGFloat = WZ.Size.callControl + WZ.Space.space5

    var body: some View {
        ZStack {
            ForEach(Tab.allCases, id: \.self) { item in
                tabContent(item)
                    .environment(\.bottomBarInset, (showsIsland(in: item) ? Self.islandHeight : 0)
                                 + (showsCallBar(in: item) ? Self.callBarHeight : 0))
                    .opacity(tab == item ? 1 : 0)
                    .allowsHitTesting(tab == item)
                    .accessibilityHidden(tab != item)
            }
        }
        .overlay(alignment: .bottom) {
            VStack(spacing: WZ.Space.space4) {
                if showsCallBar(in: tab) {
                    CallBar {
                        if calls.room?.isDirect == true { calls.showCallScreen = true }
                        else if let id = calls.room?.id { show(id) }
                    }
                        .padding(.horizontal, WZ.Space.space6)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                if showsIsland(in: tab) {
                    TabIsland(roomList: roomList, selected: tab) { select($0) }
                        .padding(.horizontal, WZ.Space.space6)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.bottom, WZ.Space.space1)
            .animation(.easeOut(duration: WZ.MotionDuration.normal), value: calls.isInCall)
        }
        .overlay(alignment: .top) {
            CopyToastView().padding(.top, WZ.Space.space2)
        }
        .overlay(alignment: .top) {
            ConnectionBanner().padding(.top, WZ.Space.space1)
        }
        .animation(.spring(duration: WZ.MotionDuration.slow), value: session.syncState == .offline || session.syncState == .error)
        .overlay(alignment: .top) {
            if let call = calls.incoming {
                IncomingCallBanner(call: call)
                    .padding(.top, WZ.Space.space2)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: WZ.MotionDuration.slow), value: calls.incoming)
        .fullScreenCover(isPresented: $calls.showCallScreen) { DMCallScreen() }
        .onChange(of: totalUnread, initial: true) { _, count in notifier.updateBadge(count) }
        .onChange(of: roomList.joinedRooms.map(\.id), initial: true) { _, _ in ShareSender.publishRooms(roomList) }
        .onOpenURL { url in
            guard url.scheme == "wizardchat" else { return }
            Task { await ShareSender.sendPending(roomList: roomList, notifier: notifier) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await ShareSender.sendPending(roomList: roomList, notifier: notifier) } }
        }
        .onChange(of: roomList.isLoaded, initial: true) { _, loaded in
            if loaded { Task { await ShareSender.sendPending(roomList: roomList, notifier: notifier) } }
        }
        .animation(.easeOut(duration: WZ.MotionDuration.normal), value: keyboardVisible)
        .animation(.easeOut(duration: WZ.MotionDuration.normal), value: showsIsland(in: tab))
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
        .onChange(of: notifier.roomToOpen) { _, _ in openNotificationRoom() }
        .onAppear(perform: openNotificationRoom)
        .onChange(of: roomList.isLoaded) { _, _ in openNotificationRoom() }
        .sheet(isPresented: $showInbox) {
            InboxView(roomList: roomList, onOpenRoom: show, onOpenSpace: showSpace)
        }
        .sheet(isPresented: $showCreateSpace) {
            CreateSpaceView { spaceId in showSpace(spaceId) }
        }
        .sheet(isPresented: $showExplore) {
            ExploreView(roomList: roomList) { roomId in
                if roomList.room(id: roomId) != nil { show(roomId) } else { showSpace(roomId) }
            }
        }
    }

    private var totalUnread: Int {
        roomList.joinedRooms.reduce(0) { $0 + Int($1.unreadCount) }
    }

    @ViewBuilder
    private func tabContent(_ item: Tab) -> some View {
        switch item {
        case .me:
            SettingsView(isTab: true)
        default:
            NavigationStack(path: binding(for: item)) {
                Group {
                    switch item {
                    case .home: RoomListScreen(roomList: roomList, selection: .home) { showInbox = true }
                    case .dms: RoomListScreen(roomList: roomList, selection: .dms) { showInbox = true }
                    default: SpacesScreen(roomList: roomList, onCreateSpace: { showCreateSpace = true },
                                          onExplore: { showExplore = true })
                    }
                }
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .room(let id), .chat(let id):
                        if let room = roomList.room(id: id) {
                            if room.isVoice, case .room = route {
                                VoiceRoomView(room: room) { paths[item, default: []].append(.chat(id)) }
                            } else {
                                RoomView(room: room, client: roomList.client).id(room.id)
                            }
                        } else {
                            ProgressView().tint(theme.accent)
                        }
                    case .space(let id):
                        RoomListScreen(roomList: roomList, selection: .space(id))
                    }
                }
            }
        }
    }

    private func showsIsland(in item: Tab) -> Bool {
        guard !keyboardVisible else { return false }
        return !(paths[item] ?? []).contains {
            switch $0 {
            case .room, .chat: return true
            case .space: return false
            }
        }
    }

    private func showsCallBar(in item: Tab) -> Bool {
        guard calls.isInCall, !keyboardVisible, let id = calls.room?.id else { return false }
        return paths[item]?.last != .room(id)
    }

    private func binding(for item: Tab) -> Binding<[Route]> {
        Binding(get: { paths[item] ?? [] }, set: { paths[item] = $0 })
    }

    private func select(_ item: Tab) {
        if item == tab { paths[item] = [] } else { tab = item }
    }

    private func show(_ roomId: String) {
        let room = roomList.room(id: roomId)
        if room?.isDirect == true {
            tab = .dms
            paths[.dms] = [.room(roomId)]
        } else if let space = roomList.space(containing: roomId) {
            tab = .spaces
            paths[.spaces] = [.space(space.id), .room(roomId)]
        } else {
            tab = .home
            paths[.home] = [.room(roomId)]
        }
    }

    private func showSpace(_ spaceId: String) {
        tab = .spaces
        paths[.spaces] = [.space(spaceId)]
    }

    private func openNotificationRoom() {
        guard let roomId = notifier.roomToOpen, roomList.isLoaded else { return }
        notifier.roomToOpen = nil
        showInbox = false; showCreateSpace = false; showExplore = false
        show(roomId)
    }
}

private struct BottomBarInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    var bottomBarInset: CGFloat {
        get { self[BottomBarInsetKey.self] }
        set { self[BottomBarInsetKey.self] = newValue }
    }
}

extension View {
    func clearsBottomBar() -> some View { modifier(ClearsBottomBar()) }
}

private struct ClearsBottomBar: ViewModifier {
    @Environment(\.bottomBarInset) private var inset
    func body(content: Content) -> some View { content.safeAreaPadding(.bottom, inset) }
}

private struct TabIsland: View {
    @ObservedObject var roomList: RoomListModel
    let selected: MainTabView.Tab
    let onSelect: (MainTabView.Tab) -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space0) {
            item(.home, title: "room.home", icon: "house", unread: roomList.unreadState(of: .home))
            item(.dms, title: "roomSwitcher.prefixDms", icon: "chat-circle", unread: roomList.unreadState(of: .dms))
            item(.spaces, title: "room.settings.permissions.groups.spaces", icon: "stack", unread: spacesUnread)
            profileItem
        }
        .padding(WZ.Space.space2)
        .floatingGlass(in: Capsule())
        .sensoryFeedback(.selection, trigger: selected)
    }

    private var spacesUnread: UnreadState {
        roomList.spaces.reduce(into: UnreadState()) { state, space in
            let unread = roomList.unreadState(of: .space(space.id))
            state.unread = state.unread || unread.unread
            state.mention = state.mention || unread.mention
        }
    }

    private func item(_ tab: MainTabView.Tab, title: LocalizedStringKey, icon: String, unread: UnreadState) -> some View {
        let isSelected = selected == tab
        return Button { onSelect(tab) } label: {
            VStack(spacing: WZ.Space.space1) {
                Image.ph(icon, isSelected ? .fill : .regular)
                    .font(.system(size: WZ.SizeIcon.lg))
                    .frame(height: WZ.Space.space8)
                    .overlay(alignment: .topTrailing) { dot(unread).offset(x: WZ.Space.space3, y: -WZ.Space.space0) }
                Text(title).font(.wizard(WZ.FontSize.xs, .semibold))
            }
            .foregroundStyle(isSelected ? theme.accent : theme.textMuted)
            .frame(maxWidth: .infinity, minHeight: WZ.Space.space11)
            .background(isSelected ? theme.accent.opacity(0.14) : .clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var profileItem: some View {
        let isSelected = selected == .me
        let name = session.displayName ?? session.userId ?? ""
        return Button { onSelect(.me) } label: {
            VStack(spacing: WZ.Space.space1) {
                AvatarView(name: name, url: session.avatarUrl, size: WZ.SizeAvatar.sm)
                    .overlay(Circle().stroke(isSelected ? theme.accent : .clear, lineWidth: WZ.BorderWidth.thick).padding(-WZ.Space.space1))
                Text(String(localized: "mobileNav.you")).font(.wizard(WZ.FontSize.xs, .semibold))
            }
            .foregroundStyle(isSelected ? theme.accent : theme.textMuted)
            .frame(maxWidth: .infinity, minHeight: WZ.Space.space11)
            .background(isSelected ? theme.accent.opacity(0.14) : .clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "common.settings"))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    @ViewBuilder
    private func dot(_ unread: UnreadState) -> some View {
        if unread.unread {
            Circle()
                .fill(unread.mention ? theme.mention : theme.accent)
                .frame(width: WZ.Space.space4, height: WZ.Space.space4)
        }
    }
}
