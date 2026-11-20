import AVFoundation
import MudrixCore

/// The call soundboard. A press is played here at once and sent in the standard MSC4577 form on the
/// LiveKit data topic `moe.crafty.soundboard`: `{ url, shortcode, org.wizardchat.emoji? }`, an `mxc://`
/// URI of at most 1024 bytes. Receivers fetch it with the core's `soundboardSound` and play it on their
/// own side, so each listener can silence it separately from voice. The old Mudrix topic
/// `io.github.kapsikkum.mudrix.soundboard.play` is still received from 26.12.4 clients and sent as a
/// silent fallback on the data channel (never as a room event). Packs live in core.
@MainActor
final class Soundboard: ObservableObject {
    /// The clips of your personal pack (the core's `moe.crafty.soundboard` account data)
    @Published private(set) var personal: [SoundboardClip] = []
    /// The same pack as stored, for the editor
    @Published private(set) var personalSounds: [SoundboardSound] = []
    /// The clips of this room's and its spaces' packs, shown under the personal ones
    @Published private(set) var roomClips: [RoomSoundboards.RoomClip] = []
    /// The standard sounds, from the core's built-in pack
    @Published private(set) var builtIn: [SoundboardClip] = []
    /// Whether this person may play here: the room and the spaces above it can switch the board off or raise the level
    @Published private(set) var access = RoomSoundboards.Access.ok

    private static let maxConcurrent = 4
    private static let maxPlayMs: Int64 = SoundboardFormat.maxDurationMs + 1000
    private static let tailMs: Int64 = 400
    /// A room event may be this much older than the moment you joined (clocks differ)
    private static let clockSkewMs: Int64 = 5000
    /// The same press arrives twice, on the data channel and as a room event
    private static let duplicateWindowMs: Int64 = 1500
    private static let roomAfterCallWindowMs: Int64 = 10_000

    private var client: MudrixClient?
    private var roomId = ""
    private var ownUserId = ""
    private var startedAt: Int64 = 0
    private var active = false
    private var isDeafened: () -> Bool = { false }
    private var userIdOfIdentity: (String) -> String? = { _ in nil }
    private var graph: () -> [SpaceNode] = { [] }
    /// Who may play here, per person; asked when a press from them arrives
    private var senderAccess: [String: RoomSoundboards.Access] = [:]
    private var sendData: (JSONValue, String) -> Void = { _, _ in }

    private var roomWatch: Subscription?
    private let sendLimiter = SoundboardLimiter.forSending()
    private let receiveLimiter = SoundboardLimiter.forReceiving()
    private var recentCall: [String: Int64] = [:]
    private var recentRoom: [String: Int64] = [:]
    private var players: [String: AVAudioPlayer] = [:]
    private var sounds: [String: Task<Data, Error>] = [:]

    private var prefs: AppPreferences? { Sounds.prefs }
    private var enabled: Bool { prefs?.soundboardEnabled ?? true }

    /// Starts listening once you are in the call
    func start(client: MudrixClient, roomId: String, ownUserId: String, isDeafened: @escaping () -> Bool,
               graph: @escaping () -> [SpaceNode] = { [] },
               userId: @escaping (String) -> String?,
               send: @escaping (JSONValue, String) -> Void) {
        stop()
        self.client = client
        self.roomId = roomId
        self.ownUserId = ownUserId
        self.isDeafened = isDeafened
        self.userIdOfIdentity = userId
        self.graph = graph
        self.sendData = send
        startedAt = SavedMessages.nowMs
        active = true
        Task { await refreshRoomBoards() }
        roomWatch = client.watchRoomEvents(types: SoundboardFormat.playTypes) { [weak self] event in
            MainActor.assumeIsolated { self?.receive(event) }
        }
    }

    func stop() {
        active = false
        roomClips = []
        builtIn = []
        access = .ok
        senderAccess = [:]
        roomWatch?.cancel()
        roomWatch = nil
        personal = []
        personalSounds = []
        stopAll()
        sounds.values.forEach { $0.cancel() }
        sounds = [:]
        sendLimiter.reset()
        receiveLimiter.reset()
        recentCall = [:]
        recentRoom = [:]
        client = nil
        sendData = { _, _ in }
    }

    /// Silences every clip now playing (leaving the call, deafening)
    func stopAll() {
        players.values.forEach { $0.stop() }
        players = [:]
    }

    var isEnabled: Bool { enabled }

    // MARK: Packs

