import SwiftUI
import UIKit
import MudrixCore

enum RoomLinks {
    private static let prefix = "https://matrix.to/#/"

    static func target(_ link: String) -> String? {
        let decoded = link.replacingOccurrences(of: "%23", with: "#")
        guard decoded.hasPrefix(prefix) else { return nil }
        let path = decoded.dropFirst(prefix.count).split(separator: "?", maxSplits: 1).first.map(String.init) ?? ""
        let parts = path.split(separator: "/", omittingEmptySubsequences: false).map { $0.removingPercentEncoding ?? String($0) }
        guard let id = parts.first, id.hasPrefix("#") || id.hasPrefix("!"), id.contains(":") else { return nil }
        if parts.count > 1, !parts[1].isEmpty { return nil }
        return id
    }

    @MainActor
    static func knownName(_ link: String, roomList: RoomListModel?) -> String? {
        guard let target = target(link) else { return nil }
        if let room = roomList?.joinedRooms.first(where: { $0.id == target || $0.canonicalAlias == target }) { return room.name }
        return roomList?.allSpaces.first { $0.id == target }?.name
    }

    static func link(_ room: RoomSummary) -> String {
        if let alias = room.canonicalAlias { return prefix + alias }
        return prefix + room.id + via(room.id)
    }

    static func link(_ space: SpaceSummary) -> String { prefix + space.id + via(space.id) }

    private static func via(_ id: String) -> String {
        guard let colon = id.firstIndex(of: ":") else { return "" }
        return "?via=" + id[id.index(after: colon)...]
    }

    @MainActor
    static func open(_ link: String, session: MatrixSession, opener: RoomOpener) async {
        guard let target = target(link) else { return }
        let roomList = session.roomList
        // Already joined: just show it
        if let known = roomList?.joinedRooms.first(where: { $0.id == target || $0.canonicalAlias == target }) {
            opener.open(known.id, known.isSpace)
            return
        }
        if let known = roomList?.allSpaces.first(where: { $0.id == target }) {
            opener.open(known.id, true)
            return
        }
        // Not joined: joining is a membership change, so ask first. An invite already knows the
        // room's name and kind; otherwise the prompt names the alias or ID the link points at.
        guard let presenter = topViewController() else { return }
        let invite = roomList?.invites.first(where: { $0.id == target || $0.canonicalAlias == target })
        let name = (invite?.name).flatMap { $0.isEmpty ? nil : $0 } ?? target
        let title = invite?.isSpace == true ? String(localized: "space.join.title") : String(localized: "link.joinTitle")
        let alert = UIAlertController(title: title,
                                      message: L10n.format("link.joinMessage", name),
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: String(localized: "common.cancel"), style: .cancel))
        alert.addAction(UIAlertAction(title: String(localized: "common.join"), style: .default) { _ in
            Task { @MainActor in await joinAndOpen(link: link, session: session, opener: opener) }
        })
        presenter.present(alert, animated: true)
    }

    /// Runs only from the Join action of the prompt above. A space is joined on its own here: its
    /// children are never part of this request.
    @MainActor
    private static func joinAndOpen(link: String, session: MatrixSession, opener: RoomOpener) async {
        let roomId: String
        do {
            roomId = try await session.join(link.replacingOccurrences(of: "%23", with: "#"))
        } catch {
            CopyToast.shared.show(L10n.format("common.joinFailed", "\(error)"))
            return
        }
        let roomList = session.roomList
        var isSpace = roomList?.allSpaces.contains { $0.id == roomId } == true || roomList?.room(id: roomId)?.isSpace == true
        if !isSpace, let client = session.client, let details = try? await client.roomDetails(roomId: roomId) {
            isSpace = details.isSpace
        }
        // The background runner must not join every room of a space the user opened from a link: it skips
        // the space once (AutoJoinRunner.skipLinkJoined)
        if isSpace, let userId = session.userId {
            LinkJoinedSpaces.add(roomId, userId: userId)
        }
        opener.open(roomId, isSpace)
    }

    /// A prompt already on screen, or another alert, is not stacked over: the tap does nothing
    @MainActor
    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first,
              var top = (scene.keyWindow ?? scene.windows.first)?.rootViewController else { return nil }
        while let presented = top.presentedViewController {
            if presented is UIAlertController { return nil }
            top = presented
        }
        return top
    }
}

struct RoomOpener {
    var open: (_ id: String, _ isSpace: Bool) -> Void = { _, _ in }
}

private struct RoomOpenerKey: EnvironmentKey {
    static let defaultValue = RoomOpener()
}

extension EnvironmentValues {
    var roomOpener: RoomOpener {
        get { self[RoomOpenerKey.self] }
        set { self[RoomOpenerKey.self] = newValue }
    }
}
