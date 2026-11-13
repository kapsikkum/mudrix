import Foundation

/// Who may join a room, as the room settings offer it (the option list of Android's `matrix/RoomAddresses.kt`).
enum RoomAccess: String, CaseIterable {
    case invite
    case spaceMembers = "restricted"
    case knock
    case publicAccess = "public"

    /// The option for a join rule; `knock_restricted` counts as knocking, anything unknown as invite only.
    static func of(_ rule: String) -> RoomAccess {
        switch rule {
        case "public": .publicAccess
        case "restricted": .spaceMembers
        case "knock", "knock_restricted": .knock
        default: .invite
        }
    }

    /// The rule written back, or nil when the option is the one already in effect.
    func rule(current: RoomAccess) -> String? {
        self == current ? nil : rawValue
    }

    /// Whether joining needs a knock that a moderator answers; only the plain `knock` rule does.
    static func requiresKnock(_ rule: String?) -> Bool {
        rule == "knock"
    }
}

/// How much of a room's history new members can read, as the room settings offer it.
enum RoomHistory: String, CaseIterable {
    case worldReadable = "world_readable"
    case shared
    case invited
    case joined

    /// The locale key of the option.
    var labelKey: String {
        switch self {
        case .worldReadable: "room.settings.security.historyAnyone"
        case .shared: "room.settings.security.historyShared"
        case .invited: "room.settings.security.historyInvited"
        case .joined: "room.settings.security.historyMembersSinceJoin"
        }
    }
}

extension RoomAccess {
    /// The locale key of the option; a room that knocks with space members is still shown as knocking.
    func labelKey(rule: String) -> String {
        switch self {
        case .invite: "room.settings.security.accessInvite"
        case .spaceMembers: "room.settings.security.accessSpaceMembers"
        case .knock: rule == "knock_restricted" ? "room.settings.auditLog.rule.knock_restricted" : "room.settings.security.accessKnock"
        case .publicAccess: "room.settings.security.accessPublic"
        }
    }
}
