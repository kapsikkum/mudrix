import Foundation

enum ShareInbox {
    // Per build (Config/Signing.xcconfig), since app groups belong to one Apple team
    static let group = Bundle.main.object(forInfoDictionaryKey: "WZAppGroup") as? String ?? "group.chat.mudrix.mobile"

    /// How long a share waits for the app before it is dropped (nobody sent it)
    static let outboxLifetime: TimeInterval = 7 * 24 * 60 * 60

    struct RoomEntry: Codable, Identifiable, Hashable {
        let id: String
        let name: String
        let isDirect: Bool
    }

    struct Item: Codable, Identifiable {
        let id: UUID
        let roomId: String
        let text: String?
        let files: [String]
    }

    static func saveTheme(_ name: String) {
        UserDefaults(suiteName: group)?.set(name, forKey: "theme")
    }

    static var theme: WZ.Theme {
        UserDefaults(suiteName: group)?.string(forKey: "theme").flatMap(WZ.Theme.init(rawValue:)) ?? .default
    }

    /// Streamer mode hides private details; the notification service extension can't read the app's
    /// own settings, so the app mirrors the flag here
    static func saveHideContent(_ hidden: Bool) {
        UserDefaults(suiteName: group)?.set(hidden, forKey: "hideNotificationContent")
    }

    static var hideContent: Bool {
        UserDefaults(suiteName: group)?.bool(forKey: "hideNotificationContent") ?? false
    }

    /// Notification sounds: the gateway's alert always plays the system sound, so the extension
    /// silences it when the app's own settings would not have played one
    static func saveNotificationSounds(_ enabled: Bool) {
        UserDefaults(suiteName: group)?.set(enabled, forKey: "notificationSounds")
    }

    static var notificationSounds: Bool {
        UserDefaults(suiteName: group)?.object(forKey: "notificationSounds") as? Bool ?? true
    }

    private static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    }

    private static var outbox: URL? { container?.appendingPathComponent("Outbox", isDirectory: true) }


    /// The room names the share sheet lists. They are not messages, and the notification service
    /// reads them while the phone is locked, so they only get the after-first-unlock class.
    static func saveRooms(_ rooms: [RoomEntry]) {
        guard let url = container?.appendingPathComponent("rooms.json"),
              let data = try? JSONEncoder().encode(rooms) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        excludeFromBackup(url)
    }

    static func loadRooms() -> [RoomEntry] {
        guard let url = container?.appendingPathComponent("rooms.json"),
              let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([RoomEntry].self, from: data)) ?? []
    }


    @discardableResult
    static func enqueue(roomId: String, text: String?, files: [URL]) throws -> Item {
        let outbox = try preparedOutbox()
        let id = UUID()
        let folder = outbox.appendingPathComponent(id.uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true,
                                                attributes: [.protectionKey: FileProtectionType.complete])
        protect(folder)
        var names: [String] = []
        for (index, file) in files.enumerated() {
            let name = "\(index)-\(file.lastPathComponent)"
            let copy = folder.appendingPathComponent(name)
            try FileManager.default.copyItem(at: file, to: copy)
            protect(copy)
            names.append(name)
        }
        let item = Item(id: id, roomId: roomId, text: text, files: names)
        let itemFile = folder.appendingPathComponent("item.json")
        try JSONEncoder().encode(item).write(to: itemFile, options: [.atomic, .completeFileProtection])
        protect(itemFile)
        return item
    }

    static func pending() -> [Item] {
        guard let outbox, let folders = try? FileManager.default.contentsOfDirectory(
            at: outbox, includingPropertiesForKeys: [.creationDateKey]) else { return [] }
        return folders.compactMap { folder in
            guard let data = try? Data(contentsOf: folder.appendingPathComponent("item.json")) else { return nil }
            return try? JSONDecoder().decode(Item.self, from: data)
        }
    }

    static func fileURL(_ name: String, in item: Item) -> URL? {
        outbox?.appendingPathComponent(item.id.uuidString).appendingPathComponent(name)
    }

    static func remove(_ item: Item) {
        guard let folder = outbox?.appendingPathComponent(item.id.uuidString) else { return }
        try? FileManager.default.removeItem(at: folder)
    }

    /// Drops shares nobody sent within `age` (an account that never came back): called when the app
    /// starts, so they do not sit on the device forever.
    static func expireStale(now: Date = Date(), olderThan age: TimeInterval = ShareInbox.outboxLifetime) {
        guard let outbox, let folders = try? FileManager.default.contentsOfDirectory(
            at: outbox, includingPropertiesForKeys: [.creationDateKey, .contentModificationDateKey]) else { return }
        for folder in folders {
            let values = try? folder.resourceValues(forKeys: [.creationDateKey, .contentModificationDateKey])
            let created = values?.creationDate ?? values?.contentModificationDate
            guard let created, now.timeIntervalSince(created) > age else { continue }
            try? FileManager.default.removeItem(at: folder)
        }
    }

    /// Forgets what the share sheet keeps for an account that signs out: the items waiting to be
    /// sent and the room names, so the next account does not see either.
    static func clear() {
        if let outbox { try? FileManager.default.removeItem(at: outbox) }
        if let rooms = container?.appendingPathComponent("rooms.json") {
            try? FileManager.default.removeItem(at: rooms)
        }
    }

    private static func preparedOutbox() throws -> URL {
        guard let outbox else { throw CocoaError(.fileNoSuchFile) }
        if !FileManager.default.fileExists(atPath: outbox.path) {
            try FileManager.default.createDirectory(at: outbox, withIntermediateDirectories: true,
                                                    attributes: [.protectionKey: FileProtectionType.complete])
        }
        protect(outbox)
        return outbox
    }

    /// Shared photos and text are private: locked when the phone is locked, and not in a backup.
    private static func protect(_ url: URL) {
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        excludeFromBackup(url)
    }

    private static func excludeFromBackup(_ url: URL) {
        var target = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? target.setResourceValues(values)
    }
}
