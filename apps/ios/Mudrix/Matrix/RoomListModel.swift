import Foundation
import MudrixCore

/// A DM is named after the other person: the SDK's own name reads "Empty Room (was X)" once they have left
func roomDisplayName(isDirect: Bool, dmUserName: String?, name: String?, canonicalAlias: String?, id: String) -> String {
    if isDirect, let partner = dmUserName, !partner.isEmpty { return partner }
    return name ?? canonicalAlias ?? id
}

extension RoomSummary: @retroactive Identifiable {
    var displayName: String {
        roomDisplayName(isDirect: isDirect, dmUserName: dmUserName, name: name, canonicalAlias: canonicalAlias, id: id)
    }
    /// Messages that notify under the room's notification setting (as on the web), or 1 when marked unread
    var unreadCount: Int { unreadNotifications > 0 ? unreadNotifications : markedUnread ? 1 : 0 }
    var mentionCount: Int { unreadMentions }
}

extension SpaceSummary: @retroactive Identifiable {}

enum SidebarSelection: Hashable {
    case home
    case dms
    case space(String)
}

struct RoomGroup: Identifiable {
    enum Kind {
        /// DMs whose partner is pinned in the room list options
        case pinned
        case favourites
        case section(RoomSection)
        /// The direct messages of the Modern Home pane, or the Classic DMs tab
        case dms
        case rooms
        /// Rooms flagged low priority that are in no section; always last, not movable
        case lowPriority
    }

    let kind: Kind
    let rooms: [RoomSummary]

    var isSection: Bool { if case .section = kind { true } else { false } }

    var id: String {
        switch kind {
        case .pinned: "pinned"
        case .favourites: "favourites"
        case .section(let section): section.tag
        case .dms: "dms"
        case .rooms: RoomListModel.roomsAnchor
        case .lowPriority: "low-priority"
        }
    }
}

struct UnreadState {
    var unread = false
    var mention = false
}

@MainActor
final class RoomListModel: ObservableObject {
    @Published private(set) var joinedRooms: [RoomSummary] = [] { didSet { roomsCache = [:] } }
    @Published private(set) var invites: [RoomSummary] = []
    /// Rooms asked to join by knocking, waiting for an answer
    @Published private(set) var knockedIds: Set<String> = []
    @Published private(set) var mentionRooms: [RoomSummary] = []
    /// Notification settings just picked here, shown until the room list catches up (as on the web)
    @Published private var notificationOverrides: [String: NotificationMode?] = [:]
    @Published private(set) var spaces: [SpaceSummary] = []
    /// The space tree (children with their `order`), for the Modern list and the roles chain
    @Published private(set) var graph: [SpaceNode] = []
    @Published private(set) var spaceRooms: [String: Set<String>] = [:] { didSet { roomsCache = [:] } }
    /// Every joined space, subspaces included
    @Published private(set) var allSpaces: [SpaceSummary] = []
    @Published private(set) var isLoaded = false
    @Published private(set) var sections: [RoomSection] = []
    @Published private(set) var roomTags: [String: Set<String>] = [:]
    @Published private(set) var favouriteOrder: [String: Double] = [:]
    @Published private(set) var homeOrder: [String] = []
    /// The DM screen's saved order, sections and pins (`io.github.kapsikkum.mudrix.room_list`)
    @Published private(set) var options = RoomListOptions()

    static let roomsAnchor = "chats"
    static let homeSpace = "home-space"
    private static let homeOrderEvent = Namespace.mudrixKey("home_order")
    /// The upstream base kept the order under its own name; it is read until the first save writes the Mudrix one
    private static let upstreamHomeOrderEvent = Namespace.upstreamKey("home_order")
    private var mudrixHomeOrder: [String]?
    private var upstreamHomeOrder: [String]?

