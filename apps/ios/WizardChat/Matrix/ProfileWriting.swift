import Foundation
import WizardChatCore

extension MatrixSession {
    /// Writes or deletes one logical profile field under all of its key names (stable and unstable), so a
    /// client that only knows one of them sees it. Succeeds when at least one write lands; deleting a key
    /// that was never set may fail, which is not an error.
    func writeProfileField(_ keys: [String], _ value: JSONValue?) async throws {
        let client = try requireClient
        var failures: [Error] = []
        for key in keys {
            do {
                if let value {
                    try await client.setProfileField(field: key, value: value)
                } else {
                    try await client.deleteProfileField(field: key)
                }
            } catch {
                failures.append(error)
            }
        }
        if value != nil, failures.count == keys.count, let first = failures.first { throw first }
    }

    /// Marks the account as one that uses Mudrix (the `is_user` profile field other clients show as a badge);
    /// done once per account and device, and only on servers with extended profiles.
    func ensureMudrixUserFlag() async {
        guard let client, let userId = client.userId else { return }
        let done = "profile.userFlagSet.\(userId)"
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: done) { return }
        let current = (try? await client.profileField(userId: userId, field: ProfileFields.isUserKeys[0])) ?? nil
        if current?.bool != true {
            guard (try? await client.supportsExtendedProfiles()) == true else { return }
            do { try await writeProfileField(ProfileFields.isUserKeys, .bool(true)) } catch { return }
        }
        defaults.set(true, forKey: done)
    }
}
