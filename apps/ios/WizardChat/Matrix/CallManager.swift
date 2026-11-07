import AVFoundation
import LiveKit
import WizardChatCore

struct CallParticipantInfo: Identifiable, Equatable {
    var id: String { identity }
    let identity: String
    let userId: String
    let deviceId: String
    let isLocal: Bool
    var connected = false
    var speaking = false
    var micMuted = true
    var cameraTrack: VideoTrack?
    var screenTrack: VideoTrack?
    var handRaised = false
    var reaction: String?
    var volume: Double = 1
    var locallyMuted = false

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.identity == rhs.identity && lhs.connected == rhs.connected && lhs.speaking == rhs.speaking
            && lhs.micMuted == rhs.micMuted && lhs.cameraTrack === rhs.cameraTrack
            && lhs.screenTrack === rhs.screenTrack && lhs.handRaised == rhs.handRaised
            && lhs.reaction == rhs.reaction && lhs.volume == rhs.volume && lhs.locallyMuted == rhs.locallyMuted
    }
}

@MainActor
final class CallManager: NSObject, ObservableObject {
    enum State: Equatable { case idle, joining, joined, failed(String) }

    private static let reactionVisibleSeconds = 3.0

    @Published private(set) var state = State.idle
    @Published private(set) var room: RoomSummary?
    @Published private(set) var participants: [CallParticipantInfo] = []
    @Published private(set) var cameraOn = false
    @Published private(set) var screenSharing = false
    @Published private(set) var handRaised = false
    @Published private(set) var reconnecting = false
    @Published private(set) var watch: WatchTogether?

    enum RingState: Equatable { case ringing, declined, unanswered }
    @Published private(set) var ring: RingState?
    @Published private(set) var incoming: RingingCall?
    @Published var showCallScreen = false
    private var ringback: CallSounds.Loop?
    private var ringtone: CallSounds.Loop?
    private var incomingTimer: Task<Void, Never>?
    private var knownOthers: Set<String> = []
    private let liveActivity = CallLiveActivityController()
    private var displayNames: [String: String] = [:]
    @Published var micMuted: Bool { didSet { UserDefaults.standard.set(micMuted, forKey: "voice.micMuted") } }
    @Published var deafened: Bool { didSet { UserDefaults.standard.set(deafened, forKey: "voice.deafened") } }

    private var session: CallSession?
    private var run: Subscription?
    private var incomingWatch: Subscription?
    private var handledElsewhereWatch: Subscription?
    private var members: [CallMember] = []
    private var mutedBeforeDeafen = false
    private var client: WizardClient?
    private var keyProvider: BaseKeyProvider?
    private var connections: [String: LiveKit.Room] = [:]
    private var pendingServices: Set<String> = []
    private var refreshTimer: Timer?
    private var userVolumes: [String: Double] = [:]
    private var mutedUsers: Set<String> = []
    private var appliedVolumes: [String: Double] = [:]
    private var reactions: [String: String] = [:]
    private var raisedHands: Set<String> = []

    override init() {
        micMuted = UserDefaults.standard.bool(forKey: "voice.micMuted")
        deafened = UserDefaults.standard.bool(forKey: "voice.deafened")
        super.init()
        CallActivityActions.toggleMic = { [weak self] in self?.toggleMic() }
        CallActivityActions.toggleDeafen = { [weak self] in self?.toggleDeafen() }
        CallActivityActions.leave = { [weak self] in self?.leave() }
        liveActivity.end()
    }

    var isInCall: Bool { state == .joining || state == .joined }
    func isInCall(roomId: String) -> Bool { isInCall && room?.id == roomId }