    let client: MudrixClient
    private var rooms: [RoomSummary] = []
    /// rooms(for:) runs for every space in the sidebar and again for the open list on each evaluation;
    /// it only changes with the rooms or the space graph
    private var roomsCache: [SidebarSelection: [RoomSummary]] = [:]
    private var subscriptions: [Subscription] = []
    private var graphTask: Task<Void, Never>?
    private var roomsReceived = false
    private var spacesReceived = false

    init(client: MudrixClient) {
        self.client = client
    }

    func start() {
        subscriptions = [
            client.watchRooms(pageSize: 5000) { [weak self] diffs in
                MainActor.assumeIsolated { self?.apply(diffs) }
            },
            client.watchRoomSections { [weak self] sections in
                MainActor.assumeIsolated { self?.sections = sections }
            },
            client.watchRoomAccountData(eventType: "m.tag") { [weak self] pairs in
                MainActor.assumeIsolated { self?.applyTags(pairs) }
            },
            client.watchAccountData(eventType: Self.homeOrderEvent) { [weak self] content in
                MainActor.assumeIsolated {
                    self?.mudrixHomeOrder = Self.roomIds(in: content)
                    self?.updateHomeOrder()
                }
            },
            client.watchAccountData(eventType: Self.upstreamHomeOrderEvent) { [weak self] content in
                MainActor.assumeIsolated {
                    self?.upstreamHomeOrder = Self.roomIds(in: content)
                    self?.updateHomeOrder()
                }
            },
            client.watchAccountData(eventType: RoomListOptions.eventType) { [weak self] content in
                MainActor.assumeIsolated { self?.options = RoomListOptions(content: content) }
            },
            client.watchSpaces { [weak self] diffs in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    diffs.forEach { $0.apply(to: &self.spaces) }
                    self.spacesReceived = true
                    self.refreshGraph()
                }
            },
            client.watchAllSpaces { [weak self] diffs in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    diffs.forEach { $0.apply(to: &self.allSpaces) }
                }
            },
        ]
    }

    func stop() {
        subscriptions.forEach { $0.cancel() }
        subscriptions = []
        graphTask?.cancel()
    }

    func room(id: String) -> RoomSummary? {
        joinedRooms.first { $0.id == id }
    }

    func accept(_ invite: RoomSummary) async throws {
        try await client.acceptInvite(roomId: invite.id)
    }

    func decline(_ invite: RoomSummary) async throws {
        try await client.declineInvite(roomId: invite.id)
    }

    func setRead(_ room: RoomSummary, read: Bool) async {
        if read {
            try? await client.timeline(roomId: room.id).markAsRead()
        }
        try? await client.setMarkedUnread(roomId: room.id, unread: !read)
    }

    func notificationMode(of room: RoomSummary) -> NotificationMode? {
        if let override = notificationOverrides[room.id] { return override }
        return room.notificationMode
    }

    func setNotificationMode(_ room: RoomSummary, _ mode: NotificationMode?) async {
        let previous = notificationOverrides[room.id]
        notificationOverrides[room.id] = .some(mode)
        do {
            try await client.setRoomNotificationMode(roomId: room.id, mode: mode)
        } catch {
            notificationOverrides[room.id] = previous
        }
    }

    func leave(_ room: RoomSummary) async {
        try? await client.leave(roomId: room.id)
    }

    func markAsRead(_ rooms: [RoomSummary]) async {
        for room in rooms { await setRead(room, read: true) }
    }

    var allJoinedRooms: [RoomSummary] { joinedRooms }

    func isJoined(_ roomId: String) -> Bool {
        joinedRooms.contains { $0.id == roomId } || spaces.contains { $0.id == roomId }
    }

    func space(id: String) -> SpaceSummary? {
        spaces.first { $0.id == id }
    }

    func space(containing roomId: String) -> SpaceSummary? {
        spaces.first { spaceRooms[$0.id]?.contains(roomId) == true }
    }

    func unreadState(of selection: SidebarSelection) -> UnreadState {
        rooms(for: selection).reduce(into: UnreadState()) { state, room in
            if room.mentionCount > 0 { state.mention = true }
            if room.unreadCount > 0 || room.mentionCount > 0 { state.unread = true }
        }
    }

    func rooms(for selection: SidebarSelection) -> [RoomSummary] {
        if let cached = roomsCache[selection] { return cached }
        let result = computeRooms(for: selection)
        roomsCache[selection] = result
        return result
    }

    private func computeRooms(for selection: SidebarSelection) -> [RoomSummary] {
        switch selection {
        case .home:
            let inSpaces = spaceRooms.values.reduce(into: Set<String>()) { $0.formUnion($1) }
            return joinedRooms.filter { !$0.isDirect && !inSpaces.contains($0.id) }
        case .dms:
            return joinedRooms.filter(\.isDirect)
        case .space(let id):
            let ids = spaceRooms[id] ?? []
            return joinedRooms.filter { ids.contains($0.id) }
        }
    }

    /// The list's groups. `includeDms` is the Modern shell's Home pane, where the DMs and the rooms
    /// outside spaces share one screen; the Classic Home tab keeps them apart.
    func groups(for selection: SidebarSelection, includeDms: Bool = false) -> [RoomGroup] {
        switch selection {
        case .dms:
            return dmGroups()
        case .home:
            return includeDms ? modernHomeGroups() : roomBlocks(.home, rooms: rooms(for: .home))
        case .space:
            return roomBlocks(selection, rooms: rooms(for: selection))
        }
    }

    /// The DM screen: pinned DMs, favourites, then the rest in the chosen order.
    private func dmGroups() -> [RoomGroup] {
        let dms = rooms(for: .dms)
        let pinned = pinnedDms(dms)
        let pinnedIds = Set(pinned.map(\.id))
        let rest = dms.filter { !pinnedIds.contains($0.id) }
        let favourites = options.favouritesSection ? sortedFavourites(rest.filter(\.isFavourite)) : []
        let favouriteIds = Set(favourites.map(\.id))
        var groups: [RoomGroup] = []
        if !pinned.isEmpty { groups.append(RoomGroup(kind: .pinned, rooms: pinned)) }
        if !favourites.isEmpty { groups.append(RoomGroup(kind: .favourites, rooms: favourites)) }
        let others = rest.filter { !favouriteIds.contains($0.id) }.sortedForRoomList(options)
        if !others.isEmpty { groups.append(RoomGroup(kind: .dms, rooms: others)) }
        return groups
    }

    /// The Modern Home pane: pinned, favourites, DMs, then rooms, or one merged list.
    private func modernHomeGroups() -> [RoomGroup] {
        let dms = rooms(for: .dms)
        let home = rooms(for: .home)
        let pinned = pinnedDms(dms)
        let pinnedIds = Set(pinned.map(\.id))
        let favourites = options.favouritesSection
            ? sortedFavourites((dms + home).filter { !pinnedIds.contains($0.id) && $0.isFavourite })
            : []
        let favouriteIds = Set(favourites.map(\.id))
        let restDms = dms.filter { !pinnedIds.contains($0.id) && !favouriteIds.contains($0.id) }
        let restRooms = home.filter { !favouriteIds.contains($0.id) }
        let separate = options.separateRoomsAndDms || options.sort == .categorised
        var groups: [RoomGroup] = []
        if !pinned.isEmpty { groups.append(RoomGroup(kind: .pinned, rooms: pinned)) }
        if !favourites.isEmpty { groups.append(RoomGroup(kind: .favourites, rooms: favourites)) }
        if separate {
            if !restDms.isEmpty {
                groups.append(RoomGroup(kind: .dms, rooms: restDms.sortedForRoomList(options)))
            }
            groups += roomBlocks(.home, rooms: restRooms)
        } else {
            groups.append(RoomGroup(kind: .rooms, rooms: (restDms + restRooms).sortedForRoomList(options)))
        }
        return groups
    }

    /// Favourites, Matrix sections above and below the rooms, the rooms, then low priority.
    private func roomBlocks(_ selection: SidebarSelection, rooms: [RoomSummary]) -> [RoomGroup] {
        let context = sectionContext(selection)
        let favourites = options.favouritesSection ? sortedFavourites(rooms.filter(\.isFavourite)) : []
        let favouriteIds = Set(favourites.map(\.id))
        var bySection: [String: [RoomSummary]] = [:]
        var rest: [RoomSummary] = []
        var lowPriority: [RoomSummary] = []
        for room in rooms where !favouriteIds.contains(room.id) {
            let tag = sectionTag(of: room.id)
            if RoomMenu.inLowPriorityGroup(flagged: room.isLowPriority, isFavourite: room.isFavourite, sectionTag: tag) {
                lowPriority.append(room)
            } else if let tag {
                bySection[tag, default: []].append(room)
            } else {
                rest.append(room)
            }
        }
        if selection == .home, options.sort == .recent, !homeOrder.isEmpty {
            let position = Dictionary(homeOrder.enumerated().map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
            rest = rest.enumerated().sorted { a, b in
                switch (position[a.element.id], position[b.element.id]) {
                case let (x?, y?): return x < y
                case (_?, nil): return true
                case (nil, _?): return false
                default: return a.offset < b.offset
                }
            }.map(\.element)
        } else {
            rest = rest.sortedForRoomList(options)
        }
        let visible = sections.filter { bySection[$0.tag] != nil || $0.spaceId == context }
        func block(above: Bool) -> [RoomGroup] {
            visible.filter { $0.aboveRooms == above }.map { RoomGroup(kind: .section($0), rooms: bySection[$0.tag] ?? []) }
        }
        var groups: [RoomGroup] = []
        if !favourites.isEmpty { groups.append(RoomGroup(kind: .favourites, rooms: favourites)) }
        groups += block(above: true)
        groups.append(RoomGroup(kind: .rooms, rooms: rest))
        groups += block(above: false)
        if !lowPriority.isEmpty {
            groups.append(RoomGroup(kind: .lowPriority, rooms: lowPriority.sortedForRoomList(options)))
        }
        return groups
    }

    private func sortedFavourites(_ rooms: [RoomSummary]) -> [RoomSummary] {
        rooms.sorted { a, b in
            switch (favouriteOrder[a.id], favouriteOrder[b.id]) {
            case let (x?, y?) where x != y: return x < y
            case (_?, nil): return true
            case (nil, _?): return false
            default: return a.displayName.localizedCompare(b.displayName) == .orderedAscending
            }
        }
    }

    private func pinnedDms(_ dms: [RoomSummary]) -> [RoomSummary] {
        options.pinnedUsers.compactMap { id in dms.first { $0.dmUserId == id } }
    }

    /// Saves the DM screen's options to account data; puts them back when the account cannot be written.
    func setOptions(_ next: RoomListOptions) async {
        let previous = options
        options = next
        do {
            try await client.setAccountData(eventType: RoomListOptions.eventType, content: next.content)
        } catch {
            options = previous
        }
    }

    /// Pins or unpins a DM by its partner's user id, so the pin survives a room upgrade.
    func setPinned(_ room: RoomSummary, pinned: Bool) async {
        guard let userId = room.dmUserId else { return }
        await setOptions(options.withPin(userId, pinned: pinned))
    }

    func isPinned(_ room: RoomSummary) -> Bool {
        guard let userId = room.dmUserId else { return false }
        return options.pinnedUsers.contains(userId)
    }

    func sectionContext(_ selection: SidebarSelection) -> String {
        if case .space(let id) = selection { return id }
        return Self.homeSpace
    }

    func sectionTag(of roomId: String) -> String? {
        guard let tags = roomTags[roomId] else { return nil }
        return sections.first { tags.contains($0.tag) }?.tag
    }

    func moveGroup(_ anchor: String, by offset: Int, in groups: [RoomGroup]) async throws {
        var anchors = groups.compactMap { group -> String? in
            switch group.kind {
            case .pinned, .favourites, .dms, .lowPriority: return nil
            default: return group.id
            }
        }
        guard let index = anchors.firstIndex(of: anchor), anchors.indices.contains(index + offset) else { return }
        anchors.swapAt(index, index + offset)
        try await client.setRoomSectionOrder(tags: anchors)
    }

    func saveFavouriteOrder(_ roomIds: [String]) async {
        let count = Double(roomIds.count)
        for (index, roomId) in roomIds.enumerated() {
            let order = Double(index + 1) / (count + 1)
            guard favouriteOrder[roomId] != order else { continue }
            favouriteOrder[roomId] = order
            try? await client.setFavouriteOrder(roomId: roomId, order: order)
        }
    }

    private static func roomIds(in content: JSONValue?) -> [String]? {
        guard case .object(let fields)? = content, case .array(let rooms)? = fields["rooms"] else { return nil }
        return rooms.compactMap { item in
            if case .string(let id) = item { return id }
            return nil
        }
    }

    private func updateHomeOrder() {
        homeOrder = mudrixHomeOrder ?? upstreamHomeOrder ?? []
    }

    func saveHomeOrder(_ roomIds: [String]) async {
        mudrixHomeOrder = roomIds
        homeOrder = roomIds
        try? await client.setAccountData(eventType: Self.homeOrderEvent,
                                         content: .object(["rooms": .array(roomIds.map { .string($0) })]))
    }

    private func applyTags(_ pairs: [[JSONValue]]) {
        var tags: [String: Set<String>] = [:]
        var orders: [String: Double] = [:]
        for pair in pairs {
            guard pair.count == 2, case .string(let roomId) = pair[0],
                  case .object(let content) = pair[1], case .object(let names)? = content["tags"] else { continue }
            tags[roomId] = Set(names.keys)
            if case .object(let favourite)? = names["m.favourite"], case .number(let order)? = favourite["order"] {
                orders[roomId] = order
            }
        }
        roomTags = tags
        favouriteOrder = orders
    }

    private func apply(_ diffs: [ListDiff<RoomSummary>]) {
        diffs.forEach { $0.apply(to: &rooms) }
        joinedRooms = rooms.filter { !$0.isInvite && !$0.isKnocked }
        knockedIds = Set(rooms.filter { $0.isKnocked && !$0.isInvite }.map(\.id))
        notificationOverrides = notificationOverrides.filter { id, mode in
            joinedRooms.first { $0.id == id }?.notificationMode != mode
        }
        invites = rooms.filter(\.isInvite)
        mentionRooms = joinedRooms.filter { $0.mentionCount > 0 }
        roomsReceived = true
        refreshGraph()
    }

    /// The space graph comes from local state; refresh it shortly after rooms or spaces change
    func refreshGraph() {
        graphTask?.cancel()
        let delay: Duration = isLoaded ? .milliseconds(150) : .zero
        graphTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard let self, !Task.isCancelled else { return }
            defer { if self.roomsReceived && self.spacesReceived { self.isLoaded = true } }
            guard let graph = try? await self.client.spaceGraph() else { return }
            let children = Dictionary(graph.map { ($0.spaceId, $0.children.map(\.roomId)) }, uniquingKeysWith: { a, _ in a })
            func descendants(of id: String, seen: inout Set<String>) {
                for child in children[id] ?? [] where seen.insert(child).inserted {
                    descendants(of: child, seen: &seen)
                }
            }
            self.graph = graph
            self.spaceRooms = Dictionary(uniqueKeysWithValues: self.spaces.map { space in
                var seen = Set<String>()
                descendants(of: space.id, seen: &seen)
                return (space.id, seen)
            })
        }
    }
}
