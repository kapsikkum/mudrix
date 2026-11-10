import SwiftUI
import WizardChatCore

private enum RoleEdit: Identifiable {
    case built(SpaceModern.Builtin)
    case own(SpaceModern.Role, isNew: Bool)

    var id: String {
        switch self {
        case .built(let key): return "b-" + key.rawValue
        case .own(let role, _): return "o-" + role.id
        }
    }
}

/// The Roles screen of a Modern space: rename and colour the built-in roles, make your own, order and delete them
struct SpaceRolesView: View {
    let spaceId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @StateObject private var manager = SpaceRoleManager()
    @State private var editing: RoleEdit?
    @State private var deleting: SpaceModern.Role?
    @State private var error: String?

    private var management: RoleManagement { manager.management }

    var body: some View {
        Form {
            Section {
                ForEach(SpaceModern.Builtin.allCases, id: \.rawValue) { key in
                    let look = management.roles.builtin[key]
                    Button { editing = .built(key) } label: {
                        RoleRowLabel(name: look?.name ?? Self.builtinName(key), color: look?.color, subtitle: nil)
                    }
                    .disabled(!management.canManage)
                }
            } header: {
                Text(management.canManage ? String(localized: "room.settings.roles.note") : String(localized: "room.settings.roles.readOnly"))
                    .textCase(nil)
            }
            Section {
                ForEach(management.roles.roles, id: \.id) { role in
                    let count = management.roles.byUser.values.filter { held in held.contains { $0.id == role.id } }.count
                    Button { editing = .own(role, isNew: false) } label: {
                        RoleRowLabel(name: role.name, color: role.color,
                                     subtitle: L10n.plural("room.settings.roles.memberCount", count: count, count))
                    }
                    .disabled(!management.canManage)
                }
                if management.canManage, management.roles.roles.count < SpaceModern.maxRoles {
                    Button {
                        let fresh = SpaceModern.Role(id: Self.newRoleId(), name: L10n.format("room.settings.roles.newRole"))
                        editing = .own(fresh, isNew: true)
                    } label: {
                        Label(String(localized: "room.settings.roles.add"), image: "ph-plus-regular")
                    }
                }
            }
            if let error {
                Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
            }
        }
        .tint(theme.control)
        .navigationTitle(String(localized: "room.settings.roles.title"))
        .navigationBarTitleDisplayMode(.inline)
        .spaceRoleManager(manager, spaceId: spaceId)
        .sheet(item: $editing) { edit in
            editor(for: edit)
        }
        .confirmationDialog(
            L10n.format("room.settings.roles.deleteTitle", deleting?.name ?? ""),
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            Button(String(localized: "room.settings.roles.delete"), role: .destructive) {
                if let role = deleting { Task { await delete(role) } }
                deleting = nil
            }
        } message: {
            Text(String(localized: "room.settings.roles.deleteMessage"))
        }
    }

    @ViewBuilder
    private func editor(for edit: RoleEdit) -> some View {
        let roles = management.roles
        switch edit {
        case .built(let key):
            let look = roles.builtin[key]
            RoleEditSheet(
                title: look?.name ?? Self.builtinName(key), initialName: look?.name ?? "", initialColor: look?.color ?? "",
                namePlaceholder: Self.builtinName(key), hoist: nil, canMoveUp: false, canMoveDown: false,
                canReset: look != nil, canDelete: false,
                onSave: { name, color, _ in
                    let cleaned = SpaceModern.cleanRoleName(name)
                    var builtin = roles.builtin
                    builtin[key] = SpaceModern.BuiltinLook(name: cleaned.isEmpty ? nil : cleaned, color: color)
                    Task { await save(roles.roles, builtin: builtin) }
                },
                onMove: { _ in },
                onDelete: {},
                onReset: {
                    var builtin = roles.builtin
                    builtin[key] = nil
                    Task { await save(roles.roles, builtin: builtin) }
                }
            )
        case .own(let role, let isNew):
            let index = roles.roles.firstIndex { $0.id == role.id }
            RoleEditSheet(
                title: role.name, initialName: role.name, initialColor: role.color ?? "",
                namePlaceholder: String(localized: "room.settings.roles.name"), hoist: role.hoist,
                canMoveUp: !isNew && (index ?? 0) > 0,
                canMoveDown: !isNew && index != nil && index! < roles.roles.count - 1,
                canReset: false, canDelete: !isNew,
                onSave: { name, color, hoist in
                    let cleaned = SpaceModern.cleanRoleName(name)
                    guard !cleaned.isEmpty else { return }
                    let updated = SpaceModern.Role(id: role.id, name: cleaned, color: color, hoist: hoist == true)
                    let next = isNew ? roles.roles + [updated] : roles.roles.map { $0.id == updated.id ? updated : $0 }
                    Task { await save(next, builtin: roles.builtin) }
                },
                onMove: { delta in
                    guard let index, roles.roles.indices.contains(index + delta) else { return }
                    var next = roles.roles
                    next.swapAt(index, index + delta)
                    Task { await save(next, builtin: roles.builtin) }
                },
                onDelete: { deleting = role },
                onReset: {}
            )
        }
    }