    /// Reads the personal, built-in, room and space packs and whether this person may play
    func refreshRoomBoards(force: Bool = false) async {
        guard let client else { return }
        let graph = graph()
        let room = roomId
        let own = ownUserId
        if force { RoomSoundboards.reset() }
        let packs = (try? await client.soundboardPacks(roomId: room)) ?? []
        let verdict = await RoomSoundboards.access(client: client, graph: graph, roomId: room, userId: own)
        guard active, room == roomId else { return }
        if let mine = packs.first(where: { $0.source == .mine }) {
            personalSounds = mine.sounds.map(SoundboardFormat.sound)
            personal = SoundboardFormat.clips(mine)
        } else {
            personalSounds = []
            personal = []
        }
        if let standard = packs.first(where: { $0.source == .builtIn }) {
            builtIn = SoundboardFormat.clips(standard)
        } else {
            builtIn = []
        }
        var merged: [RoomSoundboards.RoomClip] = []
        func add(_ pack: MudrixCore.SoundPack) {
            guard let origin = pack.roomId else { return }
            for sound in pack.sounds {
                merged.removeAll { $0.clip.id == sound.shortcode }
                merged.append(RoomSoundboards.RoomClip(clip: SoundboardFormat.clip(sound, pack: pack), originRoomId: origin))
            }
        }
        // Spaces first, then the room, so the room's clip wins over a space's with the same shortcode
        for pack in packs where pack.source == .space { add(pack) }
        for pack in packs where pack.source == .room { add(pack) }
        roomClips = merged
        access = verdict
        senderAccess = [:]
    }

    // MARK: Sending

    /// Plays a clip for everyone in the call, and for you
    func press(_ clip: SoundboardClip) async -> PlayResult {
        guard enabled else { return .disabled }
        guard active, let client else { return .notInCall }
        switch access {
        case .roomDisabled: return .roomDisabled
        case .forbidden: return .forbidden
        case .ok: break
        }
        guard !clip.url.isEmpty else { return .error }
        let limit = sendLimiter.check(ownUserId, clip.id)
        guard limit == .ok else { return limit }
        if !isDeafened() {
            Task { _ = await play(url: clip.url, sender: ownUserId, volume: clip.volume, durationMs: clip.durationMs) }
        }
        sendData(.object(SoundboardFormat.message(clip)), SoundboardFormat.topic)
        // Silent fallback for 26.12.4 clients, on the data channel only (no room event)
        sendData(SoundboardFormat.legacyMessage(clip), SoundboardFormat.playType)
        Task { try? await client.recordSoundPlayed(url: clip.url) }
        return .ok
    }

    // MARK: Receiving

    /// A press on the call's data channel: the standard topic, or the old one from 26.12.4
    func receive(data: Data, topic: String, identity: String) {
        guard let userId = userIdOfIdentity(identity) else { return }
        if topic == SoundboardFormat.topic {
            guard let press = SoundboardFormat.parsePlay(data) else { return }
            receive(press, from: userId)
        } else if SoundboardFormat.playTypes.contains(topic) {
            guard let object = try? JSONSerialization.jsonObject(with: data),
                  let press = SoundboardFormat.parsePress(JSONValue(any: object)) else { return }
            receive(press, from: userId, fromRoom: false)
        }
    }

    private func receive(_ event: RoomEvent) {
        guard event.roomId == roomId else { return }
        receive(event.content, from: event.sender, timestamp: Int64(event.originServerTs), fromRoom: true)
    }

    private func receive(_ press: SoundboardFormat.Play, from userId: String) {
        guard mayListen(userId) else { return }
        let key = press.shortcode ?? press.url
        guard notDuplicate(userId, key, fromRoom: false),
              receiveLimiter.check(userId, key) == .ok else { return }
        Task {
            guard await mayPlay(userId) else { return }
            _ = await play(url: press.url, sender: userId, volume: 1, durationMs: nil)
        }
    }

    private func receive(_ content: JSONValue, from userId: String, timestamp: Int64?, fromRoom: Bool) {
        guard mayListen(userId), let press = SoundboardFormat.parsePress(content) else { return }
        if let timestamp, timestamp > 0, timestamp < startedAt - Self.clockSkewMs { return }
        receive(press, from: userId, fromRoom: fromRoom)
    }

