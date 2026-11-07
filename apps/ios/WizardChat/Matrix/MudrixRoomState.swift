import Foundation
import WizardChatCore

/// The Mudrix state types kept on a space or room (`io.github.kapsikkum.mudrix.*`, read under `chat.mudrix.*` too)
enum MudrixTypes {
    static let spaceListStyle = Namespace.mudrixKey("space_list_style")
    static let spaceBanner = Namespace.mudrixKey("space_banner")
    static let spaceAutoJoin = Namespace.mudrixKey("space_auto_join")
    static let spaceRoles = Namespace.mudrixKey("space_roles")
    static let spaceMemberRoles = Namespace.mudrixKey("space_member_roles")
    static let voiceChannel = Namespace.mudrixKey("voice_channel")
    static let voiceMove = Namespace.mudrixKey("voice_move")

    static let roomState = [spaceListStyle, spaceBanner, spaceAutoJoin, spaceRoles, spaceMemberRoles, voiceChannel]

    /// The current name first, then the one earlier Mudrix versions used
    static func typeAndLegacy(_ type: String) -> [String] {
        let prefix = Namespace.mudrix + "."
        guard type.hasPrefix(prefix) else { return [type] }
        return [type, Namespace.legacyMudrixKey(String(type.dropFirst(prefix.count)))]
    }
}

/// What one room holds of the Mudrix state types
struct MudrixRoomState {
    struct Entry {
        let type: String
        let stateKey: String
        let content: JSONValue
    }

    let entries: [Entry]

    static let empty = MudrixRoomState(entries: [])

    /// From the core's `stateEventsOfTypes`: lists of `[type, stateKey, content]`
    init(raw: [[JSONValue]]) {
        entries = raw.compactMap { row in
            guard row.count >= 3, let type = row[0].string else { return nil }
            return Entry(type: type, stateKey: row[1].string ?? "", content: row[2])
        }
    }

    init(entries: [Entry]) {
        self.entries = entries
    }

    /// The content under `type` (or its legacy name) and `stateKey`
    func get(_ type: String, stateKey: String = "") -> [String: JSONValue]? {
        for name in MudrixTypes.typeAndLegacy(type) {
            if let found = entries.first(where: { $0.type == name && $0.stateKey == stateKey })?.content.object {
                return found
            }
        }
        return nil
    }

    /// Every state key's content under `type`; a key set under both names counts once, the current name first
    func all(_ type: String) -> [(key: String, content: [String: JSONValue])] {
        var seen = Set<String>()
        var out: [(key: String, content: [String: JSONValue])] = []
        for name in MudrixTypes.typeAndLegacy(type) {
            for entry in entries where entry.type == name && !seen.contains(entry.stateKey) {
                guard let object = entry.content.object else { continue }
                seen.insert(entry.stateKey)
                out.append((entry.stateKey, object))
            }
        }
        return out
    }
}

/// Sliding sync never delivers custom state, so a room's Mudrix state is asked from the server once
/// (`stateEventsOfTypes`, one request for all the types), kept for a minute, asked again when the room's state changes,
/// and updated at once after this device writes. At most four rooms are asked at a time.
@MainActor
final class MudrixRoomStates: ObservableObject {
    static let shared = MudrixRoomStates()
    static let freshSeconds: TimeInterval = 60
    static let maxParallel = 4

    /// Room id to what it holds; replaced as a whole so readers refresh
    @Published private(set) var states: [String: MudrixRoomState] = [:] { didSet { revision &+= 1 } }
    /// Counts every change of `states`, for `onChange`
    @Published private(set) var revision = 0

    private struct Slot {
        var at = Date.distantPast
        var loading = false
    }

    private var slots: [String: Slot] = [:]
    private var queue: [String] = []
    private var running = 0
    private var client: WizardClient?
    private var subscription: Subscription?
    private let fetched = MudrixTypes.roomState.flatMap { MudrixTypes.typeAndLegacy($0) }
    private let relevant: Set<String>

    private init() {
        relevant = Set(MudrixTypes.roomState.flatMap { MudrixTypes.typeAndLegacy($0) } + ["m.room.power_levels"])
    }

    func start(client: WizardClient) {
        stop()
        self.client = client
        subscription = client.watchStateChanges { [weak self] change in
            MainActor.assumeIsolated { self?.onStateChange(change) }
        }
    }

    func stop() {
        subscription?.cancel()
        subscription = nil
        client = nil
        slots = [:]
        queue = []
        running = 0
        states = [:]
    }

    private func onStateChange(_ change: StateChange) {
        if relevant.contains(change.eventType), slots[change.roomId] != nil { ensure(change.roomId, force: true) }
    }

    func state(_ roomId: String?) -> MudrixRoomState? {
        roomId.flatMap { states[$0] }
    }

    /// Asks for a room's state unless it is fresh or already on its way
    func ensure(_ roomId: String, force: Bool = false) {
        guard client != nil else { return }
        var slot = slots[roomId] ?? Slot()
        let fresh = !force && states[roomId] != nil && Date().timeIntervalSince(slot.at) < Self.freshSeconds
        if slot.loading || fresh { return }
        slot.loading = true
        slots[roomId] = slot
        queue.append(roomId)
        pump()
    }

    func ensureAll(_ roomIds: some Collection<String>) {
        roomIds.forEach { ensure($0) }
    }

    private func pump() {
        guard let client else { return }
        while running < Self.maxParallel, !queue.isEmpty {
            let roomId = queue.removeFirst()
            running += 1
            let types = fetched
            Task { [weak self] in
                let loaded = try? await client.stateEventsOfTypes(roomId: roomId, eventTypes: types)
                guard let self else { return }
                // A room that cannot be read (left, or the server said no) simply has none of it
                self.states[roomId] = loaded.map { MudrixRoomState(raw: $0) } ?? self.states[roomId] ?? .empty
                var slot = self.slots[roomId] ?? Slot()
                slot.at = Date()
                slot.loading = false
                self.slots[roomId] = slot
                self.running -= 1
                self.pump()
            }
        }
    }

    /// Sets a Mudrix state event under its current name and shows the change at once
    func set(client: WizardClient, roomId: String, type: String, content: JSONValue, stateKey: String = "") async throws {
        try await client.setStateEvent(roomId: roomId, eventType: type, stateKey: stateKey, content: content)
        let current = states[roomId]
        var kept: [MudrixRoomState.Entry] = []
        for other in MudrixTypes.roomState {
            for (key, value) in current?.all(other) ?? [] where !(other == type && key == stateKey) {
                kept.append(.init(type: other, stateKey: key, content: .object(value)))
            }
        }
        kept.append(.init(type: type, stateKey: stateKey, content: content))
        states[roomId] = MudrixRoomState(entries: kept)
        var slot = slots[roomId] ?? Slot()
        slot.at = Date()
        slots[roomId] = slot
    }
}
