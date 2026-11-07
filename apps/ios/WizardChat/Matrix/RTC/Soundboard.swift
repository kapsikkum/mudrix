import AVFoundation
import CryptoKit
import WizardChatCore

/// The call soundboard: sends the clips you press on the call's data channel and as a room event (so an
/// app that is not connected to the same SFU still hears it), and plays the ones other people press.
/// The formats and limits are the web's, so every client hears every other one.
@MainActor
final class Soundboard: ObservableObject {
    /// The clips of your personal board, from the `io.github.kapsikkum.mudrix.soundboard` account data
    @Published private(set) var personal: [SoundboardClip] = []

    private static let maxConcurrent = 4
    private static let maxPlayMs: Int64 = 6000
    private static let tailMs: Int64 = 400
    /// A room event may be this much older than the moment you joined (clocks differ)
    private static let clockSkewMs: Int64 = 5000
    /// The same press arrives twice, on the data channel and as a room event
    private static let duplicateWindowMs: Int64 = 1500
    private static let maxFetchBytes = Int(SoundboardFormat.maxSizeBytes) * 3 / 2

    private var client: WizardClient?
    private var roomId = ""
    private var ownUserId = ""
    private var startedAt: Int64 = 0
    private var active = false
    private var isDeafened: () -> Bool = { false }
    private var userIdOfIdentity: (String) -> String? = { _ in nil }
    private var sendData: (JSONValue) -> Void = { _ in }

    private var roomWatch: Subscription?
    private var boardWatches: [Subscription] = []
    private var boardContents: [String: JSONValue] = [:]
    private let sendLimiter = SoundboardLimiter.forSending()
    private let receiveLimiter = SoundboardLimiter.forReceiving()
    private var recent: [String: Int64] = [:]
    private var players: [String: AVAudioPlayer] = [:]

    private var prefs: AppPreferences? { Sounds.prefs }
    private var enabled: Bool { prefs?.soundboardEnabled ?? true }

