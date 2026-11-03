import Foundation
import WizardChatCore

extension RoomSummary: @retroactive Identifiable {
    var displayName: String { name ?? canonicalAlias ?? id }
    var unreadCount: Int { markedUnread ? max(unreadMessages, 1) : unreadMessages }
    var mentionCount: Int { unreadMentions }
}

extension SpaceSummary: @retroactive Identifiable {}

enum SidebarSelection: Hashable {
    case home
    case dms
    case space(String)
}

struct UnreadState {
    var unread = false
    var mention = false
}

@MainActor
final class RoomListModel: ObservableObject {
    @Published private(set) var joinedRooms: [RoomSummary] = []
    @Published private(set) var invites: [RoomSummary] = []
    @Published private(set) var mentionRooms: [RoomSummary] = []
    @Published private(set) var spaces: [SpaceSummary] = []
    @Published private(set) var spaceRooms: [String: Set<String>] = [:]
    @Published private(set) var isLoaded = false

    let client: WizardClient
    private var rooms: [RoomSummary] = []
    private var subscriptions: [Subscription] = []
    private var graphTask: Task<Void, Never>?
    private var roomsReceived = false
    private var spacesReceived = false

    init(client: WizardClient) {
        self.client = client
    }

    func start() {
        subscriptions = [
            client.watchRooms(pageSize: 5000) { [weak self] diffs in
                MainActor.assumeIsolated { self?.apply(diffs) }
            },
            client.watchSpaces { [weak self] diffs in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    diffs.forEach { $0.apply(to: &self.spaces) }
                    self.spacesReceived = true
                    self.refreshGraph()
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

    private func apply(_ diffs: [ListDiff<RoomSummary>]) {
        diffs.forEach { $0.apply(to: &rooms) }
        joinedRooms = rooms.filter { !$0.isInvite }
        invites = rooms.filter(\.isInvite)
        mentionRooms = joinedRooms.filter { $0.mentionCount > 0 }
        roomsReceived = true
        refreshGraph()
    }

    /// The space graph comes from local state; refresh it shortly after rooms or spaces change
    private func refreshGraph() {
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
            self.spaceRooms = Dictionary(uniqueKeysWithValues: self.spaces.map { space in
                var seen = Set<String>()
                descendants(of: space.id, seen: &seen)
                return (space.id, seen)
            })
        }
    }
}
