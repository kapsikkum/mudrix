import SwiftUI
import WizardChatCore

/// The cosmetic roles of the Modern space a room is in, with what is needed to tell which look a person gets
struct RoomRoles {
    var roles = SpaceModern.noRoles
    var powerLevels: [String: JSONValue]?
    var creators: Set<String> = []

    static let none = RoomRoles()

    func color(of userId: String) -> Color? {
        guard !roles.isEmpty else { return nil }
        let level = SpaceModern.powerLevel(of: userId, in: powerLevels)
        let builtin = SpaceModern.builtin(creators: creators, userId: userId, powerLevel: level)
        return SpaceModern.roleColor(roles, userId: userId, builtin: builtin).map { Color(hex: $0) }
    }
}

private struct RoomRolesKey: EnvironmentKey {
    static let defaultValue = RoomRoles.none
}

extension EnvironmentValues {
    var roomRoles: RoomRoles {
        get { self[RoomRolesKey.self] }
        set { self[RoomRolesKey.self] = newValue }
    }
}

/// Reads the roles that apply to one room: the nearest space above it that has some (Modern spaces only). The space's
/// Mudrix state comes from `MudrixRoomStates`; its power levels decide whether the roles can be trusted.
@MainActor
final class RoomRolesLoader: ObservableObject {
    @Published private(set) var current = RoomRoles.none
    private var chain: [String] = []
    private var levels: [String: [String: JSONValue]] = [:]
    private var ownLevels: [String: JSONValue]?
    private var creators: Set<String> = []

    func load(roomId: String, client: WizardClient, graph: [SpaceNode]) async {
        chain = SpaceModern.rolesChain(of: roomId, in: graph)
        guard let first = chain.first else {
            current = .none
            return
        }
        let store = MudrixRoomStates.shared
        store.ensure(SpaceModern.rootSpace(of: first, in: graph))
        chain.forEach { store.ensure($0) }
        var found: [String: [String: JSONValue]] = [:]
        for id in chain {
            if let settings = try? await client.localRoomSettings(roomId: id), let object = settings.powerLevels.object {
                found[id] = object
            }
        }
        levels = found
        if let settings = try? await client.localRoomSettings(roomId: roomId) {
            ownLevels = settings.powerLevels.object
            creators = Set(settings.creators)
        }
        rebuild(graph: graph)
    }

    func rebuild(graph: [SpaceNode]) {
        let states = MudrixRoomStates.shared
        guard let first = chain.first,
              SpaceModern.style(of: states.state(SpaceModern.rootSpace(of: first, in: graph))) == .modern else {
            current = .none
            return
        }
        for id in chain {
            guard let state = states.state(id) else { continue }
            let roles = SpaceModern.readRoles(state, powerLevels: levels[id])
            if !roles.isEmpty {
                current = RoomRoles(roles: roles, powerLevels: ownLevels, creators: creators)
                return
            }
        }
        current = .none
    }
}

private struct RoomRolesProvider: ViewModifier {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    @StateObject private var loader = RoomRolesLoader()
    @ObservedObject private var states = MudrixRoomStates.shared

    func body(content: Content) -> some View {
        content
            .environment(\.roomRoles, loader.current)
            .task(id: roomId) {
                guard let client = session.client else { return }
                await loader.load(roomId: roomId, client: client, graph: session.roomList?.graph ?? [])
            }
            .onChange(of: states.revision) { _, _ in
                loader.rebuild(graph: session.roomList?.graph ?? [])
            }
    }
}

extension View {
    /// Makes the roles of `roomId`'s space available to names below (`\.roomRoles`)
    func roomRoles(for roomId: String) -> some View {
        modifier(RoomRolesProvider(roomId: roomId))
    }
}