    /// Starts listening once you are in the call
    func start(client: WizardClient, roomId: String, ownUserId: String, isDeafened: @escaping () -> Bool,
               userId: @escaping (String) -> String?, send: @escaping (JSONValue) -> Void) {
        stop()
        self.client = client
        self.roomId = roomId
        self.ownUserId = ownUserId
        self.isDeafened = isDeafened
        self.userIdOfIdentity = userId
        self.sendData = send
        startedAt = SavedMessages.nowMs
        active = true
        roomWatch = client.watchRoomEvents(types: SoundboardFormat.playTypes) { [weak self] event in
            MainActor.assumeIsolated { self?.receive(event) }
        }
        for type in [SoundboardFormat.boardType, SoundboardFormat.legacyBoardType] {
            boardWatches.append(client.watchAccountData(eventType: type) { [weak self] content in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if let content { self.boardContents[type] = content } else { self.boardContents.removeValue(forKey: type) }
                    self.showBoard()
                }
            })
        }
        Task {
            let stored = await client.firstAccountData([SoundboardFormat.boardType, SoundboardFormat.legacyBoardType])
            if active, boardContents.isEmpty, let stored { boardContents[SoundboardFormat.boardType] = stored; showBoard() }
        }
    }

    func stop() {
        active = false
        roomWatch?.cancel()
        roomWatch = nil
        boardWatches.forEach { $0.cancel() }
        boardWatches = []
        boardContents = [:]
        personal = []
        stopAll()
        sendLimiter.reset()
        receiveLimiter.reset()
        recent = [:]
        client = nil
        sendData = { _ in }
    }

    /// Silences every clip now playing (leaving the call, deafening)
    func stopAll() {
        players.values.forEach { $0.stop() }
        players = [:]
    }

    var isEnabled: Bool { enabled }

    private func showBoard() {
        let content = boardContents[SoundboardFormat.boardType] ?? boardContents[SoundboardFormat.legacyBoardType]
        personal = SoundboardFormat.parseBoard(content).map(SoundboardFormat.clip)
    }

    // MARK: Sending

    /// Plays a clip for everyone in the call, and for you
    func press(_ clip: SoundboardClip) async -> PlayResult {
        guard enabled else { return .disabled }
        guard active, let client else { return .notInCall }
        let limit = sendLimiter.check(ownUserId, clip.id)
        guard limit == .ok else { return limit }
        let content = SoundboardFormat.playContent(clip)
        sendData(content)
        let roomId = roomId
        Task {
            do { _ = try await client.sendEvent(roomId: roomId, eventType: SoundboardFormat.playType, content: content) }
            catch { NSLog("WZCALL soundboard event: %@", String(describing: error)) }
        }
        if !isDeafened() {
            let press = SoundboardFormat.parsePress(content)
            if let press, !(await playPress(press, sender: ownUserId)) { return .error }
        }
        return .ok
    }

    // MARK: Receiving

    /// A press on the call's data channel
    func receive(data: Data, identity: String) {
        guard let userId = userIdOfIdentity(identity),
              let object = try? JSONSerialization.jsonObject(with: data) else { return }
        receive(content: JSONValue(any: object), from: userId, timestamp: nil)
    }

    private func receive(_ event: RoomEvent) {
        guard event.roomId == roomId else { return }
        receive(content: event.content, from: event.sender, timestamp: Int64(event.originServerTs))
    }

    private func receive(content: JSONValue, from userId: String, timestamp: Int64?) {
        guard active, userId != ownUserId, enabled, !isDeafened(),
              !(prefs?.soundboardMutedUsers.contains(userId) ?? false),
              let press = SoundboardFormat.parsePress(content) else { return }
        if let timestamp, timestamp > 0, timestamp < startedAt - Self.clockSkewMs { return }
        let now = SavedMessages.nowMs
        recent = recent.filter { now - $0.value < Self.duplicateWindowMs }
        let key = userId + "|" + press.id
        if recent[key] != nil { return }
        recent[key] = now
        guard receiveLimiter.check(userId, press.id, now: now) == .ok else { return }
        Task { _ = await playPress(press, sender: userId) }
    }

    // MARK: Playing

    /// Starts the clip; false when it could not be loaded or played
    private func playPress(_ press: SoundboardPress, sender: String) async -> Bool {
        guard let url = await file(for: press), active else { return false }
        players = players.filter { $0.value.isPlaying }
        // One clip per person at a time, and never a wall of sound
        players[sender]?.stop()
        players[sender] = nil
        guard players.count < Self.maxConcurrent, let player = try? AVAudioPlayer(contentsOf: url) else { return false }
        let slider = Float(min(max(prefs?.soundboardVolume ?? 70, 0), 100)) / 100
        player.volume = min(max(press.volume * slider, 0), 1)
        guard player.play() else { return false }
        players[sender] = player
        let limitMs = min(press.durationMs ?? Self.maxPlayMs, Self.maxPlayMs) + Self.tailMs
        Task {
            try? await Task.sleep(for: .milliseconds(limitMs))
            player.stop()
        }
        return true
    }

    /// The file of a clip: bundled, or downloaded once and kept in the caches folder
    private func file(for press: SoundboardPress) async -> URL? {
        if press.builtIn {
            guard let clip = SoundboardFormat.builtIn.first(where: { $0.id == press.id }) else { return nil }
            return SoundPacks.url(for: clip.resource)
        }
        guard let mxc = press.url, let client else { return nil }
        return await cached(mxc: mxc, mimetype: press.mimetype ?? "audio/mpeg", client: client)
    }

    private func cached(mxc: String, mimetype: String, client: WizardClient) async -> URL? {
        let ext: String
        switch mimetype {
        case "audio/wav": ext = "wav"
        case "audio/ogg": ext = "ogg"
        default: ext = "mp3"
        }
        let digest = SHA256.hash(data: Data(mxc.utf8)).map { String(format: "%02x", $0) }.joined()
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("soundboard", isDirectory: true)
        let file = folder.appendingPathComponent("\(digest).\(ext)")
        if FileManager.default.fileExists(atPath: file.path) { return file }
        guard let data = try? await client.media(source: .object(["url": .string(mxc)])),
              data.count <= Self.maxFetchBytes else { return nil }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        do { try data.write(to: file, options: .atomic) } catch { return nil }
        return file
    }
}
