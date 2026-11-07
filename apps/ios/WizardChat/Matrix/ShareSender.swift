import Foundation

@MainActor
enum ShareSender {
    private static var busy = false

    static func sendPending(roomList: RoomListModel, notifier: MessageNotifier, prefs: AppPreferences,
                            uploadLimit: Int64) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        // Shared photos and videos follow the Media settings like the ones picked in the composer
        let prep = UploadPrep(prefs: prefs, maxUploadBytes: uploadLimit)
        for item in ShareInbox.pending() {
            guard let room = roomList.room(id: item.roomId) else { continue }
            let timeline = TimelineModel(client: roomList.client, roomId: room.id)
            await timeline.start()
            openRoom(item.roomId, notifier: notifier)
            for name in item.files {
                guard let url = ShareInbox.fileURL(name, in: item) else { continue }
                await timeline.sendFile(at: url, prep: prep)
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
