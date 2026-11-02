import Foundation

@MainActor
enum ShareSender {
    private static var busy = false

    static func sendPending(roomList: RoomListModel, notifier: MessageNotifier) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        for item in ShareInbox.pending() {
            guard let room = roomList.room(id: item.roomId) else { continue }
            let timeline = TimelineModel(client: roomList.client, roomId: room.id)
            await timeline.start()
            openRoom(item.roomId, notifier: notifier)
            for name in item.files {
                guard let url = ShareInbox.fileURL(name, in: item) else { continue }
                await timeline.sendFile(at: url)
            }
            if let text = item.text { await timeline.send(text) }
            ShareInbox.remove(item)
            CopyToast.shared.show(L10n.format("share.sentTo", room.displayName))
        }
    }

    static func publishRooms(_ roomList: RoomListModel) {
        let entries = roomList.joinedRooms.prefix(200)
            .map { ShareInbox.RoomEntry(id: $0.id, name: $0.displayName, isDirect: $0.isDirect) }
        ShareInbox.saveRooms(Array(entries))
    }
}
