import MudrixCore
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
    /// Opens a room through the shell's navigation path. A row with this is a plain button, so the
    /// list does not add the trailing disclosure chevron that a NavigationLink row gets.
    var onOpenRoom: ((String) -> Void)?
    /// The Modern shell's Direct Messages pane: a header under the title instead of the top bar's + and inbox
    var modernHeader = false

    @EnvironmentObject private var prefs: AppPreferences
    @ObservedObject private var mudrix = MudrixRoomStates.shared
    @Environment(\.theme) private var theme
    @State private var search = ""
    @State private var searchOpen = false
    @State private var showSort = false
    @FocusState private var searchFocused: Bool
    @State private var leaving: RoomSummary?
    @State private var showNewRoom = false
    @State private var showNewMessage = false
    @State private var showSpaceSettings = false
    @State private var reordering = false
    @State private var newSectionFor: String?
    @State private var renaming: RoomSection?
    @State private var deleting: RoomSection?
    @State private var sectionName = ""
    @State private var sectionError: String?
    @State private var collapsed = Set(UserDefaults.standard.stringArray(forKey: "roomList.collapsed") ?? [])
    /// Groups that start closed (the Archived one) remember being opened here
    @State private var expanded = Set(UserDefaults.standard.stringArray(forKey: "roomList.expanded") ?? [])

    private var title: String {
        switch selection {
        case .home: return modernHeader ? String(localized: "room.dm.directMessages") : String(localized: "nav.home")
        case .dms: return String(localized: "room.dm.directMessages")
        case .space(let id): return roomList.space(id: id)?.name ?? String(localized: "explore.typeSpace")
        }
    }

    private var spaceId: String? {
        if case .space(let id) = selection { return id }
        return nil
    }

    /// The space whose style decides this list: the top space of the open one
    private var styleSpaceId: String? {
        guard let spaceId else { return nil }
        return SpaceModern.rootSpace(of: spaceId, in: roomList.graph)
    }

    private var isModern: Bool {
        guard let styleSpaceId else { return false }
        return SpaceModern.style(of: mudrix.state(styleSpaceId)) == .modern
    }

    private func isVoice(_ room: RoomSummary) -> Bool {
        room.isVoice || SpaceModern.isVoiceChannelFlagged(mudrix.state(room.id))
    }

    /// The Modern shell's Direct Messages pane: its header replaces the top bar's + and inbox.
    /// The rail can select either home or the DMs entry; both are the same pane there.
    private var dmPane: Bool { modernHeader && (selection == .home || selection == .dms) }

    /// The list's groups; the Modern Home pane includes the DMs, the Classic tabs keep them apart
    private var groups: [RoomGroup] {
        guard roomList.isLoaded else { return [] }
        let groups = roomList.groups(for: selection, includeDms: dmPane)
        guard !search.isEmpty else { return groups }
        return groups.map { RoomGroup(kind: $0.kind, rooms: $0.rooms.filter { $0.displayName.localizedCaseInsensitiveContains(search) }) }
    }

    var body: some View {
        // Built once per evaluation: the groups also tell whether the list is empty
        let groups = self.groups
        return List {
            if onOpenInbox != nil {
                VerificationBanner()
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }
            if !dmPane, selection == .home, search.isEmpty, roomList.isLoaded, let onOpenInbox {
                HomeWelcome(roomList: roomList, onOpenInbox: onOpenInbox, onOpenRoom: onOpenRoom)
            }
            if !dmPane, selection == .home, search.isEmpty, roomList.isLoaded {
                ActiveNowSection(roomList: roomList)
            }
            if !roomList.isLoaded {
                ForEach(0..<8, id: \.self) { _ in
                    SkeletonRow().listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            } else if groups.allSatisfy({ $0.rooms.isEmpty }) {
                Text(search.isEmpty ? emptyText : "nav.noMatches")
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, WZ.Space.space9)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            if let spaceId, isModern, roomList.isLoaded {
                modernRows(spaceId)
            } else if selection == .dms, groups.count == 1, case .dms = groups[0].kind {
                ForEach(groups[0].rooms) { roomRow($0) }
                    .onMove(perform: selection == .home && reordering ? { moveRooms(groups[0], from: $0, to: $1) } : nil)
            } else {
                ForEach(groups) { group in
                    Section {
                        if !isCollapsed(group) || reordering {
                            ForEach(group.rooms) { roomRow($0) }
                                .onMove(perform: canReorder(group) ? { moveRooms(group, from: $0, to: $1) } : nil)
                        }
                    } header: {
                        groupHeader(group, in: groups)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 8))
                    }
                }
            }
        }
        .environment(\.editMode, .constant(reordering ? .active : .inactive))
        .listStyle(.plain)
        .listSectionSpacing(0)
        .environment(\.defaultMinListHeaderHeight, 0)
        .scrollContentBackground(.hidden)
        .background(theme.bgPrimary.ignoresSafeArea())
        .modifier(RootTitle(title: title, isRoot: spaceId == nil))
        .safeAreaInset(edge: .top, spacing: 0) {
            if dmPane { dmHeader }
        }
        // Under the title: iOS 26 would otherwise put it at the bottom, behind the tab island.
        // Typing searches everything, not just this list.
        .overlay {
            if !search.trimmingCharacters(in: .whitespaces).isEmpty {
                GlobalSearchResults(roomList: roomList, query: search)
            }
        }
        .modifier(ListSearch(text: $search, enabled: !dmPane))
        .toolbar {
            if !dmPane {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        newMenuItems
                    } label: {
                        Image("ph-plus-regular")
                    }
                    .accessibilityLabel(String(localized: "nav.new"))
                }
            }
            if reordering {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { reordering = false }.fontWeight(.semibold)
                }
            }
            if !dmPane, let onOpenInbox {
                ToolbarItem(placement: .topBarTrailing) {
                    InboxButton(roomList: roomList, action: onOpenInbox)
                }
            }
        }
        .onChange(of: styleSpaceId, initial: true) { _, id in
            if let id { mudrix.ensure(id) }
        }
        .onChange(of: isModern, initial: true) { _, modern in
            // Only Modern spaces and their rooms are read (one request per room, kept for a minute)
            if modern, let spaceId { mudrix.ensureAll(roomList.roomsIncludingArchived(for: .space(spaceId)).map(\.id)) }
        }
        .sheet(isPresented: $showNewMessage) { UserPickerView(mode: .directMessage) }
        .sheet(isPresented: $showNewRoom) { CreateRoomView(spaceId: spaceId) }
        .sheet(isPresented: $showSpaceSettings) {
            if let spaceId, let space = roomList.space(id: spaceId) {
                SpaceSettingsView(space: space, roomList: roomList)
            }
        }
        .sheet(isPresented: $showSort) {
            RoomListSortSheet(options: roomList.options) { next in
                Task { await roomList.setOptions(next) }
            }
        }
        .alert(String(localized: renaming == nil ? "room.sections.newTitle" : "room.sections.renameTitle"),
               isPresented: Binding(get: { newSectionFor != nil || renaming != nil },
                                    set: { if !$0 { newSectionFor = nil; renaming = nil } })) {
            TextField("", text: $sectionName)
            Button(String(localized: "common.save")) { Task { await saveSectionName() } }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        }
        .confirmationDialog(L10n.format("room.sections.deleteTitle", deleting?.name ?? ""),
                            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button(String(localized: "room.sections.delete"), role: .destructive) {
                guard let section = deleting else { return }
                sectionTask { try await roomList.client.deleteRoomSection(tag: section.tag) }
            }
        } message: {
            Text(String(localized: "room.sections.deleteMessage"))
        }
        .alert(sectionError ?? "", isPresented: Binding(get: { sectionError != nil }, set: { if !$0 { sectionError = nil } })) {
            Button(String(localized: "common.close"), role: .cancel) {}
        }
        .confirmationDialog(
            L10n.format("room.info.leaveConfirm", leaving?.displayName ?? ""),
            isPresented: Binding(get: { leaving != nil }, set: { if !$0 { leaving = nil } }),
            titleVisibility: .visible
        ) {
            Button(String(localized: "common.leave"), role: .destructive) {
                if let room = leaving { Task { await roomList.leave(room) } }
            }
        }
    }

    @ViewBuilder
    private func modernRows(_ spaceId: String) -> some View {
        if let banner = SpaceModern.banner(of: mudrix.state(styleSpaceId)), search.isEmpty {
            SpaceBannerView(banner: banner, name: roomList.space(id: spaceId)?.name ?? "")
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
        }
        ForEach(roomList.modernCategories(of: spaceId, search: search, isVoice: { isVoice($0) })) { category in
            Section {
                ForEach(category.rooms) { roomRow($0, modern: true) }
            } header: {
                if let title = category.title {
                    Text(title)
                        .font(.wizard(WZ.FontSize.xs, .semibold))
                        .foregroundStyle(theme.textMuted)
                }
            }
        }
        // The Modern list draws its own categories, so its Archived group is added here
        if let archived = groups.last, case .archived = archived.kind {
            Section {
                if !isCollapsed(archived) || reordering {
                    ForEach(archived.rooms) { roomRow($0, modern: true) }
                }
            } header: {
                groupHeader(archived, in: groups)
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 8))
            }
        }
    }

    @ViewBuilder
    private var newMenuItems: some View {
        Button { showNewMessage = true } label: { Label(menu: String(localized: "common.newDm"), icon: "ph-chat-circle-regular") }
        if dmPane {
            Button { showSort = true } label: { Label(menu: String(localized: "roomList.sort"), icon: "ph-sliders-regular") }
        }
        if selection != .dms {
            Button { showNewRoom = true } label: { Label(menu: String(localized: "nav.newRoom"), icon: "ph-hash-straight-regular") }
        }
        if selection != .dms {
            Button { startNewSection(for: nil) } label: { Label(menu: String(localized: "room.sections.new"), icon: "ph-list-bullets-regular") }
            Button { reordering = true } label: { Label(menu: String(localized: "nav.reorderRooms"), icon: "ph-caret-up-down-regular") }
        }
        if spaceId != nil {
            Divider()
            Button { showSpaceSettings = true } label: { Label(menu: String(localized: "space.settingsTitle"), icon: "ph-gear-regular") }
        }
    }

    /// The Direct Messages pane's toolbar, as on Android: search, inbox and the accent + (which opens the new menu,
    /// including sort)
    private var dmHeader: some View {
        VStack(spacing: WZ.Space.space2) {
            HStack(spacing: WZ.Space.space3) {
                RoundToolButton(icon: "ph-magnifying-glass-regular", label: String(localized: "common.search")) {
                    searchOpen = true
                    searchFocused = true
                }
                if let onOpenInbox {
                    InboxButton(roomList: roomList, action: onOpenInbox, round: true)
                }
                Spacer(minLength: 0)
                Menu {
                    newMenuItems
                } label: {
                    Image("ph-plus-regular")
                        .font(.system(size: WZ.SizeIcon.sm))
                        .foregroundStyle(theme.textOnAccent)
                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                        .background(theme.accent, in: Circle())
                        .minTouchTarget()
                }
                .accessibilityLabel(String(localized: "nav.new"))
            }
            if searchOpen {
                HStack(spacing: WZ.Space.space2) {
                    TextField(String(localized: "nav.searchPlaceholder"), text: $search)
                        .font(.wizard(WZ.FontSize.lg))
                        .foregroundStyle(theme.textPrimary)
                        .focused($searchFocused)
                        .onAppear { searchFocused = true }
                        .padding(.horizontal, WZ.Space.space4)
                        .frame(minHeight: WZ.Space.space11)
                        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                    RoundToolButton(icon: "ph-x-regular", label: String(localized: "common.close")) {
                        search = ""
                        searchOpen = false
                    }
                }
            }
        }
        .padding(.horizontal, WZ.Space.space6)
        .padding(.vertical, WZ.Space.space2)
        .frame(maxWidth: .infinity)
        .background(theme.bgPrimary)
    }

    private func roomRow(_ room: RoomSummary, modern: Bool = false) -> some View {
        Group {
            if let onOpenRoom {
                Button { onOpenRoom(room.id) } label: {
                    RoomRow(room: room, showsHashIcon: modern ? !room.isDirect : !prefs.showRoomAvatars && !room.isDirect,
                            isVoice: modern ? isVoice(room) : nil,
                            muted: roomList.notificationMode(of: room) == .mute)
                }
                .buttonStyle(.plain)
            } else {
                NavigationLink(value: Route.room(room.id)) {
                    RoomRow(room: room, showsHashIcon: modern ? !room.isDirect : !prefs.showRoomAvatars && !room.isDirect,
                            isVoice: modern ? isVoice(room) : nil,
                            muted: roomList.notificationMode(of: room) == .mute)
                }
            }
        }
        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
        .listRowBackground(theme.bgPrimary)
        .listRowSeparator(.hidden)
        .swipeActions(edge: .leading) {
            let unread = room.unreadCount > 0 || room.mentionCount > 0
            Button {
                Task { await roomList.setRead(room, read: unread) }
            } label: {
                Label(unread ? String(localized: "common.markRead") : String(localized: "nav.markAsUnread"),
                      image: unread ? "ph-envelope-open-regular" : "ph-envelope-simple-regular")
            }
            // Swipe actions always draw their icon white, so this needs a darker neutral
            .tint(theme.textMuted)
        }
        .swipeActions(edge: .trailing) {
            Button { setArchived(room) } label: {
                Label(String(localized: RoomMenu.archiveKey(archived: room.isArchived)), image: "ph-tray-regular")
            }
            .tint(theme.textMuted)
            Button(role: .destructive) { leaving = room } label: {
                Label(String(localized: "common.leave"), image: "ph-sign-out-regular")
            }
            .tint(theme.danger)
        }
        .contextMenu {
            let readActions = RoomMenu.actions(readCount: room.unreadCount, mentionCount: room.mentionCount)
            if readActions.markRead {
                Button { Task { await roomList.setRead(room, read: true) } } label: {
                    Label(menu: String(localized: "common.markRead"), icon: "ph-envelope-open-regular")
                }
            }
            if readActions.markUnread {
                Button { Task { await roomList.setRead(room, read: false) } } label: {
                    Label(menu: String(localized: "room.markUnread"), icon: "ph-envelope-simple-regular")
                }
            }
            Menu {
                Picker(selection: Binding(get: { roomList.notificationMode(of: room) },
                                          set: { mode in Task { await roomList.setNotificationMode(room, mode) } })) {
                    Label(menu: String(localized: "room.notifications.default"), icon: "ph-bell-regular").tag(NotificationMode?.none)
                    Label(menu: String(localized: "room.notifications.all"), icon: "ph-bell-ringing-regular").tag(NotificationMode?.some(.all))
                    Label(menu: String(localized: "room.notifications.mentions"), icon: "ph-bell-simple-regular").tag(NotificationMode?.some(.mentions))
                    Label(menu: String(localized: "room.notifications.mute"), icon: "ph-bell-slash-regular").tag(NotificationMode?.some(.mute))
                } label: {
                    EmptyView()
                }
                .pickerStyle(.inline)
            } label: {
                Label(menu: String(localized: "room.notifications.title"), icon: "ph-bell-regular")
            }
            if room.isDirect {
                let pinned = roomList.isPinned(room)
                Button {
                    Task { await roomList.setPinned(room, pinned: !pinned) }
                } label: {
                    Label(menu: String(localized: pinned ? "roomList.unpin" : "roomList.pin"),
                          icon: pinned ? "ph-push-pin-slash-regular" : "ph-push-pin-regular")
                }
            }
            Button {
                sectionTask { try await roomList.client.setFavourite(roomId: room.id, favourite: !room.isFavourite) }
            } label: {
                Label(menu: String(localized: room.isFavourite ? "room.removeFavourite" : "room.addFavourite"),
                      icon: room.isFavourite ? "ph-star-fill" : "ph-star-regular")
            }
            Button {
                lowPriorityTask {
                    try await roomList.client.setLowPriority(roomId: room.id, lowPriority: !room.isLowPriority)
                }
            } label: {
                Label(menu: String(localized: room.isLowPriority ? "room.removeLowPriority" : "room.addLowPriority"),
                      icon: "ph-arrow-line-down-regular")
            }
            if selection != .dms { sectionMenu(for: room) }
            if let move = roomMove(room) {
                Button { applyMove(move, by: -1) } label: {
                    Label(menu: String(localized: "room.sections.moveUp"), icon: "ph-caret-up-down-regular")
                }
                .disabled(move.index == 0)
                Button { applyMove(move, by: 1) } label: {
                    Label(menu: String(localized: "room.sections.moveDown"), icon: "ph-caret-up-down-regular")
                }
                .disabled(move.index >= move.ids.count - 1)
            }
            Button { copyToClipboard("https://matrix.to/#/\(room.id)", message: String(localized: "timeline.linkCopied")) } label: {
                Label(menu: String(localized: "common.copyLink"), icon: "ph-link-simple-regular")
            }
            Button { setArchived(room) } label: {
                Label(menu: String(localized: RoomMenu.archiveKey(archived: room.isArchived)), icon: "ph-tray-regular")
            }
            Divider()
            Button(role: .destructive) { leaving = room } label: {
                Label(menu: String(localized: "common.leave"), icon: "ph-sign-out-regular", destructive: true)
            }
        }
    }

    @ViewBuilder
    private func sectionMenu(for room: RoomSummary) -> some View {
        let context = roomList.sectionContext(selection)
        let current = roomList.sectionTag(of: room.id)
        Menu {
            ForEach(roomList.sections.filter { $0.spaceId == context || $0.tag == current }, id: \.tag) { section in
                Button {
                    sectionTask { try await roomList.client.setRoomSection(roomId: room.id, tag: section.tag) }
                } label: {
                    if section.tag == current { Label(section.name, image: "ph-check-bold") } else { Text(section.name) }
                }
            }
            Button { startNewSection(for: room.id) } label: {
                Label(menu: String(localized: "room.sections.new"), icon: "ph-plus-regular")
            }
            if current != nil {
                Divider()
                Button {
                    sectionTask { try await roomList.client.setRoomSection(roomId: room.id, tag: nil) }
                } label: {
                    Label(menu: String(localized: "room.sections.remove"), icon: "ph-x-regular")
                }
            }
        } label: {
            Label(menu: String(localized: "room.sections.moveTo"), icon: "ph-list-bullets-regular")
        }
    }

    @ViewBuilder
    private func groupHeader(_ group: RoomGroup, in groups: [RoomGroup]) -> some View {
        let anchors = groups.compactMap { group -> String? in
            switch group.kind {
            case .pinned, .favourites, .dms, .lowPriority, .archived: return nil
            default: return group.id
            }
        }
        let index = anchors.firstIndex(of: group.id)
        let closed = isCollapsed(group) && !reordering
        HStack(spacing: WZ.Space.space0) {
            HStack(spacing: WZ.Space.space3) {
                Image("ph-caret-right-bold")
                    .font(.system(size: WZ.SizeIcon.xs))
                    .foregroundStyle(theme.textMuted)
                    .rotationEffect(.degrees(closed ? 0 : 90))
                    .frame(width: WZ.SizeIcon.md)
                Text(groupTitle(group))
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(1)
                if closed { collapsedBadge(group) }
                Spacer(minLength: WZ.Space.space4)
            }
            .frame(maxWidth: .infinity, minHeight: WZ.SizeControl.sm + WZ.Space.space1, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture { if !reordering { toggle(group) } }
            .sensoryFeedback(.selection, trigger: closed)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(groupTitle(group))
            .accessibilityHint(String(localized: closed ? "common.expand" : "common.collapse"))
            .accessibilityAddTraits([.isHeader, .isButton])
            .accessibilityAction { if !reordering { toggle(group) } }
            if let index, anchors.count > 1 || group.isSection {
                Menu {
                    if case .section(let section) = group.kind {
                        Button { renaming = section; sectionName = section.name } label: {
                            Label(menu: String(localized: "common.rename"), icon: "ph-pencil-simple-regular")
                        }
                    }
                    Button { moveGroup(group, by: -1, in: groups) } label: {
                        Label(menu: String(localized: "room.sections.moveUp"), icon: "ph-caret-up-down-regular")
                    }
                    .disabled(index == 0)
                    Button { moveGroup(group, by: 1, in: groups) } label: {
                        Label(menu: String(localized: "room.sections.moveDown"), icon: "ph-caret-up-down-regular")
                    }
                    .disabled(index == anchors.count - 1)
                    if case .section(let section) = group.kind {
                        Divider()
                        Button(role: .destructive) { deleting = section } label: {
                            Label(menu: String(localized: "room.sections.delete"), icon: "ph-trash-regular", destructive: true)
                        }
                    }
                } label: {
                    Image("ph-dots-three-bold")
                        .font(.system(size: WZ.SizeIcon.sm))
                        .foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Size.touchTarget, height: WZ.SizeControl.sm + WZ.Space.space1)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(String(localized: "room.sections.options"))
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func collapsedBadge(_ group: RoomGroup) -> some View {
        if case .archived = group.kind {
            // The Archived header counts its rooms whether or not they have anything new
            Text("\(group.rooms.count)")
                .font(.wizard(WZ.FontSize.xs, .bold))
                .foregroundStyle(theme.textMuted)
                .padding(.horizontal, WZ.Space.space3)
                .padding(.vertical, WZ.Space.space0)
                .frame(minWidth: WZ.Space.space6)
                .background(theme.fill, in: Capsule())
        } else {
            let unread = group.rooms.reduce(0) { $0 + max($1.unreadCount, $1.mentionCount) }
            if unread > 0 {
                UnreadBadge(count: unread, isMention: group.rooms.contains { $0.mentionCount > 0 })
            }
        }
    }

    private func collapseKey(_ group: RoomGroup) -> String {
        "\(roomList.sectionContext(selection))::\(group.id)"
    }

    private func isCollapsed(_ group: RoomGroup) -> Bool {
        let key = collapseKey(group)
        if case .archived = group.kind { return !expanded.contains(key) }
        return collapsed.contains(key)
    }

    private func toggle(_ group: RoomGroup) {
        let key = collapseKey(group)
        withAnimation(.snappy(duration: WZ.MotionDuration.normal)) {
            if isCollapsed(group) {
                collapsed.remove(key)
                if case .archived = group.kind { expanded.insert(key) }
            } else {
                collapsed.insert(key)
                expanded.remove(key)
            }
        }
        UserDefaults.standard.set(Array(collapsed), forKey: "roomList.collapsed")
        UserDefaults.standard.set(Array(expanded), forKey: "roomList.expanded")
    }

    private func groupTitle(_ group: RoomGroup) -> String {
        switch group.kind {
        case .pinned: String(localized: "roomList.pinned")
        case .dms: String(localized: "room.dm.directMessages")
        case .favourites: String(localized: "nav.favourites")
        case .section(let section): section.name
        case .rooms: String(localized: "nav.rooms")
        case .lowPriority: String(localized: "room.lowPriority")
        case .archived: String(localized: "room.archived")
        }
    }

    private func canReorder(_ group: RoomGroup) -> Bool {
        guard reordering else { return false }
        switch group.kind {
        case .favourites: return true
        case .rooms: return selection == .home
        case .pinned, .dms, .section, .lowPriority, .archived: return false
        }
    }

    private func moveRooms(_ group: RoomGroup, from source: IndexSet, to destination: Int) {
        var ids = group.rooms.map(\.id)
        ids.move(fromOffsets: source, toOffset: destination)
        Task {
            if case .favourites = group.kind {
                await roomList.saveFavouriteOrder(ids)
            } else {
                await roomList.saveHomeOrder(ids)
            }
        }
    }

    private func moveGroup(_ group: RoomGroup, by offset: Int, in groups: [RoomGroup]) {
        sectionTask { try await roomList.moveGroup(group.id, by: offset, in: groups) }
    }

    /// The "Move up" and "Move down" entries for a room, when its group has an order to save: favourites
    /// keep one in their `m.favourite` tag and the home list in `home_order`. Sections and the low-priority
    /// list have no saved room order, and the Modern space list has no dragging at all, so neither offers it.
    private func roomMove(_ room: RoomSummary) -> RoomMove? {
        guard search.isEmpty, !(isModern && spaceId != nil) else { return nil }
        for group in groups {
            guard group.rooms.count > 1,
                  let index = group.rooms.firstIndex(where: { $0.id == room.id }) else { continue }
            switch group.kind {
            case .favourites:
                return RoomMove(ids: group.rooms.map(\.id), index: index, favourites: true)
            case .rooms where selection == .home:
                return RoomMove(ids: group.rooms.map(\.id), index: index, favourites: false)
            default:
                return nil
            }
        }
        return nil
    }

    private func applyMove(_ move: RoomMove, by offset: Int) {
        guard let ids = RoomMoveOrder.moved(move, by: offset) else { return }
        Task {
            if move.favourites {
                await roomList.saveFavouriteOrder(ids)
            } else {
                await roomList.saveHomeOrder(ids)
            }
        }
    }

    private func startNewSection(for roomId: String?) {
        sectionName = ""
        renaming = nil
        newSectionFor = roomId ?? ""
    }

    private func saveSectionName() async {
        let name = sectionName.trimmingCharacters(in: .whitespaces)
        let section = renaming
        let roomId = newSectionFor
        newSectionFor = nil
        renaming = nil
        guard !name.isEmpty else { return }
        sectionTask {
            if let section {
                try await roomList.client.renameRoomSection(tag: section.tag, name: name)
            } else {
                let tag = try await roomList.client.createRoomSection(name: name, spaceId: roomList.sectionContext(selection))
                if let roomId, !roomId.isEmpty {
                    try await roomList.client.setRoomSection(roomId: roomId, tag: tag)
                }
            }
        }
    }

    private func sectionTask(_ work: @escaping () async throws -> Void) {
        Task {
            do { try await work() } catch {
                sectionError = L10n.format("room.sections.failed", error.localizedDescription)
            }
        }
    }

    private func lowPriorityTask(_ work: @escaping () async throws -> Void) {
        Task {
            do { try await work() } catch {
                sectionError = L10n.format("room.toggleLowPriorityFailed", error.localizedDescription)
            }
        }
    }

    /// Archives or restores a room; the core keeps it joined and restores it when a newer message comes
    private func setArchived(_ room: RoomSummary) {
        let archived = room.isArchived
        let failed = archived ? "room.unarchiveFailed" : "room.archiveFailed"
        Task {
            do { try await roomList.client.setArchived(roomId: room.id, archived: !archived) } catch {
                sectionError = L10n.format(failed, error.localizedDescription)
            }
        }
    }

    private var emptyText: LocalizedStringKey {
        switch selection {
        case .dms: return "nav.noDirectMessagesYet"
        default: return "nav.noRoomsHereYet"
        }
    }
}

private struct InboxButton: View {
    @ObservedObject var roomList: RoomListModel
    let action: () -> Void
    var round = false
    @Environment(\.theme) private var theme

    var body: some View {
        let mentions = !roomList.mentionRooms.isEmpty
        let badge = mentions || !roomList.invites.isEmpty
        Button(action: action) {
            Image("ph-tray-regular")
                .frame(width: round ? WZ.Space.space9 : nil, height: round ? WZ.Space.space9 : nil)
                .background { if round { Circle().fill(theme.fill) } }
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

private struct RoundToolButton: View {
    let icon: String
    let label: String
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm))
                .foregroundStyle(theme.textPrimary)
                .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                .background(theme.fill, in: Circle())
                .minTouchTarget()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The list's own search bar, left out of the Direct Messages pane (its header has a search button instead)
private struct ListSearch: ViewModifier {
    @Binding var text: String
    let enabled: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if enabled {
            content.searchable(text: $text, placement: .navigationBarDrawer(displayMode: .automatic),
                               prompt: Text(String(localized: "nav.searchPlaceholder")))
        } else {
            content
        }
    }
}

struct RoomRow: View {
    let room: RoomSummary
    let showsHashIcon: Bool
    /// Overrides `room.isVoice` (Modern spaces also treat rooms flagged as voice channels in their state as voice)
    var isVoice: Bool?
    var muted = false
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @State private var partnerPresence: Presence?
    @State private var partnerStatusMode: StatusMode?

    private var avatarSize: CGFloat { prefs.roomAvatarSize }
    private var voice: Bool { isVoice ?? room.isVoice }
    private var inCall: Bool { voice && !room.callParticipants.isEmpty }

    private func typeIcon(size: CGFloat) -> some View {
        Icon(voice ? "speaker-high" : "hash-straight", voice ? .regular : .bold, size: size)
            .foregroundStyle(inCall ? theme.success : theme.textMuted)
    }
    private var hasUnread: Bool { room.unreadCount > 0 || room.mentionCount > 0 }

    /// The latest message, left out in the compact density as on Android
    private var preview: String? {
        guard prefs.uiDensity != .compact else { return nil }
        return RoomPreview.line(room.lastMessage, isDirect: room.isDirect, labels: Self.previewLabels)
    }

    private static var previewLabels: RoomPreviewLabels {
        RoomPreviewLabels(you: String(localized: "nav.you"),
                          photo: String(localized: "timeline.photo"),
                          video: String(localized: "timeline.summary.video"),
                          audio: String(localized: "composer.voice.record"),
                          file: String(localized: "composer.file"),
                          sticker: String(localized: "room.preview.sticker"),
                          poll: String(localized: "timeline.poll.title"),
                          call: String(localized: "room.preview.call"),
                          newMessage: String(localized: "common.newMessage"))
    }

    var body: some View {
        if room.isDirect, let partner = room.dmUserId, !partner.isEmpty {
            CosmeticName(userId: partner, fullBleed: true) { rowContent }
        } else {
            rowContent
        }
    }

    /// A direct message's row is a card: the art fills it, so the name and the scrim follow it
    private var dmRow: Bool { room.isDirect }

    /// The nameplate is the row's whole background, so this scrim keeps the name and preview readable
    /// on the left and lets the artwork show on the right. It is a surface wash over the banner, not a
    /// lower opacity on the banner itself. The quiet dim under it carries a long name over bright art.
    private var nameplateScrim: some View {
        ZStack {
            LinearGradient(stops: [
                .init(color: .black.opacity(0.30), location: 0),
                .init(color: .black.opacity(0.30), location: 0.66),
                .init(color: .black.opacity(0), location: 1),
            ], startPoint: .leading, endPoint: .trailing)
            LinearGradient(stops: [
                .init(color: theme.bgPrimary, location: 0),
                .init(color: theme.bgPrimary, location: 0.40),
                .init(color: theme.bgPrimary.opacity(0), location: 0.74),
            ], startPoint: .leading, endPoint: .trailing)
        }
    }

    /// Optional pill right after a name: a tiny icon and 2-4 uppercase letters, on translucent dark
    private var nameBadge: some View {
        HStack(spacing: WZ.Space.space1) {
            Icon("phone", .fill, size: 10)
            Text(String(localized: "call.live").uppercased())
                .font(.wizard(WZ.FontSize.xs, .semibold))
                .tracking(0.4)
        }
        .foregroundStyle(theme.textOnAccent)
        .padding(.horizontal, WZ.Space.space3)
        .padding(.vertical, WZ.Space.space1)
        .background(theme.overlay, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "call.inProgress"))
    }

    /// The other person's nameplate, when they have one, is the row's whole background behind the avatar and text
    private var rowContent: some View {
        HStack(spacing: WZ.Space.space5) {
            if showsHashIcon {
                typeIcon(size: avatarSize * 0.45)
                    .frame(width: avatarSize, height: avatarSize)
                    .background(theme.fill, in: Circle())
            } else {
                CosmeticAvatar(userId: room.dmUserId ?? "", name: room.displayName, url: room.avatarUrl, size: avatarSize,
                               presence: (!room.isDirect || inCall) ? nil : partnerPresence,
                               dot: (!room.isDirect || inCall) ? nil : StatusFields.dot(partnerPresence, mode: partnerStatusMode))
                    .overlay {
                        // Inside the banner the avatar keeps a thin dark ring so it separates from the art
                        if dmRow {
                            Circle().strokeBorder(theme.overlay, lineWidth: WZ.BorderWidth.thin)
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        if !room.isDirect || inCall {
                            typeIcon(size: WZ.SizeIcon.xs)
                                .frame(width: WZ.Space.space7, height: WZ.Space.space7)
                                .background(theme.bgPrimary, in: Circle())
                                .overlay(Circle().stroke(inCall ? theme.success : theme.border, lineWidth: WZ.BorderWidth.thin))
                                .offset(x: WZ.Space.space2, y: WZ.Space.space2)
                        }
                    }
            }
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                HStack(spacing: WZ.Space.space2) {
                    Text(room.displayName)
                        .font(.wizard(WZ.FontSize.md, dmRow || hasUnread ? .semibold : .regular))
                        .foregroundStyle(dmRow || hasUnread ? theme.textPrimary : theme.textSecondary)
                        .lineLimit(1)
                        // Over the banner's art a local halo keeps the name crisp on a bright patch
                        .shadow(color: dmRow ? .black.opacity(0.55) : .clear, radius: 1, x: 0, y: 1)
                    if dmRow && !room.callParticipants.isEmpty {
                        nameBadge
                    }
                }
                if let preview {
                    Text(preview)
                        .font(.wizard(WZ.FontSize.sm, hasUnread ? .medium : .regular))
                        .foregroundStyle(hasUnread ? theme.textPrimary : theme.textMuted)
                        .lineLimit(1)
                        .sensitive()
                }
                if inCall {
                    ParticipantStack(roomId: room.id, userIds: room.callParticipants)
                    RoomCallTimer(roomId: room.id)
                }
            }
            Spacer(minLength: 6)
            if muted {
                Image("ph-bell-slash-regular")
                    .font(.system(size: WZ.SizeIcon.sm))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityLabel(String(localized: "room.notifications.mute"))
            }
            if room.mentionCount > 0 {
                UnreadBadge(count: max(room.unreadCount, room.mentionCount), isMention: true)
            } else if room.unreadCount > 0 {
                UnreadBadge(count: room.unreadCount, isMention: false)
            }
        }
        // A DM card's own edges are the list's row inset, which is where a plain row's content starts,
        // so neither kind adds horizontal padding inside it. A DM row's avatar always fits its 64pt
        // card, so the density padding is vertical only for plain rows
        .padding(.vertical, dmRow ? 0 : prefs.roomRowPadding)
        // Every DM row is one card height, with or without a nameplate, so the list never jumps
        .frame(minHeight: dmRow ? 64 : 0)
        .background { nameplateScrim }
        // Air between two cards, unclipped by the list's zero row insets
        .padding(.vertical, dmRow ? WZ.Space.space1 : 0)
        .contentShape(Rectangle())
        .task(id: "\(room.isDirect)|\(room.dmUserId ?? "")|\(prefs.showPresence)") {
            guard prefs.showPresence, room.isDirect, let partnerId = room.dmUserId, !partnerId.isEmpty,
                  let client = session.client else {
                partnerPresence = nil
                partnerStatusMode = nil
                return
            }
            if let cached = PresenceCache.shared.cached(partnerId) {
                partnerPresence = cached
            } else {
                partnerPresence = await session.presence(of: partnerId)
            }
            partnerStatusMode = await StatusFields.read(client: client, userId: partnerId)
        }
    }
}

struct SkeletonRow: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            Circle().fill(theme.fill).frame(width: WZ.Space.space10, height: WZ.Space.space10)
            Capsule().fill(theme.fill).frame(width: WZ.SizeAvatar.xxl, height: WZ.Space.space5)
        }
        .padding(.vertical, WZ.Space.space3)
        .shimmer()
    }
}

private struct RootTitle: ViewModifier {
    let title: String
    let isRoot: Bool

    func body(content: Content) -> some View {
        if isRoot {
            content.tabTitle(title)
        } else {
            content.navigationTitle(title).navigationBarTitleDisplayMode(.large)
        }
    }
}
