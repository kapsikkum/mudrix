import Foundation
import Security
import WizardChatCore

/// An account as the keychain keeps it: the session, where its store is and how to unlock it.
struct StoredSession: Codable {
    var session: Session
    var storeFolder: String
    var passphrase: String
    var excludeInsecureDevices: Bool?
    var displayName: String?
    var avatarUrl: String?

    var store: StoreConfig {
        StoreConfig(location: StoreLocation.path(for: storeFolder).path, passphrase: passphrase,
                    excludeInsecureDevices: excludeInsecureDevices, manualEncryptionSetup: true)
    }

    static func newStore() -> (folder: String, config: StoreConfig) {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let folder = UUID().uuidString
        let path = StoreLocation.root.appendingPathComponent(folder, isDirectory: true)
        try? FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
        StoreLocation.protect(path)
        return (folder, StoreConfig(location: path.path, passphrase: Data(bytes).base64EncodedString(),
                                    manualEncryptionSetup: true))
    }
}

struct StoredAccounts: Codable {
    var active: String?
    var accounts: [StoredSession]
}

/// Where account stores live: the app group once the old copy has moved, so the app and the
/// notification service extension open the same store.
enum StoreLocation {
    private static let folder = "accounts"

    private static var groupRoot: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ShareInbox.group)?
            .appendingPathComponent(folder, isDirectory: true)
    }

    static var legacyRoot: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(folder, isDirectory: true)
    }

    /// Where a new account's store goes
    static var root: URL { groupRoot ?? legacyRoot }

    enum Plan: Equatable {
        case useOld
        case useNew
        case moveToNew
    }

    /// Which copy a folder's store lives in, and whether it still has to be moved; the single
    /// source of truth for both the migration and every later path lookup.
    static func plan(groupAvailable: Bool, oldExists: Bool, newExists: Bool) -> Plan {
        guard groupAvailable else { return .useOld }
        return oldExists && !newExists ? .moveToNew : .useNew
    }

    static func path(for folder: String) -> URL {
        let old = legacyRoot.appendingPathComponent(folder, isDirectory: true)
        guard let newRoot = groupRoot else { return old }
        let new = newRoot.appendingPathComponent(folder, isDirectory: true)
        let exists = { (path: String) in FileManager.default.fileExists(atPath: path) }
        let choice = plan(groupAvailable: true, oldExists: exists(old.path), newExists: exists(new.path))
        return choice == .useNew ? new : old
    }

    /// Moves every account folder into the app group once: same volume, so the move is atomic; a
    /// folder whose move fails stays where it is and is used from there, and nothing is deleted.
    static func prepare() {
        guard let newRoot = groupRoot else { return }
        try? FileManager.default.createDirectory(at: newRoot, withIntermediateDirectories: true)
        protect(newRoot)
        guard let folders = try? FileManager.default.contentsOfDirectory(
            at: legacyRoot, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
        else { return }
        for old in folders {
            guard (try? old.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true else { continue }
            let new = newRoot.appendingPathComponent(old.lastPathComponent, isDirectory: true)
            guard plan(groupAvailable: true, oldExists: true,
                       newExists: FileManager.default.fileExists(atPath: new.path)) == .moveToNew
            else { continue }
            do {
                try FileManager.default.moveItem(at: old, to: new)
                protect(new)
            } catch {
                // Left in place: `path(for:)` keeps using it, so the account stays signed in
            }
        }
    }

    /// Readable after the first unlock (a push wakes the extension on a locked phone), and not
    /// something to put in an iCloud backup
    static func protect(_ url: URL) {
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        var target = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? target.setResourceValues(values)
    }
}

/// The signed-in accounts in the keychain, in an access group the app and the notification service
/// extension share.
enum SharedSessionStore {
    static let service = "chat.mudrix.mobile.session"
    static let accountsKey = "accounts"
    static let legacyKey = "core"
    static let accessGroupKey = "WZKeychainAccessGroup"

    /// The group both targets are entitled to; nil on an unsigned build, which keeps the old behaviour
    static var accessGroup: String? {
        validAccessGroup(Bundle.main.object(forInfoDictionaryKey: accessGroupKey) as? String)
    }

    /// A shared group is `<team prefix>.<bundle id>`: a team-less or unexpanded value would make
    /// every keychain call fail, so it counts as no group at all.
    static func validAccessGroup(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let prefix = String(value.prefix { $0 != "." })
        let teamCharacters = CharacterSet.uppercaseLetters.union(.decimalDigits)
        guard prefix.count == 10, prefix.unicodeScalars.allSatisfy({ teamCharacters.contains($0) }),
              value.count > prefix.count + 1
        else { return nil }
        return value
    }

    static func readState() -> StoredAccounts? {
        guard let data = read(accountsKey) else { return nil }
        return try? JSONDecoder().decode(StoredAccounts.self, from: data)
    }

    static func accounts() -> [StoredSession] { readState()?.accounts ?? [] }

    static func account(userId: String) -> StoredSession? {
        accounts().first { $0.session.userId == userId }
    }

    static func write(_ state: StoredAccounts) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        save(data, account: accountsKey)
    }

    /// Reads an item, moving it into the shared group the first time: the new item is read back
    /// before the old one is removed, so a failed migration never loses the session.
    static func read(_ account: String) -> Data? {
        guard let group = accessGroup else { return copy(account, group: nil) }
        if let data = copy(account, group: group) { return data }
        guard let data = copy(account, group: nil) else { return nil }
        if add(data, account: account, group: group), copy(account, group: group) == data,
           let legacy = legacyGroup {
            SecItemDelete(baseQuery(account, group: legacy) as CFDictionary)
        }
        return data
    }

    static func removeItem(_ account: String) {
        guard let group = accessGroup else {
            SecItemDelete(baseQuery(account, group: nil) as CFDictionary)
            return
        }
        SecItemDelete(baseQuery(account, group: group) as CFDictionary)
        if let legacy = legacyGroup { SecItemDelete(baseQuery(account, group: legacy) as CFDictionary) }
    }

    /// Where items saved without an access group live (`<team>.<bundle id>`); nil when that is the
    /// shared group itself, so there is nothing to move.
    private static var legacyGroup: String? {
        guard let group = accessGroup, let bundleId = Bundle.main.bundleIdentifier else { return nil }
        let legacy = "\(group.prefix { $0 != "." }).\(bundleId)"
        return legacy == group ? nil : legacy
    }

    private static func save(_ data: Data, account: String) {
        if let group = accessGroup {
            if update(data, account: account, group: group) != errSecItemNotFound { return }
            if add(data, account: account, group: group) { return }
            // A group string the binary isn't entitled to: keep the item where the app can read it
        }
        if update(data, account: account, group: nil) == errSecItemNotFound {
            add(data, account: account, group: nil)
        }
    }

    private static func copy(_ account: String, group: String?) -> Data? {
        var query = baseQuery(account, group: group)
        query[kSecReturnData as String] = true
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    @discardableResult
    private static func update(_ data: Data, account: String, group: String?) -> OSStatus {
        SecItemUpdate(baseQuery(account, group: group) as CFDictionary,
                      [kSecValueData as String: data] as CFDictionary)
    }

    @discardableResult
    private static func add(_ data: Data, account: String, group: String?) -> Bool {
        var item = baseQuery(account, group: group)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        item[kSecValueData as String] = data
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    private static func baseQuery(_ account: String, group: String?) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group { query[kSecAttrAccessGroup as String] = group }
        return query
    }
}
