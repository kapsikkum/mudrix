import Foundation
import WizardChatCore

/// How a space's rooms are listed: `matrix` (an avatar on every room) or `modern` (plain channel rows, categories, voice channels)
enum RoomListStyle: String {
    case matrix, modern
}

/// The pure rules behind the Modern room list and the cosmetic roles: `spaceListStyle.ts`, `spaceBanner.ts`, `voiceChannel.ts`,
/// `modernRoomList.ts`, `spaceOrder.ts` and `spaceRoles.ts` of the web (`SpaceModern.kt` on Android)
enum SpaceModern {
    static func style(of state: MudrixRoomState?) -> RoomListStyle {
        state?.get(MudrixTypes.spaceListStyle)?["style"]?.string == "modern" ? .modern : .matrix
    }

    /// The top space `spaceId` is in (itself when it has no parent), following the first parent
    static func rootSpace(of spaceId: String, in graph: [SpaceNode]) -> String {
        var seen: Set<String> = [spaceId]
        var current = spaceId
        while true {
            let at = current
            guard let parent = graph.first(where: { !seen.contains($0.spaceId) && $0.children.contains { $0.roomId == at } }) else {
                return current
            }
            seen.insert(parent.spaceId)
            current = parent.spaceId
        }
    }

    static func parent(of roomId: String, in graph: [SpaceNode]) -> String? {
        graph.first { node in node.children.contains { $0.roomId == roomId } }?.spaceId
    }

    // MARK: Banner

    struct Banner: Equatable {
        var url: String?
        var color: String?
    }

    /// Preset id to the two colours of its gradient (hex), as the web's `SPACE_BANNER_PRESETS`
    static let bannerPresets: [(id: String, from: String, to: String)] = [
        ("pink", "FF3D9A", "FF8CC6"),
        ("red", "E5231F", "FF6A5C"),
        ("orange", "E8741A", "FFB066"),
        ("yellow", "E6B81F", "FFF07A"),
        ("purple", "6A2A96", "C37FE0"),
        ("blue", "0A84FF", "66C8FF"),
        ("teal", "2FC9AC", "A3FFF0"),
        ("green", "2F5D0A", "6AA82A"),
        ("graphite", "1B1B1F", "4A4A52"),
    ]

