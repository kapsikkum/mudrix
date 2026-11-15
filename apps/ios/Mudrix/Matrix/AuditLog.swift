import Foundation
import MudrixCore

/// One line of a room's audit log: who did what, when, and the values the action's text needs. The wording is the
/// web's `roomsettings/AuditLog.tsx` and Android's `matrix/AuditLog.kt`, under `room.settings.auditLog.action.*`.
struct AuditEntry: Identifiable, Equatable {
    let id: String
    /// Milliseconds since 1970
    let at: Int
    let category: Category
    /// Whoever did it, as they are known in the room
    let actor: String
    /// The name below `room.settings.auditLog.action.`
    let action: String
    /// The action's arguments, in the order its text wants them
    let args: [String]

    enum Category: String, CaseIterable, Identifiable {
        case members, permissions, settings, rooms, roles

        var id: String { rawValue }

        /// The filter chip's text
        var titleKey: String { "room.settings.auditLog.category.\(rawValue)" }
    }

    /// "Alice joined", "Bob changed Carol from member to moderator"
    var text: String { L10n.args("room.settings.auditLog.action.\(action)", args) }
}

/// Turns the membership and state changes of a timeline, and a room's role state, into the web's audit log lines.
/// Everything here is pure: the view supplies the changes and the room's role events.
enum AuditLog {
    /// A change the timeline handed over, as the audit log needs it
    struct Change: Equatable {
        let id: String
        let at: Int
        let sender: String
        let senderName: String?
        let membership: EntryContent.Membership?
        let state: EntryContent.State?
    }

    /// The membership change codes of the core, as audit actions
    private static let membershipActions: [String: String] = [
        "Joined": "joined",
        "InvitationAccepted": "joined",
        "Left": "left",
        "Invited": "invited",
        "KnockAccepted": "invited",
        "Banned": "banned",
        "KickedAndBanned": "banned",
        "Unbanned": "unbanned",
        "Kicked": "kicked",
        "InvitationRejected": "inviteDeclined",
        "InvitationRevoked": "inviteRevoked",
        "Knocked": "knocked",
        "KnockRetracted": "knockCancelled",
        "KnockDenied": "knockDenied",
    ]

    /// Every audit line of the room from its changes and role events, newest first
    static func entries(changes: [Change], roleEvents: [StateEventView] = [],
                        roomName: (String) -> String = { $0 }) -> [AuditEntry] {
        var out: [AuditEntry] = []
        for change in changes {
            for (index, part) in parts(of: change, roomName: roomName).enumerated() {
                out.append(AuditEntry(id: "\(change.id):\(index)", at: change.at, category: part.category,
                                      actor: actor(of: change), action: part.action, args: part.args))
            }
        }
        out.append(contentsOf: roleEntries(roleEvents))
        return out.sorted { $0.at > $1.at }
    }

    /// The lines the room's role state events stand for: the space's roles, or one person's roles
    static func roleEntries(_ events: [StateEventView]) -> [AuditEntry] {
        let rolesTypes = Set(MudrixTypes.typeAndLegacy(MudrixTypes.spaceRoles))
        let memberRolesTypes = Set(MudrixTypes.typeAndLegacy(MudrixTypes.spaceMemberRoles))
        return events.compactMap { event in
            let action: String
            var args: [String] = []
            if rolesTypes.contains(event.type) {
                action = "rolesChanged"
            } else if memberRolesTypes.contains(event.type) {
                action = "memberRolesChanged"
                args = [nameOf(event.stateKey)]
            } else {
                return nil
            }
            return AuditEntry(id: event.eventId ?? "\(event.type):\(event.stateKey)", at: event.originServerTs,
                              category: .roles, actor: nameOf(event.sender), action: action, args: args)
        }
    }

    /// The user ID as they are named in the log (`@alice:example.org` to `alice`)
    static func nameOf(_ userId: String) -> String {
        let bare = userId.hasPrefix("@") ? String(userId.dropFirst()) : userId
        guard let colon = bare.firstIndex(of: ":") else { return bare.isEmpty ? userId : bare }
        let local = String(bare[bare.startIndex..<colon])
        return local.isEmpty ? userId : local
    }

    /// The `room.settings.auditLog.rule.` key of a join rule, or the raw value for one this version does not know
    static func joinRuleText(_ rule: String) -> String {
        let known = ["public", "invite", "knock", "restricted", "knock_restricted"]
        guard known.contains(rule) else { return rule }
        return L10n.args("room.settings.auditLog.rule.\(rule)", [])
    }

