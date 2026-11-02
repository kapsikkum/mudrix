import Foundation
import WizardChatCore

enum NotifLevel: String, CaseIterable, Identifiable {
    case off, on, noisy
    var id: String { rawValue }

    var title: String {
        switch self {
        case .off: return String(localized: "settings.notifications.level.off")
        case .on: return String(localized: "settings.notifications.level.on")
        case .noisy: return String(localized: "settings.notifications.level.noisy")
        }
    }
}

struct ManagedRule {
    let ruleId: String
    let kind: String
}

enum PushRuleSets {
    static let dms = [
        ManagedRule(ruleId: ".m.rule.room_one_to_one", kind: "underride"),
        ManagedRule(ruleId: ".m.rule.encrypted_room_one_to_one", kind: "underride"),
    ]
    static let rooms = [
        ManagedRule(ruleId: ".m.rule.message", kind: "underride"),
        ManagedRule(ruleId: ".m.rule.encrypted", kind: "underride"),
    ]
    static let userMention = [
        ManagedRule(ruleId: ".m.rule.is_user_mention", kind: "override"),
        ManagedRule(ruleId: ".m.rule.contains_display_name", kind: "override"),
        ManagedRule(ruleId: ".m.rule.contains_user_name", kind: "content"),
    ]
    static let roomMention = [
        ManagedRule(ruleId: ".m.rule.is_room_mention", kind: "override"),
        ManagedRule(ruleId: ".m.rule.roomnotif", kind: "override"),
    ]
}

struct PushRules {
    private(set) var global: [String: [JSONValue]]

    init(json: JSONValue) {
        var global: [String: [JSONValue]] = [:]
        if case .object(let kinds) = json["global"] ?? json {
            for (kind, rules) in kinds {
                if case .array(let rules) = rules { global[kind] = rules }
            }
        }
        self.global = global
    }

    private func rule(_ managed: ManagedRule) -> JSONValue? {
        global[managed.kind]?.first { $0["rule_id"]?.string == managed.ruleId }
    }

    func present(_ rules: [ManagedRule]) -> [ManagedRule] {
        rules.filter { rule($0) != nil }
    }

    func level(of rules: [ManagedRule]) -> NotifLevel {
        let audible = rules.compactMap(rule).filter { rule in
            rule["enabled"] != .bool(false) && !Self.isMuted(rule["actions"])
        }
        if audible.isEmpty { return .off }
        return audible.contains { Self.hasTweak("sound", $0["actions"]) } ? .noisy : .on
    }

    var keywords: [String] {
        (global["content"] ?? []).compactMap { $0["rule_id"]?.string }.filter { !$0.hasPrefix(".") }
    }

    /// Mention rules keep their highlight; the rest only change sound
    func setLevel(_ level: NotifLevel, for rules: [ManagedRule], client: WizardClient) async throws {
        for managed in rules {
            guard let rule = rule(managed) else { continue }
            let highlight = Self.hasTweak("highlight", rule["actions"])
            let name: String
            switch level {
            case .off: name = "off"
            case .on: name = highlight ? "highlightSilent" : "silent"
            case .noisy: name = highlight ? "highlight" : "loud"
            }
            try await client.setPushRuleLevel(kind: managed.kind, ruleId: managed.ruleId, level: name)
        }
    }

    private static func actions(_ value: JSONValue?) -> [JSONValue] {
        if case .array(let actions) = value { return actions }
        return []
    }

    private static func isMuted(_ value: JSONValue?) -> Bool {
        let actions = actions(value)
        return actions.isEmpty || actions.contains(.string("dont_notify"))
    }

    private static func hasTweak(_ tweak: String, _ value: JSONValue?) -> Bool {
        actions(value).contains { $0["set_tweak"]?.string == tweak && $0["value"] != .bool(false) }
    }
}