    static func banner(of state: MudrixRoomState?) -> Banner? {
        guard let content = state?.get(MudrixTypes.spaceBanner) else { return nil }
        let url = content["url"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        let color = content["color"]?.string.flatMap { id in bannerPresets.contains { $0.id == id } ? id : nil }
        return url != nil || color != nil ? Banner(url: url, color: color) : nil
    }

    // MARK: Auto-join and voice flag

    /// The space's own auto-join setting, or nil when it has none and the list style decides
    static func explicitAutoJoin(of state: MudrixRoomState?) -> Bool? {
        state?.get(MudrixTypes.spaceAutoJoin)?["enabled"]?.bool
    }

    static func isVoiceChannelFlagged(_ state: MudrixRoomState?) -> Bool {
        state?.get(MudrixTypes.voiceChannel)?["enabled"]?.bool == true
    }

    // MARK: Ordering and categories

    private static func validOrder(_ order: String?) -> String? {
        guard let order, order.count <= 50, order.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value <= 0x7E }) else { return nil }
        return order
    }

    /// A space's children in the order Matrix defines: a valid `order` first (as text), then older links first, then by room id
    static func orderedChildren(_ node: SpaceNode) -> [SpaceLink] {
        node.children.sorted { a, b in
            switch (validOrder(a.order), validOrder(b.order)) {
            case let (x?, y?) where x != y: return x < y
            case (_?, nil): return true
            case (nil, _?): return false
            default:
                if a.timestamp != b.timestamp { return a.timestamp < b.timestamp }
                return a.roomId < b.roomId
            }
        }
    }

    /// The rooms a Modern space lists under the space itself (`spaceId` nil) or under one of its categories
    struct Category {
        let spaceId: String?
        let roomIds: [String]
        let depth: Int
    }

    /// The categories of `spaceId`: its own rooms first (no header), then each sub-space with its rooms, deeper ones after
    /// their parent. Only spaces we are in are in the graph, so a sub-space we are not in does not show.
    static func categories(in graph: [SpaceNode], of spaceId: String) -> [Category] {
        let byId = Dictionary(graph.map { ($0.spaceId, $0) }, uniquingKeysWith: { a, _ in a })
        guard let top = byId[spaceId] else { return [Category(spaceId: nil, roomIds: [], depth: 0)] }
        var result: [Category] = []
        var seen: Set<String> = [spaceId]
        func walk(_ node: SpaceNode, header: String?, depth: Int) {
            let children = orderedChildren(node)
            result.append(Category(spaceId: header, roomIds: children.filter { byId[$0.roomId] == nil }.map(\.roomId), depth: depth))
            for child in children {
                guard let sub = byId[child.roomId] else { continue }
                if depth < 3, seen.insert(sub.spaceId).inserted { walk(sub, header: sub.spaceId, depth: depth + 1) }
            }
        }
        walk(top, header: nil, depth: 0)
        return result
    }

    /// Text channels first, voice channels below them; each kind keeps its own order
    static func arrange<T>(_ rooms: [T], isVoice: (T) -> Bool) -> [T] {
        rooms.filter { !isVoice($0) } + rooms.filter(isVoice)
    }

    // MARK: Roles

    static let maxRoles = 50
    static let maxRolesPerMember = 20
    static let maxRoleName = 32

    /// Roles only count when they take at least this much power to set, whatever the room allows
    private static let minWriterLevel = 50.0

    struct Role: Equatable {
        let id: String
        let name: String
        var color: String?
        var hoist = false
    }

    /// The roles every Matrix room already has, by power level
    enum Builtin: String, CaseIterable {
        case founder, admin = "100", moderator = "50", member = "0"
    }

    struct BuiltinLook: Equatable {
        var name: String?
        var color: String?
    }

    struct Roles {
        var builtin: [Builtin: BuiltinLook] = [:]
        var roles: [Role] = []
        /// Roles per person (full user id), in the order of `roles`
        var byUser: [String: [Role]] = [:]

        var isEmpty: Bool { roles.isEmpty && builtin.isEmpty }
    }

    static let noRoles = Roles()

    static func cleanRoleName(_ value: String?) -> String {
        guard let value else { return "" }
        let kept = value.unicodeScalars.filter { scalar in
            let v = scalar.value
            if v <= 0x1F || (0x7F...0x9F).contains(v) || (0x200B...0x200F).contains(v) { return false }
            if (0x202A...0x202E).contains(v) || (0x2066...0x2069).contains(v) || v == 0xFEFF { return false }
            return true
        }
        let words = String(kept).split(whereSeparator: { $0.isWhitespace })
        return String(words.joined(separator: " ").prefix(maxRoleName))
    }

    static func isValidRoleColor(_ value: String?) -> Bool {
        guard let value, value.count == 7, value.hasPrefix("#") else { return false }
        return value.dropFirst().allSatisfy { $0.isHexDigit }
    }

    private static func isRoleId(_ value: String) -> Bool {
        (1...24).contains(value.count) && value.unicodeScalars.allSatisfy { scalar in
            ("a"..."z").contains(Character(scalar)) || ("0"..."9").contains(Character(scalar)) || scalar == "_" || scalar == "-"
        }
    }

    /// The power level it takes to send this kind of state in the space
    private static func levelNeeded(_ powerLevels: [String: JSONValue]?, _ type: String) -> Double {
        powerLevels?["events"]?[type]?.number ?? powerLevels?["state_default"]?.number ?? 50
    }

    /// Whether roles of this type can be trusted: only people with real power could have set them
    static func trusted(_ powerLevels: [String: JSONValue]?, _ type: String) -> Bool {
        powerLevels != nil && levelNeeded(powerLevels, type) >= minWriterLevel
    }

    private static func sanitizeRole(_ raw: JSONValue) -> Role? {
        guard let object = raw.object, let id = object["id"]?.string, isRoleId(id) else { return nil }
        let name = cleanRoleName(object["name"]?.string)
        guard !name.isEmpty else { return nil }
        let color = object["color"]?.string.flatMap { isValidRoleColor($0) ? $0.lowercased() : nil }
        return Role(id: id, name: name, color: color, hoist: object["hoist"]?.bool == true)
    }

    /// The roles a space's state holds, checked against the space's power levels (nil power levels: nothing counts)
    static func readRoles(_ state: MudrixRoomState, powerLevels: [String: JSONValue]?) -> Roles {
        guard trusted(powerLevels, MudrixTypes.spaceRoles) else { return noRoles }
        let content = state.get(MudrixTypes.spaceRoles)
        var roles: [Role] = []
        var seen = Set<String>()
        for raw in content?["roles"]?.array ?? [] {
            guard roles.count < maxRoles, let role = sanitizeRole(raw), seen.insert(role.id).inserted else { continue }
            roles.append(role)
        }
        var builtin: [Builtin: BuiltinLook] = [:]
        if let raw = content?["builtin"]?.object {
            for key in Builtin.allCases {
                guard let entry = raw[key.rawValue]?.object else { continue }
                let name = cleanRoleName(entry["name"]?.string)
                let color = entry["color"]?.string.flatMap { isValidRoleColor($0) ? $0.lowercased() : nil }
                if !name.isEmpty || color != nil { builtin[key] = BuiltinLook(name: name.isEmpty ? nil : name, color: color) }
            }
        }
        var byUser: [String: [Role]] = [:]
        if !roles.isEmpty, trusted(powerLevels, MudrixTypes.spaceMemberRoles) {
            var order: [String: Int] = [:]
            for (index, role) in roles.enumerated() { order[role.id] = index }
            for (key, assigned) in state.all(MudrixTypes.spaceMemberRoles) {
                guard !key.isEmpty, let ids = assigned["roles"]?.array else { continue }
                let held = Set(ids.prefix(maxRolesPerMember).compactMap { $0.string.flatMap { order[$0] } }).sorted()
                if !held.isEmpty { byUser["@" + key] = held.map { roles[$0] } }
            }
        }
        return Roles(builtin: builtin, roles: roles, byUser: byUser)
    }

    /// The power level of a user in a room's `m.room.power_levels` content
    static func powerLevel(of userId: String, in powerLevels: [String: JSONValue]?) -> Double {
        powerLevels?["users"]?[userId]?.number ?? powerLevels?["users_default"]?.number ?? 0
    }

    /// Whether `userId` may send `type` state: room creators always, otherwise by power level
    static func canSendState(_ powerLevels: [String: JSONValue]?, creators: Set<String>, userId: String, type: String) -> Bool {
        creators.contains(userId) || powerLevel(of: userId, in: powerLevels) >= levelNeeded(powerLevels, type)
    }

    /// A person's assignment is stored under their user id without the leading `@`
    static func memberStateKey(_ userId: String) -> String {
        userId.hasPrefix("@") ? String(userId.dropFirst()) : userId
    }

    /// The spaces from `roomId` upward (itself when it is a space), nearest first; at most six deep
    static func rolesChain(of roomId: String?, in graph: [SpaceNode]) -> [String] {
        guard let roomId else { return [] }
        var chain: [String] = []
        var at: String? = graph.contains { $0.spaceId == roomId } ? roomId : parent(of: roomId, in: graph)
        while let current = at, chain.count < 6, !chain.contains(current) {
            chain.append(current)
            at = parent(of: current, in: graph)
        }
        return chain
    }

    /// Which built-in role someone is in a room, from their power level
    static func builtin(creators: Set<String>, userId: String, powerLevel: Double) -> Builtin {
        if creators.contains(userId) { return .founder }
        if powerLevel >= 100 { return .admin }
        if powerLevel >= 50 { return .moderator }
        return .member
    }

    /// The colour (hex with `#`) to show for someone: their Admin or Moderator look first, then their own roles from the
    /// top of the list, then the plain Member look. Founders fall back to the Admin look.
    static func roleColor(_ roles: Roles, userId: String, builtin: Builtin = .member) -> String? {
        let high: String?
        switch builtin {
        case .founder: high = roles.builtin[.founder]?.color ?? roles.builtin[.admin]?.color
        case .member: high = nil
        default: high = roles.builtin[builtin]?.color
        }
        return high ?? roles.byUser[userId]?.first(where: { $0.color != nil })?.color ?? roles.builtin[.member]?.color
    }
}
