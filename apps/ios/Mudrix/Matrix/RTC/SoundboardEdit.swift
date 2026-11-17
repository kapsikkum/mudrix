import Foundation
import MudrixCore

/// Adding, changing and removing clips on the personal, room or space board: the writes of the web's `boards.ts`
/// and `upload.ts`, and the checks of Android's `matrix/rtc/SoundboardEdit.kt`.
enum SoundboardEdit {
    /// What can go wrong; `key` is the message shown for it
    enum Problem: String, Equatable {
        case type, size, duration, decode, limit, forbidden, upload, save

        var key: String { "soundboard.error.\(rawValue)" }
    }

    struct Failure: Error, Equatable {
        let problem: Problem
        var detail: String?
    }

    /// The power level of a moderator, the "Moderators and up" choice of the room settings
    static let moderatorLevel = 50.0

    /// The three formats allowed, from the type the system reports or from the file name's ending
    static func mimetype(contentType: String?, fileName: String?) -> String? {
        if let known = SoundboardFormat.normalizeMimetype(contentType) { return known }
        let ending = (fileName ?? "").split(separator: ".").last.map { String($0).lowercased() } ?? ""
        switch ending {
        case "mp3": return "audio/mpeg"
        case "ogg": return "audio/ogg"
        case "wav": return "audio/wav"
        default: return nil
        }
    }

    /// What is wrong with a chosen file, or nil when it can be added
    static func check(mimetype: String?, size: Int64, durationMs: Int64) -> Problem? {
        if mimetype == nil { return .type }
        if size <= 0 || size > SoundboardFormat.maxSizeBytes { return .size }
        if durationMs <= 0 { return .decode }
        if durationMs > SoundboardFormat.maxDurationMs { return .duration }
        return nil
    }

    static func cleanName(_ name: String) -> String {
        let words = name.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return String(words.prefix(SoundboardFormat.maxNameLength))
    }

    static func cleanEmoji(_ emoji: String) -> String? {
        let trimmed = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(16))
    }

    /// `c_` and 16 hex digits, as the web's `newSoundId`
    static func newId() -> String {
        "c_" + (0..<8).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    }

    /// The board with `sound` added; throws when it is full
    static func added(_ board: [SoundboardSound], _ sound: SoundboardSound) throws -> [SoundboardSound] {
        guard board.count < SoundboardFormat.maxSounds else { throw Failure(problem: .limit) }
        return board + [sound]
    }

    static func replaced(_ board: [SoundboardSound], _ sound: SoundboardSound) -> [SoundboardSound] {
        board.map { $0.id == sound.id ? sound : $0 }
    }

    static func removed(_ board: [SoundboardSound], id: String) -> [SoundboardSound] {
        board.filter { $0.id != id }
    }

    /// How a board is stored in account data or room state
    static func content(_ board: [SoundboardSound]) -> JSONValue {
        .object(["sounds": .array(board.map { sound in
            var entry: [String: JSONValue] = [
                "id": .string(sound.id),
                "name": .string(sound.name),
                "url": .string(sound.url),
                "mimetype": .string(sound.mimetype),
                "durationMs": .number(Double(sound.durationMs)),
                "size": .number(Double(sound.size)),
                "volume": .number(Double(min(max(sound.volume, 0), 1))),
            ]
            if let emoji = sound.emoji { entry["emoji"] = .string(emoji) }
            return .object(entry)
        })])
    }

    static func settingsContent(enabled: Bool, minPowerLevel: Double) -> JSONValue {
        .object(["enabled": .bool(enabled), "minPowerLevel": .number(minPowerLevel)])
    }

    /// Uploads the file and returns the clip to add to a board (it is not saved yet)
    static func upload(client: MudrixClient, data: Data, mimetype: String, durationMs: Int64, name: String,
                       emoji: String?, volume: Float) async throws -> SoundboardSound {
        let url: String
        do {
            url = try await client.uploadMedia(data: data, mimetype: mimetype)
        } catch {
            throw Failure(problem: .upload, detail: error.localizedDescription)
        }
        let clean = cleanName(name)
        return SoundboardSound(id: newId(), name: clean.isEmpty ? "Sound" : clean, emoji: emoji.flatMap(cleanEmoji), url: url,
                               mimetype: mimetype, durationMs: durationMs, size: Int64(data.count),
                               volume: min(max(volume, 0), 1))
    }

    static func writePersonal(client: MudrixClient, board: [SoundboardSound]) async throws {
        do {
            try await client.setAccountData(eventType: SoundboardFormat.boardType, content: content(board))
        } catch {
            throw Failure(problem: .save, detail: error.localizedDescription)
        }
    }

    /// Whether `userId` may send `type` state in a room (its board or its settings)
    static func canManage(_ data: RoomSoundboards.Snapshot?, userId: String, type: String) -> Bool {
        guard let data, let levels = data.powerLevels else { return false }
        return SpaceModern.canSendState(levels, creators: data.creators, userId: userId, type: type)
    }

    static func writeRoom(client: MudrixClient, roomId: String, userId: String, board: [SoundboardSound]) async throws {
        let data = await RoomSoundboards.load(client: client, roomId: roomId)
        guard canManage(data, userId: userId, type: SoundboardFormat.boardType) else { throw Failure(problem: .forbidden) }
        do {
            try await client.setStateEvent(roomId: roomId, eventType: SoundboardFormat.boardType, stateKey: "",
                                           content: content(board))
        } catch {
            throw Failure(problem: .save, detail: error.localizedDescription)
        }
        RoomSoundboards.remember(roomId: roomId, board: board)
    }

    static func writeRoomSettings(client: MudrixClient, roomId: String, enabled: Bool, minPowerLevel: Double) async throws {
        try await client.setStateEvent(roomId: roomId, eventType: RoomSoundboards.settingsType, stateKey: "",
                                       content: settingsContent(enabled: enabled, minPowerLevel: minPowerLevel))
        RoomSoundboards.remember(roomId: roomId, settings: RoomSoundboards.Settings(enabled: enabled, minPowerLevel: minPowerLevel))
    }
}
