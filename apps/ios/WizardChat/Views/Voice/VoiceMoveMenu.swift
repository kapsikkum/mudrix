import SwiftUI
import WizardChatCore

/// Remembers for a minute whether the signed-in person may move people between two voice channels
@MainActor
private enum VoiceMoveVerdicts {
    private static var verdicts: [String: (at: Date, allowed: Bool)] = [:]

    static func allowed(client: WizardClient, graph: [SpaceNode], me: String, from: String, to: String) async -> Bool {
        let key = me + "|" + from + "|" + to
        if let known = verdicts[key], Date().timeIntervalSince(known.at) < 60 { return known.allowed }
        let allowed = await VoiceMoves.mayMoveBetween(client: client, graph: graph, userId: me, fromRoomId: from, toRoomId: to)
        verdicts[key] = (Date(), allowed)
        return allowed
    }
}

/// "Move to..." on a person in a voice channel: lists the space's other voice channels, only when the signed-in person
/// manages a space that holds both (the person's own device then joins the other channel)
private struct VoiceMoveMenu: ViewModifier {
    let roomId: String
    let userId: String

    @EnvironmentObject private var session: MatrixSession
    @State private var targets: [RoomSummary] = []

    func body(content: Content) -> some View {
        content
            .task(id: roomId + "|" + userId) { await load() }
            .contextMenu {
                if !targets.isEmpty {
                    Menu(String(localized: "room.settings.channels.moveTo")) {
                        ForEach(targets, id: \.id) { target in
                            Button(target.displayName) { move(to: target.id) }
                        }
                    }
                }
            }
    }

    private func load() async {
        guard let client = session.client, let me = client.userId, me != userId, let list = session.roomList else {
            targets = []
            return
        }
        let graph = list.graph
        let root = SpaceModern.rootSpace(of: roomId, in: graph)
        guard root != roomId else {
            targets = []
            return
        }
        let candidates = list.rooms(for: .space(root)).filter { $0.isVoice && !$0.isInvite && $0.id != roomId }
        var allowed: [RoomSummary] = []
        for room in candidates.prefix(20) {
            if await VoiceMoveVerdicts.allowed(client: client, graph: graph, me: me, from: roomId, to: room.id) {
                allowed.append(room)
            }
        }
        targets = allowed
    }

    private func move(to targetId: String) {
        guard let client = session.client else { return }
        let from = roomId
        let user = userId
        Task {
            do {
                try await VoiceMoves.request(client: client, fromRoomId: from, userId: user, toRoomId: targetId)
            } catch {
                CopyToast.shared.show(error.localizedDescription)
            }
        }
    }
}

extension View {
    func voiceMoveMenu(roomId: String, userId: String) -> some View {
        modifier(VoiceMoveMenu(roomId: roomId, userId: userId))
    }
}
