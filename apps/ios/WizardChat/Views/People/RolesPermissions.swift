import WizardChatCore
import SwiftUI

enum RoleLevel: Int64, CaseIterable, Identifiable {
    case member = 0, moderator = 50, admin = 100
    var id: Int64 { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .member: return "profile.roleMember"
        case .moderator: return "profile.roleModerator"
        case .admin: return "profile.roleAdmin"
        }
    }

    var whoTitle: LocalizedStringKey {
        switch self {
        case .member: return "room.everyone"
        case .moderator: return "room.moderators"
        case .admin: return "room.admins"
        }
    }
}

extension Member {
    var level: Int64 { powerLevel.map(Int64.init) ?? .max }
}

struct RoleRights {
    let ownLevel: Int64
    let canEditLevels: Bool

    func canChange(targetLevel: Int64, isSelf: Bool) -> Bool {
        canEditLevels && (isSelf || targetLevel < ownLevel)
    }

    func canAssign(_ level: Int64) -> Bool { canEditLevels && level <= ownLevel }

    static func load(client: WizardClient?, roomId: String) async -> RoleRights {
        guard let details = try? await client?.roomDetails(roomId: roomId) else {
            return RoleRights(ownLevel: 0, canEditLevels: false)
        }
        return RoleRights(ownLevel: details.ownPowerLevel.map(Int64.init) ?? .max,
                          canEditLevels: details.permissions.changePermissions)
    }
}

struct RoleMenu: View {
    let roomId: String
    let userId: String
    let currentLevel: Int64
    let rights: RoleRights
    let onChanged: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var confirmLevel: RoleLevel?
    @State private var error: String?

    private var isSelf: Bool { userId == session.userId }

    var body: some View {
        Menu {
            ForEach(RoleLevel.allCases) { level in
                Button {
                    // Making someone your equal, or lowering yourself, can't be undone by you.
                    if (level.rawValue >= rights.ownLevel && !isSelf) || (isSelf && level.rawValue < currentLevel) {
                        confirmLevel = level
                    } else {
                        Task { await set(level) }
                    }
                } label: {
                    if currentLevel == level.rawValue {
                        Label(menu: level.title, icon: "ph-check-bold")
                    } else {
                        Text(level.title)
                    }
                }
                .disabled(!rights.canAssign(level.rawValue))
            }
        } label: {
            LabeledContent {
                Text(Self.name(for: currentLevel)).foregroundStyle(theme.textMuted)
            } label: {
                Label(String(localized: "room.members.role"), image: "ph-shield-check-regular")
            }
        }
        .alert(confirmTitle, isPresented: Binding(get: { confirmLevel != nil }, set: { if !$0 { confirmLevel = nil } }),
               presenting: confirmLevel) { level in
            Button(String(localized: "room.changeRole"), role: .destructive) { Task { await set(level) } }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        } message: { _ in
            Text(isSelf ? String(localized: "room.selfDemoteWarning") : String(localized: "room.equalLevelWarning"))
        }
        if let error {
            Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
        }
    }

    private var confirmTitle: String {
        isSelf ? String(localized: "room.lowerYourOwnRole") : String(localized: "room.giveThemYourLevel")
    }

    static func name(for level: Int64) -> LocalizedStringKey {
        switch level {
        case .max: return "room.creator"
        case 100...: return "profile.roleAdmin"
        case 50..<100: return "profile.roleModerator"
        case 0: return "profile.roleMember"
        default: return LocalizedStringKey(L10n.format("room.customLevel", "\(level)"))
        }
    }