    func join(_ room: RoomSummary, session app: MatrixSession, intent: String? = nil, ring: Bool = false) async {
        if isInCall(roomId: room.id) { return }
        if incoming?.roomId == room.id { dismissIncoming() }
        if isInCall { await leaveAndWait() }
        guard await AVAudioApplication.requestRecordPermission() else {
            state = .failed(String(localized: "call.micPermission"))
            return
        }
        guard let client = app.client else { return }
        self.room = room
        self.client = client
        state = .joining
        do {
            let session = try await client.joinCall(roomId: room.id, video: intent == "video", ring: ring)
            self.session = session
            if try await session.encrypted() {
                keyProvider = BaseKeyProvider(options: KeyProviderOptions(
                    sharedKey: false, ratchetWindowSize: 10, keyRingSize: 256, keyDerivationAlgorithm: .hkdf))
            }
            run = session.run { [weak self] event in
                MainActor.assumeIsolated { self?.handle(event) }
            }
            let publisher = try await connect(service: session.serviceUrl, publisher: true)
            state = .joined
            watch = WatchTogether(
                ownUserId: client.userId ?? "",
                send: { [weak self] message in self?.sendData(message, topic: WatchTogether.topic) },
                participants: { [weak self] in
                    (self?.participants ?? []).filter(\.connected).map { ($0.identity, $0.userId, $0.isLocal) }
                })
            _ = try? await publisher.localParticipant.setMicrophone(enabled: !micMuted && !deafened)
            Sounds.play(.join)
            liveActivity.start(roomName: room.displayName, isDirect: room.isDirect, state: activityState)
            if intent == "video" { toggleCamera() }
            if ring && room.isDirect && !members.contains(where: { $0.userId != client.userId }) {
                startRinging()
            }
            syncRemoteConnections()
            startRefreshing()
        } catch {
            try? await session?.leave()
            await tearDown()
            state = .failed(error.localizedDescription)
        }
    }

    func leave() {
        Task { await leaveAndWait() }
    }

    private func leaveAndWait() async {
        if state == .joined { Sounds.play(room?.isVoice == true ? .leave : .callEnd) }
        let session = session
        await tearDown()
        try? await session?.leave()
        state = .idle
        room = nil
    }

    private func tearDown() async {
        liveActivity.end()
        displayNames = [:]
        stopRinging()
        ring = nil
        showCallScreen = false
        knownOthers = []
        watch?.close()
        watch = nil
        refreshTimer?.invalidate()
        refreshTimer = nil
        run?.cancel()
        run = nil
        let rooms = connections.values
        connections = [:]
        pendingServices = []
        for connection in rooms { await connection.disconnect() }
        session = nil
        members = []
        client = nil
        keyProvider = nil
        participants = []
        reactions = [:]
        raisedHands = []
        handRaised = false
        cameraOn = false
        screenSharing = false
        reconnecting = false
        appliedVolumes = [:]
    }

    private func handle(_ event: CallEvent) {
        switch event {
        case .members(let update):
            membersChanged(update.members)
        case .key(let key):
            guard let data = Data(base64Encoded: key.key) else { return }
            keyProvider?.setKey(keyData: data, participantId: key.identity, index: Int32(key.index))
        case .declined:
            if ring == .ringing { endRinging(.declined) }
        case .unanswered:
            if ring == .ringing { endRinging(.unanswered) }
        case .reaction(let reaction):
            show(reaction: reaction.emoji, for: reaction.identity)
        case .handRaised(let hand):
            if hand.raised { raisedHands.insert(hand.identity) } else { raisedHands.remove(hand.identity) }
            refresh()
        case .error(let error):
            NSLog("WZCALL %@", error.message)
        }
    }

    private func membersChanged(_ members: [CallMember]) {
        self.members = members
        guard let client else { return }
        for userId in Set(members.map(\.userId)) where displayNames[userId] == nil {
            displayNames[userId] = TimelineModel.localpart(userId)
            Task {
                if let name = try? await client.userProfile(userId: userId).displayName { self.displayNames[userId] = name }
            }
        }
        let others = Set(members.filter { $0.userId != client.userId }.map(\.userId))
        if state == .joined {
            if !others.subtracting(knownOthers).isEmpty { Sounds.play(.join) }
            else if !knownOthers.subtracting(others).isEmpty { Sounds.play(.leave) }
        }
        knownOthers = others
        if !others.isEmpty, ring == .ringing {
            stopRinging()
            ring = nil
        }
        syncRemoteConnections()
        refresh()
    }