    static func builtinName(_ key: SpaceModern.Builtin) -> String {
        switch key {
        case .founder: return String(localized: "room.members.founder")
        case .admin: return String(localized: "room.members.admins")
        case .moderator: return String(localized: "room.members.moderators")
        case .member: return String(localized: "common.members")
        }
    }

    private static func newRoleId() -> String {
        let chars = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        return String((0..<12).map { _ in chars[Int.random(in: 0..<chars.count)] })
    }

    private func roleJSON(_ role: SpaceModern.Role) -> JSONValue {
        var object: [String: JSONValue] = ["id": .string(role.id), "name": .string(role.name)]
        if let color = role.color { object["color"] = .string(color) }
        if role.hoist { object["hoist"] = .bool(true) }
        return .object(object)
    }

    private func content(_ roles: [SpaceModern.Role], builtin: [SpaceModern.Builtin: SpaceModern.BuiltinLook]) -> JSONValue {
        var looks: [String: JSONValue] = [:]
        for (key, look) in builtin where look.name != nil || look.color != nil {
            var entry: [String: JSONValue] = [:]
            if let name = look.name { entry["name"] = .string(name) }
            if let color = look.color { entry["color"] = .string(color) }
            looks[key.rawValue] = .object(entry)
        }
        return .object([
            "roles": .array(roles.prefix(SpaceModern.maxRoles).map { roleJSON($0) }),
            "builtin": .object(looks),
        ])
    }

    private func save(_ roles: [SpaceModern.Role], builtin: [SpaceModern.Builtin: SpaceModern.BuiltinLook]) async {
        guard let client = session.client else { return }
        do {
            try await MudrixRoomStates.shared.set(
                client: client, roomId: spaceId, type: MudrixTypes.spaceRoles, content: content(roles, builtin: builtin)
            )
            CopyToast.shared.show(L10n.format("room.settings.roles.saved"))
            error = nil
        } catch {
            self.error = L10n.format("room.settings.roles.saveFailed", error.localizedDescription)
        }
    }

    private func delete(_ role: SpaceModern.Role) async {
        guard let client = session.client else { return }
        let current = management.roles
        do {
            try await MudrixRoomStates.shared.set(
                client: client, roomId: spaceId, type: MudrixTypes.spaceRoles,
                content: content(current.roles.filter { $0.id != role.id }, builtin: current.builtin)
            )
        } catch {
            self.error = L10n.format("room.settings.roles.saveFailed", error.localizedDescription)
            return
        }
        // The role is gone first: a leftover assignment names nothing and is ignored, so a failure here is only untidy
        let holders = current.byUser.filter { $0.value.contains { $0.id == role.id } }
        var failed = 0
        var first: String?
        for (userId, held) in holders {
            do {
                try await SpaceRoleManager.saveMemberRoles(
                    client: client, spaceId: spaceId, userId: userId, roleIds: held.filter { $0.id != role.id }.map(\.id)
                )
            } catch {
                failed += 1
                first = first ?? error.localizedDescription
            }
        }
        if failed > 0 {
            error = L10n.format("room.settings.roles.deletePartial", failed, holders.count, first ?? "")
        }
    }
}

private struct RoleRowLabel: View {
    let name: String
    let color: String?
    let subtitle: String?
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            Circle()
                .fill(color.map { Color(hex: $0) } ?? theme.fill)
                .frame(width: WZ.Space.space7, height: WZ.Space.space7)
            Text(name).foregroundStyle(theme.textPrimary).lineLimit(1)
            Spacer()
            if let subtitle {
                Text(subtitle).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
        }
        .contentShape(Rectangle())
    }
}
