import Foundation
import MudrixCore

/// Who may play in a room's call. The packs themselves live in the core (`moe.crafty.room_soundboard`);
/// only the Mudrix "who may play" setting stays a room setting: `...soundboard.settings` with
/// `{ enabled, minPowerLevel }`. A space above the room can switch the soundboard off or raise the level.
enum RoomSoundboards {
    static let settingsType = Namespace.mudrixKey("soundboard.settings")

    /// Kept for a while: custom state is not part of what sync delivers
    static let cacheSeconds: TimeInterval = 30

    struct Settings: Equatable {
        let enabled: Bool
        let minPowerLevel: Double
    }

    struct Snapshot {
        /// The room's own setting, or nil when it never set one
        let settings: Settings?
        let powerLevels: [String: JSONValue]?
        let creators: Set<String>
        let loadedAt: Date
    }

    /// A clip on a room's or space's pack, and the room whose pack holds it
    struct RoomClip: Identifiable, Equatable {
        let clip: SoundboardClip
        let originRoomId: String

        var id: String { originRoomId + "|" + clip.id }
    }

    enum Access: Equatable { case ok, roomDisabled, forbidden }

    private static let lock = NSLock()
    private static var cache: [String: Snapshot] = [:]

    private static func stored(_ roomId: String) -> Snapshot? {
        lock.lock()
        defer { lock.unlock() }
        return cache[roomId]
    }

    private static func store(_ data: Snapshot, for roomId: String) {
        lock.lock()
        cache[roomId] = data
        lock.unlock()
    }

    /// A board's settings: `enabled` and `minPowerLevel` as numbers or booleans only; nil when it has neither
    static func sanitizeSettings(_ raw: [String: JSONValue]?) -> Settings? {
        guard let raw else { return nil }
        var enabled: Bool?
        if case .bool(let value)? = raw["enabled"] { enabled = value }
        var level: Double?
        if case .number(let value)? = raw["minPowerLevel"], value.isFinite { level = value }
        if enabled == nil && level == nil { return nil }
        return Settings(enabled: enabled ?? true, minPowerLevel: level ?? 0)
    }

    /// The room's setting and power levels (kept for 30 seconds unless `force`)
    static func load(client: MudrixClient, roomId: String, force: Bool = false, now: Date = Date()) async -> Snapshot {
        if !force, let found = stored(roomId), now.timeIntervalSince(found.loadedAt) < cacheSeconds { return found }
        let types = MudrixTypes.typeAndLegacy(settingsType)
        let raw = (try? await client.stateEventsOfTypes(roomId: roomId, eventTypes: types)) ?? []
        let room = try? await client.localRoomSettings(roomId: roomId)
        let state = MudrixRoomState(raw: raw)
        let previous = stored(roomId)
        let data = Snapshot(
            settings: sanitizeSettings(state.get(settingsType)),
            powerLevels: room?.powerLevels.object ?? previous?.powerLevels,
            creators: room.map { Set($0.creators) } ?? previous?.creators ?? [],
            loadedAt: now)
        store(data, for: roomId)
        return data
    }

    /// The rooms whose settings apply in `roomId`: the spaces above it (outermost first), then the room itself
    static func boardRoomIds(graph: [SpaceNode], roomId: String) -> [String] {
        Array(SpaceModern.rolesChain(of: roomId, in: graph).filter { $0 != roomId }.reversed()) + [roomId]
    }

    /// Whether `userId` may play clips in a call in `roomId`: the room and the spaces above must have the
    /// soundboard on (a setting never made counts as on), and the person needs the highest "who can play" level
    /// among them, checked against their level in the room that set it (their level in the call room when unknown)
    static func access(client: MudrixClient, graph: [SpaceNode], roomId: String, userId: String) async -> Access {
        let ids = boardRoomIds(graph: graph, roomId: roomId)
        var all: [Snapshot] = []
        for id in ids { all.append(await load(client: client, roomId: id)) }
        return verdict(all.map { Rules(settings: $0.settings, level: level(of: userId, in: $0)) })
    }

    /// One room's setting and the person's level there (nil when its power levels are not known)
    struct Rules: Equatable {
        let settings: Settings?
        let level: Double?
    }

    static func level(of userId: String, in data: Snapshot) -> Double? {
        guard let levels = data.powerLevels else { return nil }
        if data.creators.contains(userId) { return Double.greatestFiniteMagnitude }
        return SpaceModern.powerLevel(of: userId, in: levels)
    }

    /// The outcome for a person over the rooms from the outermost space to the call room (the last)
    static func verdict(_ rules: [Rules]) -> Access {
        let roomLevel = rules.last?.level ?? 0
        var outcome = Access.ok
        for rule in rules {
            guard let settings = rule.settings else { continue }
            if outcome == .roomDisabled { break }
            if !settings.enabled {
                outcome = .roomDisabled
                continue
            }
            if (rule.level ?? roomLevel) < settings.minPowerLevel { outcome = .forbidden }
        }
        return outcome
    }

    /// Shows a change this device just wrote at once (the server's copy is read again after the cache runs out)
    static func remember(roomId: String, settings: Settings? = nil) {
        let current = stored(roomId)
        store(Snapshot(settings: settings ?? current?.settings, powerLevels: current?.powerLevels,
                       creators: current?.creators ?? [], loadedAt: Date()),
              for: roomId)
    }

    /// Forgets what was read (tests, and after the account changes)
    static func reset() {
        lock.lock()
        cache = [:]
        lock.unlock()
    }
}