    @discardableResult
    private func connect(service: String, publisher: Bool) async throws -> LiveKit.Room {
        guard let session, let client, let room else { throw CancellationError() }
        let sfu = try await client.sfuConfig(roomId: room.id, serviceUrl: service)
        if let same = connections.values.first(where: { $0.url == sfu.url }) { return same }
        let options = RoomOptions(
            defaultCameraCaptureOptions: CameraCaptureOptions(position: .front, dimensions: .h720_169, fps: 30),
            defaultScreenShareCaptureOptions: ScreenShareCaptureOptions(dimensions: .h1080_169, fps: 30),
            // Microphone processing as chosen in Settings > Voice & Audio, from this call on
            defaultAudioCaptureOptions: AudioCaptureOptions(echoCancellation: Sounds.prefs?.echoCancellation ?? true,
                                                            autoGainControl: Sounds.prefs?.autoGainControl ?? true,
                                                            noiseSuppression: Sounds.prefs?.noiseSuppression ?? true),
            // VP8 is encoded in software on iPhone, so keep the resolution and give it enough
            // bitrate instead of letting WebRTC scale it down under load
            defaultVideoPublishOptions: VideoPublishOptions(encoding: VideoEncoding(maxBitrate: 2_500_000, maxFps: 30),
                                                            simulcastLayers: [.presetH180_169, .presetH360_169],
                                                            preferredCodec: .vp8,
                                                            degradationPreference: .maintainResolution),
            // No RED (redundant audio): browsers can't decrypt RED-wrapped frames
            defaultAudioPublishOptions: AudioPublishOptions(dtx: true, red: false),
            adaptiveStream: true,
            dynacast: true,
            encryptionOptions: keyProvider.map { EncryptionOptions(keyProvider: $0) })
        let livekit = LiveKit.Room(delegate: self, roomOptions: options)
        try await livekit.connect(url: sfu.url, token: sfu.jwt)
        guard self.session === session else {
            await livekit.disconnect()
            throw CancellationError()
        }
        connections[service] = livekit
        return livekit
    }

    private func syncRemoteConnections() {
        guard let session, state == .joined else { return }
        let own = session.serviceUrl
        let wanted = Set(members.compactMap(\.serviceUrl).filter { $0 != own })
        for service in wanted where connections[service] == nil && !pendingServices.contains(service) {
            pendingServices.insert(service)
            Task {
                do { try await connect(service: service, publisher: false) } catch {
                    NSLog("WZCALL could not connect to %@: %@", service, String(describing: error))
                }
                pendingServices.remove(service)
            }
        }
        for (service, connection) in connections where service != own && !wanted.contains(service) {
            connections[service] = nil
            Task { await connection.disconnect() }
        }
    }

    private var publisher: LiveKit.Room? { session.flatMap { connections[$0.serviceUrl] } }