    /// `<who> <what>`, the same shape Android and the web show
    static func line(_ entry: AuditEntry) -> String {
        entry.actor.isEmpty ? entry.text : "\(entry.actor) \(entry.text)"
    }

    // MARK: Internals

    private struct Part {
        let category: AuditEntry.Category
        let action: String
        var args: [String] = []
    }

    private static func actor(of change: Change) -> String {
        if let name = change.senderName, !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
        return nameOf(change.sender)
    }

    private static func parts(of change: Change, roomName: (String) -> String) -> [Part] {
        if let membership = change.membership {
            guard let code = membership.change, let action = membershipActions[code] else { return [] }
            let name = membership.displayName?.trimmingCharacters(in: .whitespaces) ?? ""
            let target = name.isEmpty ? nameOf(membership.userId) : name
            return [Part(category: .members, action: action, args: [target])]
        }
        if let state = change.state { return stateParts(state, roomName: roomName) }
        return []
    }

    private static func stateParts(_ state: EntryContent.State, roomName: (String) -> String) -> [Part] {
        let body = state.content.object ?? [:]
        let previous = state.prevContent?.object
        func string(_ key: String, _ from: [String: JSONValue]? = nil) -> String? {
            (from ?? body)[key]?.string
        }
        switch state.eventType {
        case "m.room.power_levels":
            return powerParts(body, previous)
        case "m.room.name":
            guard let name = string("name"), !name.isEmpty else {
                return [Part(category: .settings, action: "nameRemoved")]
            }
            return [Part(category: .settings, action: "renamed", args: [name])]
        case "m.room.topic":
            return [Part(category: .settings, action: "topicChanged")]
        case "m.room.avatar":
            let removed = (string("url") ?? "").isEmpty
            return [Part(category: .settings, action: removed ? "avatarRemoved" : "avatarChanged")]
        case "m.room.join_rules":
            let rule = string("join_rule") ?? ""
            guard rule != (string("join_rule", previous) ?? "") else { return [] }
            return [Part(category: .settings, action: "joinRulesChanged", args: [joinRuleText(rule)])]
        case "m.room.history_visibility":
            guard (string("history_visibility") ?? "") != (string("history_visibility", previous) ?? "") else { return [] }
            return [Part(category: .settings, action: "historyChanged")]
        case "m.room.encryption":
            return [Part(category: .settings, action: "encryptionOn")]
        case "m.room.canonical_alias":
            return [Part(category: .settings, action: "aliasChanged")]
        case "m.room.tombstone":
            return [Part(category: .settings, action: "upgraded")]
        case "m.space.child":
            let added = !(body["via"]?.array ?? []).isEmpty
            let wasThere = !(previous?["via"]?.array ?? []).isEmpty
            // A suggestion or an ordering tweak is not worth a line
            guard added != wasThere else { return [] }
            return [Part(category: .rooms, action: added ? "roomAdded" : "roomRemoved",
                         args: [roomName(state.stateKey)])]
        default:
            return []
        }
    }

    private static func powerParts(_ body: [String: JSONValue], _ previous: [String: JSONValue]?) -> [Part] {
        guard let previous else {
            return [Part(category: .permissions, action: "permissionsChanged")]
        }
        var out: [Part] = []
        let now = usersOf(body["users"])
        let before = usersOf(previous["users"])
        for userId in Set(now.keys).union(before.keys) {
            let from = before[userId] ?? 0
            let to = now[userId] ?? 0
            guard from != to else { continue }
            out.append(Part(category: .permissions, action: "powerChanged",
                            args: [nameOf(userId), levelText(from), levelText(to)]))
        }
        // Something other than a person's level changed (who may do what)
        var withoutUsers = body
        withoutUsers.removeValue(forKey: "users")
        var beforeWithoutUsers = previous
        beforeWithoutUsers.removeValue(forKey: "users")
        if SettingsSync.stable(.object(withoutUsers)) != SettingsSync.stable(.object(beforeWithoutUsers)) {
            out.append(Part(category: .permissions, action: "permissionsChanged"))
        }
        return out
    }

    private static func usersOf(_ value: JSONValue?) -> [String: Double] {
        guard let users = value?.object else { return [:] }
        var out: [String: Double] = [:]
        for (userId, entry) in users {
            if let level = entry.number { out[userId] = level }
        }
        return out
    }

    private static func levelText(_ level: Double) -> String {
        level == level.rounded() ? String(Int(level)) : String(level)
    }
}
