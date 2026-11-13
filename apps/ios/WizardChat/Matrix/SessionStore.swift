import Foundation
import UIKit
import WizardChatCore

enum SessionStore {
    /// Moves the account stores into the app group both processes can open; call before restoring
    static func prepare() { StoreLocation.prepare() }

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

    static func updateProfile(_ userId: String, displayName: String?, avatarUrl: String?) {
        var state = read()
        guard let index = state.accounts.firstIndex(where: { $0.session.userId == userId }),
              state.accounts[index].displayName != displayName || state.accounts[index].avatarUrl != avatarUrl
        else { return }
        state.accounts[index].displayName = displayName
        state.accounts[index].avatarUrl = avatarUrl
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
        if let state = SharedSessionStore.readState() { return state }
        if let data = SharedSessionStore.read(SharedSessionStore.legacyKey),
           let legacy = try? JSONDecoder().decode(StoredSession.self, from: data) {
            let migrated = StoredAccounts(active: legacy.session.userId, accounts: [legacy])
            write(migrated)
            if SharedSessionStore.read(SharedSessionStore.accountsKey) != nil {
                SharedSessionStore.removeItem(SharedSessionStore.legacyKey)
            }
            return migrated
        }
        return StoredAccounts(active: nil, accounts: [])
    }

    private static func write(_ state: StoredAccounts) { SharedSessionStore.write(state) }

    /// A copy of the account's own avatar, saved while it's active: the switcher can't always reach
    /// another account's server, and it's removed with the account's store
    private static func avatarFile(_ userId: String) -> URL? {
        guard let folder = all().first(where: { $0.session.userId == userId })?.storeFolder else { return nil }
        return storePath(for: folder).appendingPathComponent("account-avatar.png")
    }

    static func savedAvatar(_ userId: String) -> UIImage? {
        avatarFile(userId).flatMap { UIImage(contentsOfFile: $0.path) }
    }

    static func saveAvatar(_ image: UIImage?, for userId: String) {
        guard let file = avatarFile(userId) else { return }
        if let data = image?.pngData() {
            try? data.write(to: file, options: .atomic)
        } else {
            try? FileManager.default.removeItem(at: file)
        }
    }

    static func storePath(for folder: String) -> URL { StoreLocation.path(for: folder) }

    static func removeStore(_ folder: String) {
        try? FileManager.default.removeItem(at: storePath(for: folder))
    }
}
