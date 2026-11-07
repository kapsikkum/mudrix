import Foundation
import WizardChatCore

/// Call membership belongs to the person who joined, so nobody else can move them. Someone who manages a space asks
/// instead: the request is an `io.github.kapsikkum.mudrix.voice_move` room event (also sent as `chat.mudrix.voice_move`) in
/// the voice channel the person is in, and their own client checks it and joins the other channel. Same rules as the web's
/// `voiceMove.ts` and `useVoiceMoves.ts` (`VoiceMoves.kt` on Android).
@MainActor
enum VoiceMoves {
    /// Requests older than this are ignored, so a move is never replayed after a restart
    static let maxAgeMs = 60_000
    /// How far ahead of this device's clock a request may be dated before it is ignored
    static let maxClockSkewMs = 30_000
    private static let maxRemembered = 200

    private static var subscription: Subscription?
    private static var seen: [String] = []

    /// Neither stale nor dated in the future: a forged far-future timestamp would otherwise outlive the freshness window
    static func isFresh(originServerTs: Int, now: Int) -> Bool {
        if originServerTs == 0 { return false }
        let age = now - originServerTs
        return age <= maxAgeMs && age >= -maxClockSkewMs
    }

    /// Asks `userId`, who is in `fromRoomId`, to join `toRoomId` (the sender must manage a space containing both)
    static func request(client: WizardClient, fromRoomId: String, userId: String, toRoomId: String) async throws {
        let content: JSONValue = .object([
            "user_id": .string(userId),
            "to_room_id": .string(toRoomId),
            "move_id": .string(UUID().uuidString),
        ])
        _ = try await client.sendEvent(roomId: fromRoomId, eventType: MudrixTypes.voiceMove, content: content)
        // Clients that have not updated only listen for the old name
        _ = try? await client.sendEvent(roomId: fromRoomId, eventType: MudrixTypes.typeAndLegacy(MudrixTypes.voiceMove)[1], content: content)
    }

    static func start(client: WizardClient, calls: CallManager, session: MatrixSession, roomList: RoomListModel, prefs: AppPreferences) {
        stop()
        guard let me = client.userId else { return }
        subscription = client.watchRoomEvents(types: MudrixTypes.typeAndLegacy(MudrixTypes.voiceMove)) { event in
            Task { @MainActor in
                await handle(client: client, calls: calls, session: session, roomList: roomList, prefs: prefs, me: me, event: event)
            }
        }
    }

    static func stop() {
        subscription?.cancel()
        subscription = nil
        seen = []
    }

    private static func handle(client: WizardClient, calls: CallManager, session: MatrixSession, roomList: RoomListModel,
                               prefs: AppPreferences, me: String, event: RoomEvent) async {
        guard let request = event.content.object else { return }
        // One move arrives under both type names; it is acted on once
        let key = request["move_id"]?.string.map { "m:" + $0 } ?? event.eventId
        if seen.contains(key) { return }
        seen.append(key)
        if seen.count > maxRemembered { seen.removeFirst() }
        guard let to = request["to_room_id"]?.string, request["user_id"]?.string == me else { return }
        guard isFresh(originServerTs: event.originServerTs, now: Int(Date().timeIntervalSince1970 * 1000)) else { return }
        guard prefs.allowVoiceMoves, calls.isInCall(roomId: event.roomId) else { return }

        guard let target = roomList.room(id: to), !target.isInvite else { return }
        let flagged = await isFlaggedVoice(client: client, roomId: to)
        guard target.isVoice || flagged else { return }
        guard await mayMoveBetween(client: client, graph: roomList.graph, userId: event.sender, fromRoomId: event.roomId, toRoomId: to) else { return }
        // Still in the same call after the checks
        guard calls.isInCall(roomId: event.roomId) else { return }
        let members = try? await client.members(roomId: event.roomId)
        let by = members?.first { $0.userId == event.sender }?.displayName ?? event.sender
        CopyToast.shared.show(L10n.format("voice.movedBy", target.displayName, by))
        Sounds.play(.moved)
        await calls.join(target, session: session, intent: "audio")
    }

    private static func isFlaggedVoice(client: WizardClient, roomId: String) async -> Bool {
        guard let raw = try? await client.stateEventsOfTypes(roomId: roomId, eventTypes: MudrixTypes.typeAndLegacy(MudrixTypes.voiceChannel)) else {
            return false
        }
        return SpaceModern.isVoiceChannelFlagged(MudrixRoomState(raw: raw))
    }

    /// Whether `roomId` agrees that `spaceId` is its parent. A child link alone is one-sided: any admin of a space can list
    /// somebody else's room, so the room has to name the space back with an `m.space.parent`, which only people with power
    /// in the room can send. A room that predates that still counts when the sender could have set it.
    private static func confirmsParent(client: WizardClient, roomId: String, spaceId: String, senderId: String) async -> Bool {
        if let parent = try? await client.stateEvent(roomId: roomId, eventType: "m.space.parent", stateKey: spaceId),
           let via = parent["via"]?.array, !via.isEmpty {
            return true
        }
        guard let settings = try? await client.localRoomSettings(roomId: roomId) else { return false }
        return SpaceModern.canSendState(settings.powerLevels.object, creators: Set(settings.creators), userId: senderId, type: "m.space.parent")
    }

    /// The spaces above `roomId`, following only links both sides agree on and only through spaces we are in
    private static func ancestorSpaces(client: WizardClient, graph: [SpaceNode], roomId: String, senderId: String) async -> Set<String> {
        var found = Set<String>()
        var queue = [roomId]
        while let child = queue.popLast() {
            for space in graph where !found.contains(space.spaceId) && space.children.contains(where: { $0.roomId == child }) {
                if await confirmsParent(client: client, roomId: child, spaceId: space.spaceId, senderId: senderId) {
                    found.insert(space.spaceId)
                    queue.insert(space.spaceId, at: 0)
                }
            }
        }
        return found
    }

    /// Whether `userId` is in, and manages (can edit the children of), a space that contains both channels
    static func mayMoveBetween(client: WizardClient, graph: [SpaceNode], userId: String, fromRoomId: String, toRoomId: String) async -> Bool {
        if fromRoomId == toRoomId { return false }
        let above = await ancestorSpaces(client: client, graph: graph, roomId: toRoomId, senderId: userId)
        for spaceId in await ancestorSpaces(client: client, graph: graph, roomId: fromRoomId, senderId: userId) where above.contains(spaceId) {
            guard let settings = try? await client.localRoomSettings(roomId: spaceId) else { continue }
            guard SpaceModern.canSendState(settings.powerLevels.object, creators: Set(settings.creators), userId: userId, type: "m.space.child") else { continue }
            // Power levels outlive membership: someone who left the space no longer manages it
            let members = (try? await client.members(roomId: spaceId)) ?? []
            if members.contains(where: { $0.userId == userId && !$0.isInvite }) { return true }
        }
        return false
    }
}
