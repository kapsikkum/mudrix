import Foundation
import MudrixCore

/// The dot colour a custom status can ask for (`profileCosmetics.ts`'s `StatusMode`): busy (`dnd`) or idle.
/// Android calls the same values `ProfileFields.STATUS_IDLE` and `ProfileFields.STATUS_DND`.
enum StatusMode: String, CaseIterable {
    case idle
    case dnd
}

/// The `mode` of the `mudrix.status` profile field. The field holds a custom status (`text`, `emoji`,
/// `expires`) that other clients write, so the mode is read and written around whatever is there.
enum StatusFields {
    /// The current name, then the one earlier Mudrix versions used (Android's `ProfileFields.STATUS_KEYS`)
    static let keys = [Namespace.mudrixKey("status"), Namespace.legacyMudrixKey("status")]

    /// The mode a stored status field carries, if any
    static func mode(of value: JSONValue?) -> StatusMode? {
        guard let fields = value?.object else { return nil }
        return fields["mode"]?.string.flatMap(StatusMode.init(rawValue:))
    }

    /// The field with `mode` replaced and every other key left as it was; nil when nothing would be left
    /// to store, which clears the field
    static func value(mode: StatusMode?, in current: JSONValue?) -> JSONValue? {
        var fields = current?.object ?? [:]
        if let mode {
            fields["mode"] = .string(mode.rawValue)
        } else {
            fields.removeValue(forKey: "mode")
        }
        let hasText = fields["text"]?.string?.isEmpty == false
        let hasEmoji = fields["emoji"]?.string?.isEmpty == false
        return hasText || hasEmoji || fields["mode"] != nil ? .object(fields) : nil
    }

    /// The mode the account's own status field has; nil when it has none or cannot be read
    static func read(client: WizardClient) async -> StatusMode? {
        guard let userId = client.userId else { return nil }
        for key in keys {
            let stored = (try? await client.profileField(userId: userId, field: key)) ?? nil
            if let stored { return mode(of: stored) }
        }
        return nil
    }

    /// Writes the mode under both names so a client that knows only one of them sees it. Succeeds when at
    /// least one write lands, like Android's `writeProfileField`; throws when none does.
    static func write(client: WizardClient, mode: StatusMode?) async throws {
        guard let userId = client.userId else { return }
        var current: JSONValue?
        for key in keys {
            let stored = (try? await client.profileField(userId: userId, field: key)) ?? nil
            if let stored {
                current = stored
                break
            }
        }
        guard let next = value(mode: mode, in: current) else {
            // Nothing but the mode was there, so the whole status goes
            for key in keys { try? await client.deleteProfileField(field: key) }
            return
        }
        var landed = 0
        var failure: Error?
        for key in keys {
            do {
                try await client.setProfileField(field: key, value: next)
                landed += 1
            } catch {
                failure = error
            }
        }
        if landed == 0, let failure { throw failure }
    }

    /// The colour a presence dot takes once the status mode is applied, like the web's
    /// `dotPresenceFor` and Android's `DotPresence`: being offline wins, then busy, then idle
    static func dot(_ presence: Presence?, mode: StatusMode?) -> DotPresence? {
        if presence == .offline { return .offline }
        switch mode {
        case .dnd: return .dnd
        case .idle: return .unavailable
        case nil: return presence.map { DotPresence($0) }
        }
    }
}

/// A presence dot with the custom-status mode applied; Android's `DotPresence`. `Presence` in the core
/// has no busy state, so the busy dot is this app's own.
enum DotPresence: String, CaseIterable {
    case online
    case unavailable
    case offline
    case dnd

    init(_ presence: Presence) {
        switch presence {
        case .online: self = .online
        case .unavailable: self = .unavailable
        case .offline: self = .offline
        }
    }
}
