import Foundation
import MudrixCore

/// Adding, changing and removing clips of a core pack (the personal one, or a room's or space's).
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

    /// The three formats the pre-MSC4577 clients know, from the type the system reports or from the file name's ending
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

    /// What is wrong with a chosen file, or nil when it can be added (the core's limits)
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

    /// A shortcode of the standard's shape: ASCII letters, digits, `-` and `_`, at most 100 bytes
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

    static func settingsContent(enabled: Bool, minPowerLevel: Double) -> JSONValue {
        .object(["enabled": .bool(enabled), "minPowerLevel": .number(minPowerLevel)])
    }

    private static func problem(_ error: Error) -> Problem {
        let message = error.localizedDescription
        if message.contains("tooLarge") { return .size }
        if message.contains("tooLong") { return .duration }
        if message.contains("unsupported") { return .type }
        return .upload
    }

    /// Uploads the file through the core and returns the clip to add to a pack (it is not saved yet)
    static func upload(client: MudrixClient, data: Data, mimetype: String, durationMs: Int64, name: String,
                       emoji: String?) async throws -> SoundboardSound {
        let uploaded: MudrixCore.SoundboardSound
        do {
            uploaded = try await client.uploadSound(data: data, mimetype: mimetype, durationMs: Int(durationMs))
        } catch {
            throw Failure(problem: problem(error), detail: error.localizedDescription)
        }
        let clean = cleanName(name)
        return SoundboardSound(id: newId(), name: clean.isEmpty ? "Sound" : clean,
                               emoji: emoji.flatMap(cleanEmoji), url: uploaded.url,
                               mimetype: uploaded.mimetype ?? mimetype,
                               durationMs: Int64(uploaded.durationMs ?? Int(durationMs)),
                               size: Int64(uploaded.size ?? data.count), volume: 1)
    }

    /// Writes the personal pack (`moe.crafty.soundboard` account data)
    static func savePersonal(client: MudrixClient, pack: MudrixCore.SoundPack?, board: [SoundboardSound]) async throws {
        do {
            try await client.saveSoundPack(roomId: nil, stateKey: "", name: pack?.name ?? "",
                                           attribution: pack?.attribution,
                                           sounds: board.map(SoundboardFormat.coreSound))
        } catch {
            throw Failure(problem: .save, detail: error.localizedDescription)
        }
    }

    /// Writes a room's pack; a room without one gets the default pack first. Returns its state key.
    static func saveRoom(client: MudrixClient, roomId: String, stateKey: String, name: String,
                         attribution: String?, board: [SoundboardSound]) async throws -> String {
        do {
            let key = stateKey.isEmpty ? try await client.createSoundPack(roomId: roomId, name: name) : stateKey
            try await client.saveSoundPack(roomId: roomId, stateKey: key, name: name, attribution: attribution,
                                           sounds: board.map(SoundboardFormat.coreSound))
            return key
        } catch {
            throw Failure(problem: .save, detail: error.localizedDescription)
        }
    }

    /// The "who may play" setting is a Mudrix room setting, not part of the standard; it stays as it was
    static func writeRoomSettings(client: MudrixClient, roomId: String, enabled: Bool, minPowerLevel: Double) async throws {
        try await client.setStateEvent(roomId: roomId, eventType: RoomSoundboards.settingsType, stateKey: "",
                                       content: settingsContent(enabled: enabled, minPowerLevel: minPowerLevel))
        RoomSoundboards.remember(roomId: roomId, settings: RoomSoundboards.Settings(enabled: enabled, minPowerLevel: minPowerLevel))
    }
}