    /// A press decoded from the old payload, on the data channel or as an old room event
    private func receive(_ press: SoundboardPress, from userId: String, fromRoom: Bool) {
        guard mayListen(userId) else { return }
        guard notDuplicate(userId, press.id, fromRoom: fromRoom),
              receiveLimiter.check(userId, press.id) == .ok else { return }
        Task {
            guard await mayPlay(userId) else { return }
            if press.builtIn {
                guard let clip = SoundboardFormat.builtInClip(press.id),
                      let resource = clip.resource,
                      let url = SoundPacks.url(for: resource) else { return }
                _ = await playFile(url, sender: userId, volume: press.volume, durationMs: press.durationMs)
            } else if let url = press.url {
                _ = await play(url: url, sender: userId, volume: press.volume, durationMs: press.durationMs)
            }
        }
    }

    private func mayListen(_ userId: String) -> Bool {
        guard active, userId != ownUserId, enabled, !isDeafened(),
              !(prefs?.soundboardMutedUsers.contains(userId) ?? false) else { return false }
        return true
    }

    private func notDuplicate(_ sender: String, _ key: String, fromRoom: Bool) -> Bool {
        let now = SavedMessages.nowMs
        let own = fromRoom ? recentRoom : recentCall
        if let seen = own[sender + "|" + key], now - seen < Self.duplicateWindowMs { return true }
        if fromRoom, let seen = recentCall[sender + "|" + key], now - seen < Self.roomAfterCallWindowMs {
            return true
        }
        if fromRoom { recentRoom[sender + "|" + key] = now } else { recentCall[sender + "|" + key] = now }
        return false
    }

    private func mayPlay(_ userId: String) async -> Bool {
        guard let client else { return false }
        if let known = senderAccess[userId] { return known == .ok }
        let verdict = await RoomSoundboards.access(client: client, graph: graph(), roomId: roomId, userId: userId)
        guard active else { return false }
        senderAccess[userId] = verdict
        return verdict == .ok
    }

    /// Plays a clip here only (the editor's preview); nothing is sent
    func preview(_ clip: SoundboardClip) async {
        if clip.url.isEmpty {
            if clip.builtIn, let resource = clip.resource, let url = SoundPacks.url(for: resource) {
                _ = await playFile(url, sender: "preview", volume: clip.volume, durationMs: clip.durationMs)
            }
        } else {
            _ = await play(url: clip.url, sender: "preview", volume: clip.volume, durationMs: clip.durationMs)
        }
    }

    // MARK: Playing

    /// The bytes of a clip: the core fetches and decrypts it, and knows the built-ins
    private func data(_ url: String) -> Task<Data, Error> {
        if let task = sounds[url] { return task }
        guard let client else { return Task { throw CancellationError() } }
        let task = Task { try await client.soundboardSound(url: url) }
        sounds[url] = task
        return task
    }

    /// Starts the clip; false when it could not be loaded or played
    private func play(url: String, sender: String, volume: Float, durationMs: Int64?) async -> Bool {
        let task = data(url)
        guard active, let bytes = try? await task.value else {
            sounds[url] = nil
            return false
        }
        guard active, !isDeafened(), Int64(bytes.count) <= SoundboardFormat.maxSizeBytes * 3 / 2,
              let player = try? AVAudioPlayer(data: bytes) else { return false }
        return start(player, sender: sender, volume: volume, durationMs: durationMs)
    }

    private func playFile(_ url: URL, sender: String, volume: Float, durationMs: Int64?) async -> Bool {
        guard active, let player = try? AVAudioPlayer(contentsOf: url) else { return false }
        return start(player, sender: sender, volume: volume, durationMs: durationMs)
    }

    private func start(_ player: AVAudioPlayer, sender: String, volume: Float, durationMs: Int64?) -> Bool {
        guard active, !isDeafened() else { return false }
        guard Int64(player.duration * 1000) <= SoundboardFormat.maxDurationMs + 1000 else { return false }
        players = players.filter { $0.value.isPlaying }
        // One clip per person at a time, and never a wall of sound
        players[sender]?.stop()
        players[sender] = nil
        guard players.count < Self.maxConcurrent else { return false }
        let slider = Float(min(max(prefs?.soundboardVolume ?? 70, 0), 100)) / 100
        player.volume = min(max(volume * slider, 0), 1)
        guard player.play() else { return false }
        players[sender] = player
        let limitMs = min(durationMs ?? Self.maxPlayMs, Self.maxPlayMs) + Self.tailMs
        Task {
            try? await Task.sleep(for: .milliseconds(limitMs))
            if players[sender] === player {
                player.stop()
                players[sender] = nil
            }
        }
        return true
    }
}
