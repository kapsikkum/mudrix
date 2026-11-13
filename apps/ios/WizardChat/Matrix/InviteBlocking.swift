/// "Block all invites" (MSC4380): the account data event a homeserver reads to reject invites
enum InviteBlocking {
    static let stableType = "m.invite_permission_config"
    static let unstableType = "org.matrix.msc4380.invite_permission_config"

    /// The event type the homeserver understands, or nil when it has no invite blocking
    static func eventType(unstableFeatures: [String]) -> String? {
        if unstableFeatures.contains("org.matrix.msc4380.stable") { return stableType }
        if unstableFeatures.contains("org.matrix.msc4380") { return unstableType }
        return nil
    }

    /// Whether a stored event asks the homeserver to block every invite
    static func isBlocked(_ content: JSONValue?) -> Bool {
        guard case .object(let fields)? = content, case .string(let action)? = fields["default_action"] else { return false }
        return action == "block"
    }

    /// The account data content for the chosen state
    static func content(blocked: Bool) -> JSONValue {
        blocked ? .object(["default_action": .string("block")]) : .object([:])
    }
}