    private func sendData(_ message: [String: Any], topic: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: message), let publisher else { return }
        Task {
            do {
                try await publisher.localParticipant.publish(data: data, options: DataPublishOptions(topic: topic, reliable: true))
            } catch {
                NSLog("WZCALL data: %@", String(describing: error))
            }
        }
    }

    /// Unmuting while deafened also undeafens you (you can't talk without hearing)
    func toggleMic() {
        if deafened {
            deafened = false
            micMuted = false
        } else {
            micMuted.toggle()
        }
        applyMic()
    }

    func toggleDeafen() {
        if deafened {
            deafened = false
            micMuted = mutedBeforeDeafen
        } else {
            mutedBeforeDeafen = micMuted
            deafened = true
            micMuted = true
        }
        applyMic()
    }

    private func applyMic() {
        let enabled = !micMuted
        if state == .joined { Sounds.play(enabled ? .unmute : .mute) }
        Task { _ = try? await publisher?.localParticipant.setMicrophone(enabled: enabled) }
        refresh()
    }

    func toggleCamera() {
        let enabled = !cameraOn
        Task {
            if enabled, await AVCaptureDevice.requestAccess(for: .video) == false { return }
            do {
                _ = try await publisher?.localParticipant.setCamera(enabled: enabled)
                cameraOn = enabled
                if state == .joined { Sounds.play(enabled ? .cameraOn : .cameraOff) }
            } catch {
                NSLog("WZCALL camera: %@", String(describing: error))
            }
            refresh()
        }
    }

    func toggleScreenShare() {
        let enabled = !screenSharing
        Task {
            do {
                let publication = try await publisher?.localParticipant.setScreenShare(enabled: enabled)
                screenSharing = enabled && publication != nil
            } catch {
                NSLog("WZCALL screen share: %@", String(describing: error))
                screenSharing = publisher?.localParticipant.isScreenShareEnabled() ?? false
            }
            refresh()
        }
    }

    func setVolume(_ volume: Double, for userId: String) {
        userVolumes[userId] = volume
        refresh()
    }

    func toggleLocalMute(_ userId: String) {
        if mutedUsers.contains(userId) { mutedUsers.remove(userId) } else { mutedUsers.insert(userId) }
        refresh()
    }

    func sendReaction(_ reaction: CallReaction) {
        guard let session else { return }
        show(reaction: reaction.emoji, for: session.identity)
        Task {
            do {
                try await session.sendReaction(emoji: reaction.emoji, name: reaction.name)
            } catch {
                NSLog("WZCALL reaction: %@", String(describing: error))
            }
        }
    }

    func toggleHand() {
        guard let session else { return }
        handRaised.toggle()
        let raise = handRaised
        if raise { raisedHands.insert(session.identity) } else { raisedHands.remove(session.identity) }
        refresh()
        Task { try? await session.setHandRaised(raised: raise) }
    }

    private func show(reaction emoji: String, for identity: String) {
        reactions[identity] = emoji
        refresh()
        Task {
            try? await Task.sleep(for: .seconds(Self.reactionVisibleSeconds))
            if reactions[identity] == emoji { reactions[identity] = nil; refresh() }
        }
    }

    private func startRefreshing() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    private func refresh() {
        guard session != nil else { if !participants.isEmpty { participants = [] }; return }
        var remotes: [String: RemoteParticipant] = [:]
        for connection in connections.values {
            for (identity, participant) in connection.remoteParticipants { remotes[identity.stringValue] = participant }
        }
        let local = publisher?.localParticipant
        if let local, screenSharing, !local.isScreenShareEnabled() { screenSharing = false }
        var list: [CallParticipantInfo] = []
        var seen = Set<String>()
        for member in members where seen.insert(member.identity).inserted {
            let isLocal = member.isOwnDevice
            var info = CallParticipantInfo(identity: member.identity, userId: member.userId,
                                           deviceId: member.deviceId, isLocal: isLocal)
            let participant: Participant? = isLocal ? local : remotes[member.identity]
            if let participant {
                info.connected = true
                info.speaking = participant.isSpeaking
                info.micMuted = !participant.isMicrophoneEnabled()
                info.cameraTrack = participant.videoTracks
                    .first { $0.source == .camera && !$0.isMuted }?.track as? VideoTrack
                info.screenTrack = participant.videoTracks
                    .first { $0.source == .screenShareVideo && !$0.isMuted }?.track as? VideoTrack
            }
            if isLocal { info.micMuted = micMuted; info.connected = state == .joined }
            info.handRaised = raisedHands.contains(member.identity)
            info.reaction = reactions[member.identity]
            info.volume = userVolumes[member.userId] ?? 1
            info.locallyMuted = mutedUsers.contains(member.userId)
            list.append(info)

            // Deafen and per-person volume, applied only when they change
            if let remote = participant as? RemoteParticipant {
                let target = deafened || info.locallyMuted ? 0 : info.volume
                for publication in remote.audioTracks {
                    guard let track = publication.track as? RemoteAudioTrack else { continue }
                    let key = "\(member.identity)|\(publication.sid)"
                    if appliedVolumes[key] != target {
                        appliedVolumes[key] = target
                        track.volume = target
                    }
                }
            }
        }
        if list != participants { participants = list }
        liveActivity.update(activityState)
    }
}

struct RingingCall: Equatable {
    let roomId: String
    let eventId: String
    let callerId: String
    let callerName: String?
    let voiceOnly: Bool
}

extension CallManager {
    var activityState: CallActivityAttributes.ContentState {
        let speaker = participants.first { $0.speaking && !$0.isLocal }
        return CallActivityAttributes.ContentState(
            micMuted: micMuted, deafened: deafened,
            othersSpeaking: speaker != nil,
            speakerName: speaker.map { displayNames[$0.userId] ?? $0.userId },
            participantCount: max(Set(participants.map(\.userId)).count, 1),
            ringing: ring == .ringing)
    }

