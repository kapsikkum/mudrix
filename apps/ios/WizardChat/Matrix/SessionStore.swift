import Foundation
import Security
import WizardChatCore

struct StoredSession: Codable {
    var session: Session
    var storeFolder: String
    var passphrase: String
    var excludeInsecureDevices: Bool?
    var displayName: String?
    var avatarUrl: String?

    var store: StoreConfig {
        StoreConfig(location: SessionStore.storePath(for: storeFolder).path, passphrase: passphrase,
                    excludeInsecureDevices: excludeInsecureDevices)
    }

    static func newStore() -> (folder: String, config: StoreConfig) {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let folder = UUID().uuidString
        let path = SessionStore.storePath(for: folder)
        try? FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
        return (folder, StoreConfig(location: path.path, passphrase: Data(bytes).base64EncodedString()))
    }
}

private struct StoredAccounts: Codable {
    var active: String?
    var accounts: [StoredSession]
}

enum SessionStore {
    private static let service = "org.wizardchat.ios.session"
    private static let accountsKey = "accounts"
    private static let legacyKey = "core"

    static func all() -> [StoredSession] { read().accounts }

    static func active() -> StoredSession? {
        let state = read()
        return state.accounts.first { $0.session.userId == state.active } ?? state.accounts.first
    }

    static func save(_ stored: StoredSession) {
        var state = read()
        if let index = state.accounts.firstIndex(where: { $0.session.userId == stored.session.userId }) {
            state.accounts[index] = stored
        } else {
            state.accounts.append(stored)
        }
        if state.active == nil { state.active = stored.session.userId }
        write(state)
    }

    static func setActive(_ userId: String) {
        var state = read()
        guard state.accounts.contains(where: { $0.session.userId == userId }) else { return }
        state.active = userId
        write(state)
    }

    static func remove(_ userId: String) {
        var state = read()
        for stored in state.accounts where stored.session.userId == userId { removeStore(stored.storeFolder) }
        state.accounts.removeAll { $0.session.userId == userId }
        if state.active == userId { state.active = state.accounts.first?.session.userId }
        write(state)
    }

    private static func read() -> StoredAccounts {
        if let data = item(accountsKey), let state = try? JSONDecoder().decode(StoredAccounts.self, from: data) {
            return state
        }
        if let data = item(legacyKey), let legacy = try? JSONDecoder().decode(StoredSession.self, from: data) {
            let migrated = StoredAccounts(active: legacy.session.userId, accounts: [legacy])
            write(migrated)
            if item(accountsKey) != nil { deleteItem(legacyKey) }
            return migrated
        }
        return StoredAccounts(active: nil, accounts: [])
    }

    private static func write(_ state: StoredAccounts) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: accountsKey,
        ]
        if SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecItemNotFound {
            var item = query
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            item[kSecValueData as String] = data
            SecItemAdd(item as CFDictionary, nil)
        }
    }

    private static func item(_ account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    private static func deleteItem(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func storePath(for folder: String) -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("accounts/\(folder)", isDirectory: true)
    }

    static func removeStore(_ folder: String) {
        try? FileManager.default.removeItem(at: storePath(for: folder))
    }
}
