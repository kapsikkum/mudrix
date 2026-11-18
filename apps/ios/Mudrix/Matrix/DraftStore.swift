import CryptoKit
import Foundation

/// A stable, file-name-safe folder name for an account, shared by the stores that keep data the
/// next account on the device must not see (drafts and the decrypted media cache).
enum AccountScope {
    static func folderName(_ userId: String) -> String {
        let digest = SHA256.hash(data: Data(userId.utf8))
        return "user-" + digest.map { String(format: "%02x", Int($0)) }.joined()
    }
}

/// The drafts of the signed-in account, kept out of `UserDefaults`: each account has a folder of
/// its own in Application Support, protected with `.completeFileProtection` and excluded from
/// backups, so signing out (or in as someone else) does not expose what was typed.
///
/// The key is still the room (and thread) as the composer had it, so nothing the composer shows
/// changes. A draft left in `UserDefaults` by an older version is moved over the first time it is
/// read, and the old preference removed.
@MainActor
final class DraftStore {
    static let shared = DraftStore()

    /// How long typing pauses before the draft reaches the disk; every keystroke only changes
    /// memory, so typing does not write a file per letter.
    static let writeDelay: Duration = .milliseconds(400)

    private var draftsByScope: [String: [String: String]] = [:]
    private var dirtyScopes: Set<String> = []
    private var flushTask: Task<Void, Never>?

    private init() {}

    /// The saved draft for a room (and thread), or nil when there is none.
    func draft(account: String?, key: String) -> String? {
        guard let account, !account.isEmpty else { return nil }
        let scope = AccountScope.folderName(account)
        if let saved = drafts(for: scope)[key], !saved.isEmpty {
            // The per-account copy wins; the old preference for it is not needed any more
            UserDefaults.standard.removeObject(forKey: key)
            return saved
        }

        // A draft from before drafts were per account (and file protected): move it over once
        guard let legacy = UserDefaults.standard.string(forKey: key), !legacy.isEmpty else { return nil }
        var stored = drafts(for: scope)
        stored[key] = legacy
        draftsByScope[scope] = stored
        if write(scope) { UserDefaults.standard.removeObject(forKey: key) }
        return legacy
    }

    /// Remembers what the composer holds. Empty text forgets the draft at once (a sent message
    /// must not come back); anything else is written after a short pause.
    func setDraft(_ text: String, account: String?, key: String) {
        guard let account, !account.isEmpty else { return }
        let scope = AccountScope.folderName(account)
        var stored = drafts(for: scope)
        if text.isEmpty {
            guard stored.removeValue(forKey: key) != nil else { return }
            draftsByScope[scope] = stored
            dirtyScopes.insert(scope)
            write(scope)
            return
        }
        guard stored[key] != text else { return }
        stored[key] = text
        draftsByScope[scope] = stored
        dirtyScopes.insert(scope)
        scheduleFlush()
    }

    /// Writes what is waiting now (leaving the room, or the app going to the background).
    func flush() {
        flushTask?.cancel()
        flushTask = nil
        for scope in Array(dirtyScopes) { write(scope) }
    }

    /// Drops an account's drafts when it signs out or another account takes over.
    func clear(account: String?) {
        guard let account, !account.isEmpty else { return }
        let scope = AccountScope.folderName(account)
        flushTask?.cancel()
        flushTask = nil
        dirtyScopes.remove(scope)
        draftsByScope[scope] = nil
        if let folder = folder(for: scope) { try? FileManager.default.removeItem(at: folder) }
        clearLegacyDefaults()
    }

    /// Drafts from before this store were readable by the next account, and nothing says which
    /// account a leftover key belonged to, so none is kept when an account leaves.
    private func clearLegacyDefaults() {
        let defaults = UserDefaults.standard
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix("draft.") {
            defaults.removeObject(forKey: key)
        }
    }

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task { [weak self] in
            try? await Task.sleep(for: Self.writeDelay)
            guard !Task.isCancelled else { return }
            self?.flush()
        }
    }

    private func drafts(for scope: String) -> [String: String] {
        if let cached = draftsByScope[scope] { return cached }
        var stored: [String: String] = [:]
        if let file = folder(for: scope)?.appendingPathComponent("drafts.json"),
           let data = try? Data(contentsOf: file) {
            stored = (try? JSONDecoder().decode([String: String].self, from: data)) ?? [:]
        }
        draftsByScope[scope] = stored
        return stored
    }

    @discardableResult
    private func write(_ scope: String) -> Bool {
        guard let folder = folder(for: scope) else { return false }
        do {
            try FileManager.default.createDirectory(
                at: folder, withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.complete])
            Self.protect(folder)
            Self.protect(folder.deletingLastPathComponent())
            let data = try JSONEncoder().encode(draftsByScope[scope] ?? [:])
            let file = folder.appendingPathComponent("drafts.json")
            try data.write(to: file, options: [.atomic, .completeFileProtection])
            Self.excludeFromBackup(file)
            dirtyScopes.remove(scope)
            return true
        } catch {
            // Left marked dirty; the next keystroke or `flush()` tries again
            return false
        }
    }

    private func folder(for scope: String) -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("drafts", isDirectory: true)
            .appendingPathComponent(scope, isDirectory: true)
    }

    private static func protect(_ url: URL) {
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        excludeFromBackup(url)
    }

    /// Drafts are private data, not something to put in an iCloud backup.
    private static func excludeFromBackup(_ url: URL) {
        var target = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? target.setResourceValues(values)
    }
}
