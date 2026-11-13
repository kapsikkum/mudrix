import Foundation
import WizardChatCore

/// Other people's cosmetics, asked once per person for a few minutes (one request each)
@MainActor
final class CosmeticCache {
    static let shared = CosmeticCache()
    private static let lifetime: TimeInterval = 5 * 60

    private struct Entry {
        let at: Date
        let profile: ExtendedProfile
    }

    private var entries: [String: Entry] = [:]
    private var pending: [String: Task<ExtendedProfile?, Never>] = [:]

    func cached(_ userId: String) -> ExtendedProfile? {
        guard let entry = entries[userId], Date().timeIntervalSince(entry.at) < Self.lifetime else { return nil }
        return entry.profile
    }

    func forget(_ userId: String) {
        entries[userId] = nil
    }

    func profile(_ userId: String, client: WizardClient) async -> ExtendedProfile? {
        if let profile = cached(userId) { return profile }
        if let task = pending[userId] { return await task.value }
        let task = Task<ExtendedProfile?, Never> {
            guard let fields = try? await client.profileFields(userId: userId) else { return nil }
            return ProfileFields.parse(fields)
        }
        pending[userId] = task
        let profile = await task.value
        pending[userId] = nil
        if let profile { entries[userId] = Entry(at: Date(), profile: profile) }
        return profile
    }
}

/// Reads cosmetic packs and their subscriptions from the session, and writes both subscription events
@MainActor
enum CosmeticPackLibrary {
    /// The cosmetic packs of a room, one per state key
    static func packs(in roomId: String, session: MatrixSession) async -> [CosmeticPack] {
        var byStateKey: [String: [JSONValue]] = [:]
        for type in CosmeticPacks.roomPackTypes {
            for event in await session.stateEvents(type, in: roomId) {
                byStateKey[event.key, default: []].append(JSONValue(any: event.content))
            }
        }
        return CosmeticPacks.parsePacks(roomId: roomId, byStateKey: byStateKey)
    }

    /// The account's own pack, if it has one
    static func personalPack(session: MatrixSession) async -> CosmeticPack? {
        guard let content = await session.accountDataJSON(CosmeticPacks.userPackType) else { return nil }
        return CosmeticPacks.parsePack(roomId: nil, stateKey: "personal", contents: [JSONValue(any: content)])
    }

    /// The packs the account is subscribed to, the personal one first
    static func subscribedPacks(session: MatrixSession) async -> [CosmeticPack] {
        var found: [CosmeticPack] = []
        if let personal = await personalPack(session: session) { found.append(personal) }
        let subscriptions = await subscriptions(session: session)
        for ref in CosmeticPacks.subscribedRefs(subscriptions) {
            let roomPacks = await packs(in: ref.roomId, session: session)
            for pack in roomPacks where pack.stateKey == ref.stateKey {
                found.append(pack)
            }
        }
        return found
    }

    private static var visible: [CosmeticPack] = []
    private static var visibleAt: Date?
    private static var visiblePending: Task<[CosmeticPack], Never>?

    /// The personal and subscribed packs, read at most once every few minutes
    static func visiblePacks(session: MatrixSession) async -> [CosmeticPack] {
        if let visibleAt, Date().timeIntervalSince(visibleAt) < 300 { return visible }
        if let pending = visiblePending { return await pending.value }
        let task = Task { await subscribedPacks(session: session) }
        visiblePending = task
        let packs = await task.value
        visiblePending = nil
        visible = packs
        visibleAt = Date()
        return packs
    }

    /// The palette a loaded pack gave a bare `mxc://` nameplate
    static func nameplatePalette(for url: String, session: MatrixSession) async -> String? {
        CosmeticPacks.nameplatePalette(for: url, in: await visiblePacks(session: session))
    }

    /// The intro a loaded pack gave a pack effect
    static func effectIntro(for url: String, session: MatrixSession) async -> String? {
        CosmeticPacks.effectIntro(for: url, in: await visiblePacks(session: session))
    }

    /// The subscriptions of both account data events, merged
    static func subscriptions(session: MatrixSession) async -> [String: [String: JSONValue]] {
        var contents: [JSONValue] = []
        for type in CosmeticPacks.subscriptionTypes {
            if let content = await session.accountDataJSON(type) {
                contents.append(JSONValue(any: content))
            } else {
                contents.append(.null)
            }
        }
        return CosmeticPacks.mergeSubscriptions(contents)
    }

    /// Subscribes or unsubscribes one pack in both account data events, keeping the rooms this client cannot read
    static func setSubscribed(_ subscribed: Bool, ref: CosmeticPackRef, session: MatrixSession) async throws {
        let rooms = CosmeticPacks.withSubscription(await subscriptions(session: session), roomId: ref.roomId,
                                                   stateKey: ref.stateKey, subscribed: subscribed)
        let content = CosmeticPacks.subscriptionValue(rooms)
        for type in CosmeticPacks.subscriptionTypes {
            try await session.setAccountDataJSON(type, content.any as? [String: Any] ?? [:])
        }
        visibleAt = nil
    }

    /// Every cosmetic pack in the rooms the account is in, for the subscription picker
    static func availablePacks(session: MatrixSession) async -> [CosmeticPack] {
        guard let rooms = session.roomList?.allJoinedRooms else { return [] }
        var found: [CosmeticPack] = []
        for room in rooms {
            found.append(contentsOf: await packs(in: room.id, session: session))
        }
        return found.sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }
}