    fileprivate func startRinging() {
        ring = .ringing
        ringback = Sounds.loop(.ringback)
    }

    func ringAgain() {
        guard ring != .ringing, let session else { return }
        Task {
            if (try? await session.ringAgain()) == true { startRinging() }
        }
    }

    fileprivate func endRinging(_ result: RingState) {
        stopRinging()
        ring = result
        CallSounds.play(result == .declined ? "call_declined" : "call_no_answer")
    }

    fileprivate func stopRinging() {
        ringback?.stop()
        ringback = nil
    }


    func watchIncoming(_ client: WizardClient) {
        incomingWatch?.cancel()
        incomingWatch = client.watchIncomingCalls { [weak self] call in
            MainActor.assumeIsolated { self?.ringIn(call) }
        }
        handledElsewhereWatch?.cancel()
        handledElsewhereWatch = client.watchCallsHandledElsewhere { [weak self] roomId in
            MainActor.assumeIsolated {
                if self?.incoming?.roomId == roomId { self?.dismissIncoming() }
            }
        }
    }

    func stopWatchingIncoming() {
        incomingWatch?.cancel()
        incomingWatch = nil
        handledElsewhereWatch?.cancel()
        handledElsewhereWatch = nil
        dismissIncoming()
    }

    private func ringIn(_ call: IncomingCall) {
        guard incoming == nil, !isInCall(roomId: call.roomId) else { return }
        let remaining = Double(call.expiresAt) / 1000 - Date().timeIntervalSince1970
        guard remaining > 0 else { return }
        incoming = RingingCall(roomId: call.roomId, eventId: call.eventId, callerId: call.sender,
                               callerName: call.senderName, voiceOnly: call.intent == "audio")
        if call.ring { ringtone = Sounds.loop(.ring) }
        incomingTimer?.cancel()
        incomingTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(remaining))
            guard !Task.isCancelled else { return }
            self?.dismissIncoming()
        }
    }

    func acceptIncoming(session: MatrixSession) {
        guard let call = incoming, let room = session.roomList?.room(id: call.roomId) else { return }
        dismissIncoming()
        showCallScreen = true
        Task { await join(room, session: session, intent: call.voiceOnly ? "audio" : "video") }
    }

    func declineIncoming(session: MatrixSession) {
        guard let call = incoming else { return }
        dismissIncoming()
        Task { try? await session.client?.declineCall(roomId: call.roomId, eventId: call.eventId) }
    }

    func dismissIncoming() {
        incomingTimer?.cancel()
        incomingTimer = nil
        ringtone?.stop()
        ringtone = nil
        incoming = nil
    }
}

extension CallManager: RoomDelegate {
    nonisolated func room(_ room: LiveKit.Room, didUpdateConnectionState connectionState: ConnectionState,
                          from oldConnectionState: ConnectionState) {
        Task { @MainActor in
            if room === self.publisher { self.reconnecting = connectionState == .reconnecting }
        }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: RemoteParticipant?, didReceiveData data: Data,
                          forTopic topic: String, encryptionType: EncryptionType) {
        let from = participant?.identity?.stringValue ?? ""
        Task { @MainActor in
            if WatchTogether.topics.contains(topic) { self.watch?.receive(data, from: from) }
        }
    }

    nonisolated func room(_ room: LiveKit.Room, didDisconnectWithError error: LiveKitError?) {
        Task { @MainActor in
            guard room === self.publisher, self.state == .joined else { return }
            let session = self.session
            await self.tearDown()
            try? await session?.leave()
            self.room = nil
            self.state = .failed(error?.localizedDescription ?? String(localized: "call.disconnected"))
        }
    }
}

struct CallReaction: Identifiable, Hashable {
    var id: String { name }
    let emoji: String
    let name: String

    static let all: [CallReaction] = [
        .init(emoji: "👍", name: "thumbsup"), .init(emoji: "👎", name: "thumbsdown"),
        .init(emoji: "👏", name: "clap"), .init(emoji: "😂", name: "laugh"),
        .init(emoji: "😮", name: "wow"), .init(emoji: "❤️", name: "heart"),
        .init(emoji: "🎉", name: "party"), .init(emoji: "🔥", name: "fire"),
    ]
}
