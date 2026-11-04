import Foundation
import Security
import WizardChatCore

struct StoredSession: Codable {
    var session: Session
    var storeFolder: String
    var passphrase: String
    var excludeInsecureDevices: Bool?

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

enum SessionStore {
    private static let service = "org.wizardchat.ios.session"
    private static let account = "core"

    static func load() -> StoredSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }

    static func save(_ stored: StoredSession) {
        guard let data = try? JSONEncoder().encode(stored) else { return }
        clear()
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: data,
        ]
        SecItemAdd(item as CFDictionary, nil)
    }

    static func clear() {
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
