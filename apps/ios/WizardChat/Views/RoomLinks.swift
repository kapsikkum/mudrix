import SwiftUI
import WizardChatCore

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
        let roomId: String
        if let known = roomList?.joinedRooms.first(where: { $0.id == target || $0.canonicalAlias == target })?.id
            ?? roomList?.allSpaces.first(where: { $0.id == target })?.id {
            roomId = known
        } else {
            do {
                roomId = try await session.join(link.replacingOccurrences(of: "%23", with: "#"))
            } catch {
                CopyToast.shared.show(L10n.format("common.joinFailed", "\(error)"))
                return
            }
        }
        let isSpace = roomList?.allSpaces.contains { $0.id == roomId } == true || roomList?.room(id: roomId)?.isSpace == true
        opener.open(roomId, isSpace)
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