    private func set(_ level: RoleLevel) async {
        do {
            try await session.requireClient.setPowerLevel(roomId: roomId, userId: userId, level: Double(level.rawValue))
            error = nil
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct RolesPermissionsView: View {
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var levels: [String: JSONValue]?
    @State private var staff: [Member] = []
    @State private var rights = RoleRights(ownLevel: 0, canEditLevels: false)
    @State private var selected: String?
    @State private var error: String?

    private struct Permission: Identifiable {
        let id: String
        let title: LocalizedStringKey
        let icon: String
        let key: String
        var event: String?
        let fallback: Int64
    }

    private let permissions: [Permission] = [
        .init(id: "send", title: "room.settings.permissions.rows.send_message", icon: "ph-chat-circle-regular", key: "events_default", fallback: 0),
        .init(id: "invite", title: "room.invitePeople", icon: "ph-user-plus-regular", key: "invite", fallback: 0),
        .init(id: "kick", title: "room.removePeople", icon: "ph-user-minus-regular", key: "kick", fallback: 50),
        .init(id: "ban", title: "room.banPeople", icon: "ph-prohibit-regular", key: "ban", fallback: 50),
        .init(id: "redact", title: "room.deleteOthersMessages", icon: "ph-trash-regular", key: "redact", fallback: 50),
        .init(id: "name", title: "room.changeName", icon: "ph-text-aa-regular", key: "events", event: "m.room.name", fallback: 50),
        .init(id: "topic", title: "room.settings.permissions.rows.change_topic", icon: "ph-text-align-left-regular", key: "events", event: "m.room.topic", fallback: 50),
        .init(id: "avatar", title: "room.changePicture", icon: "ph-image-regular", key: "events", event: "m.room.avatar", fallback: 50),
        .init(id: "state", title: "room.settings.permissions.rows.other_state_events", icon: "ph-gear-regular", key: "state_default", fallback: 50),
    ]

    var body: some View {
        ThemedForm {
            Section {
                if staff.isEmpty {
                    Text(String(localized: "room.noAdminsOrModerators")).foregroundStyle(theme.textMuted)
                }
                ForEach(staff, id: \.userId) { member in
                    Button { selected = member.userId } label: {
                        HStack(spacing: WZ.Space.space5) {
                            AvatarView(name: member.displayName ?? member.userId, url: member.avatarUrl, size: WZ.SizeAvatar.sm)
                            Text(member.displayName ?? member.userId)
                                .foregroundStyle(theme.textPrimary)
                                .lineLimit(1)
                            Spacer()
                            Text(RoleMenu.name(for: member.level))
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                    }
                }
            } header: {
                Text(String(localized: "room.settings.permissions.groups.roles"))
            } footer: {
                Text(String(localized: "room.changeSomeoneSRole"))
            }

            if let levels {
                Section {
                    ForEach(permissions) { permission in
                        permissionRow(permission, current: value(of: permission, in: levels))
                    }
                } header: {
                    Text(String(localized: "room.permissions"))
                } footer: {
                    if !rights.canEditLevels {
                        Text(String(localized: "room.onlyPeopleAllowedTo"))
                    }
                }
            }
            if let error {
                Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
            }
        }
        .tint(theme.control)
        .navigationTitle(String(localized: "room.settings.permissions.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: Binding(get: { selected.map(IdentifiedString.init) }, set: { selected = $0?.id })) { item in
            UserProfileSheet(userId: item.id, roomId: roomId) { Task { await load() } }
        }
    }

    private func value(of permission: Permission, in levels: [String: JSONValue]) -> Int64 {
        let raw = permission.event.map { levels["events"]?[$0] } ?? levels[permission.key]
        if let number = raw?.number { return Int64(number) }
        if permission.event != nil, let number = levels["state_default"]?.number { return Int64(number) }
        return permission.fallback
    }

    private func permissionRow(_ permission: Permission, current: Int64) -> some View {
        Picker(selection: Binding(get: { Self.closest(current) }, set: { level in
            Task { await apply(permission, level: level.rawValue) }
        })) {
            ForEach(RoleLevel.allCases) { level in
                Text(level.whoTitle).tag(level)
            }
        } label: {
            Label(permission.title, image: permission.icon)
        }
        .disabled(!rights.canEditLevels)
    }

    private static func closest(_ level: Int64) -> RoleLevel {
        level >= 100 ? .admin : level >= 50 ? .moderator : .member
    }

    private func load() async {
        guard let client = session.client else { return }
        rights = await RoleRights.load(client: client, roomId: roomId)
        levels = (try? await client.stateEvent(roomId: roomId, eventType: "m.room.power_levels", stateKey: ""))??.object ?? [:]
        let members = (try? await client.members(roomId: roomId)) ?? []
        staff = members.filter { !$0.isInvite && $0.level >= 50 }.sorted { $0.level > $1.level }
    }

    private func apply(_ permission: Permission, level: Int64) async {
        guard var levels, let client = session.client else { return }
        if let event = permission.event {
            var events = levels["events"]?.object ?? [:]
            events[event] = .number(Double(level))
            levels["events"] = .object(events)
        } else {
            levels[permission.key] = .number(Double(level))
        }
        do {
            try await client.setPowerLevels(roomId: roomId, content: .object(levels))
            error = nil
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
