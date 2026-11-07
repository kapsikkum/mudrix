import SwiftUI
import WizardChatCore

/// The roles a space defines and whether the signed-in person may change them, from the space's own state and power levels
struct RoleManagement {
    var roles = SpaceModern.noRoles
    var canManage = false
    var modern = false

    static let none = RoleManagement()
}

/// Reads the roles of one space (what the Roles screen edits) together with the power levels that say who may change them
@MainActor
final class SpaceRoleManager: ObservableObject {
    @Published private(set) var management = RoleManagement.none
    private var spaceId = ""
    private var powerLevels: [String: JSONValue]?
    private var creators: Set<String> = []
    private var me: String?
    private var isSpace = false
    private var hasLevels = false

    func load(spaceId: String, session: MatrixSession) async {
        guard let client = session.client else { return }
        self.spaceId = spaceId
        me = client.userId
        let graph = session.roomList?.graph ?? []
        isSpace = graph.contains { $0.spaceId == spaceId }
        guard isSpace else {
            management = .none
            return
        }
        let store = MudrixRoomStates.shared
        store.ensure(SpaceModern.rootSpace(of: spaceId, in: graph))
        store.ensure(spaceId, force: true)
        if let settings = try? await client.localRoomSettings(roomId: spaceId) {
            powerLevels = settings.powerLevels.object
            creators = Set(settings.creators)
            hasLevels = true
        }
        rebuild(graph: graph)
    }

    func rebuild(graph: [SpaceNode]) {
        let states = MudrixRoomStates.shared
        guard isSpace, hasLevels, let me, let state = states.state(spaceId) else {
            management = .none
            return
        }
        let root = SpaceModern.rootSpace(of: spaceId, in: graph)
        let modern = SpaceModern.style(of: states.state(root)) == .modern
        let types = [MudrixTypes.spaceRoles, MudrixTypes.spaceMemberRoles]
        let can = types.allSatisfy { type in
            SpaceModern.trusted(powerLevels, type)
                && SpaceModern.canSendState(powerLevels, creators: creators, userId: me, type: type)
        }
        management = RoleManagement(roles: SpaceModern.readRoles(state, powerLevels: powerLevels), canManage: can, modern: modern)
    }

    /// Whether the signed-in person may send this kind of state in the space
    func canSend(_ type: String) -> Bool {
        guard let me else { return false }
        return SpaceModern.canSendState(powerLevels, creators: creators, userId: me, type: type)
    }

    /// Writes the roles one person holds (their state key is their user id without the `@`)
    static func saveMemberRoles(client: WizardClient, spaceId: String, userId: String, roleIds: [String]) async throws {
        let ids = roleIds.prefix(SpaceModern.maxRolesPerMember).map { JSONValue.string($0) }
        let content: JSONValue = .object(["roles": .array(ids)])
        try await MudrixRoomStates.shared.set(
            client: client, roomId: spaceId, type: MudrixTypes.spaceMemberRoles,
            content: content, stateKey: SpaceModern.memberStateKey(userId)
        )
    }
}

/// Keeps a `SpaceRoleManager` loaded and up to date for `spaceId`
private struct SpaceRoleManagerHost: ViewModifier {
    @ObservedObject var manager: SpaceRoleManager
    let spaceId: String
    @EnvironmentObject private var session: MatrixSession
    @ObservedObject private var states = MudrixRoomStates.shared

    func body(content: Content) -> some View {
        content
            .task(id: spaceId) { await manager.load(spaceId: spaceId, session: session) }
            .onChange(of: states.revision) { _, _ in
                manager.rebuild(graph: session.roomList?.graph ?? [])
            }
    }
}

/// A menu on one member to hand out the space's roles; only for Modern spaces and people allowed to write both role types
private struct MemberRolesMenu: ViewModifier {
    @ObservedObject var manager: SpaceRoleManager
    let spaceId: String
    let member: Member
    @EnvironmentObject private var session: MatrixSession

    private var held: Set<String> {
        Set(manager.management.roles.byUser[member.userId]?.map(\.id) ?? [])
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        let current = manager.management
        if current.canManage, current.modern, !current.roles.roles.isEmpty, !member.isInvite {
            content.contextMenu {
                ForEach(current.roles.roles, id: \.id) { role in
                    Button { toggle(role) } label: {
                        if held.contains(role.id) {
                            Label(role.name, systemImage: "checkmark")
                        } else {
                            Text(role.name)
                        }
                    }
                }
            }
        } else {
            content
        }
    }

    private func toggle(_ role: SpaceModern.Role) {
        guard let client = session.client else { return }
        var next = held
        if next.contains(role.id) {
            next.remove(role.id)
        } else {
            guard next.count < SpaceModern.maxRolesPerMember else { return }
            next.insert(role.id)
        }
        // In the order of the space's roles
        let ids = manager.management.roles.roles.map(\.id).filter { next.contains($0) }
        let spaceId = spaceId
        let userId = member.userId
        Task {
            do {
                try await SpaceRoleManager.saveMemberRoles(client: client, spaceId: spaceId, userId: userId, roleIds: ids)
            } catch {
                CopyToast.shared.show(L10n.format("room.settings.roles.saveFailed", error.localizedDescription))
            }
        }
    }
}

extension View {
    func spaceRoleManager(_ manager: SpaceRoleManager, spaceId: String) -> some View {
        modifier(SpaceRoleManagerHost(manager: manager, spaceId: spaceId))
    }

    func memberRolesMenu(_ manager: SpaceRoleManager, spaceId: String, member: Member) -> some View {
        modifier(MemberRolesMenu(manager: manager, spaceId: spaceId, member: member))
    }
}
