import Foundation
import Security
import WizardChatCore

extension MatrixSession {
    var isOAuthAccount: Bool { client?.session.oauthClientId != nil }
    var deviceId: String? { client?.session.deviceId }

    func accountManagementUrl() async -> URL? {
        guard let string = try? await client?.accountManagementUrl() else { return nil }
        return URL(string: string)
    }

    func setDisplayName(_ name: String) async throws {
        try await requireClient.setDisplayName(name: name)
        displayName = name
    }

    func setAvatar(_ data: Data, mimeType: String) async throws {
        avatarUrl = try await requireClient.setAvatar(bytes: data, mimetype: mimeType)
    }

    func removeAvatar() async throws {
        try await requireClient.removeAvatar()
        avatarUrl = nil
    }

    /// Runs an account operation protected by user-interactive auth: first without, then with the
    /// password the screen already asked for, if the server wants confirmation.
    private func withPassword(_ password: String?, _ run: (UiaAuth?) async throws -> UiaOutcome) async throws {
        guard case .authRequired(let challenge) = try await run(nil) else { return }
        guard let password, !password.isEmpty else {
            throw WizardError(code: "passwordRequired", message: String(localized: "settings.account.authMethodUnsupported"))
        }
        if case .authRequired = try await run(.password(UiaAuth.Password(password: password, session: challenge.session))) {
            throw WizardError(code: "invalidCredentials", message: String(localized: "auth.errors.credentials"))
        }
    }

    func changePassword(current: String, new: String) async throws {
        let client = try requireClient
        try await withPassword(current) { try await client.changePasswordWithAuth(newPassword: new, auth: $0) }
    }

    func emailAddresses() async throws -> [String] {
        try await requireClient.emailAddresses().filter { $0.medium == "email" }.map(\.address)
    }

    func requestEmailToken(_ email: String) async throws -> (sid: String, secret: String) {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let secret = bytes.map { String(format: "%02x", $0) }.joined()
        let sid = try await requireClient.requestEmailToken(email: email, secret: secret, attempt: 1)
        return (sid, secret)
    }

    func addEmail(sid: String, secret: String, password: String?) async throws {
        let client = try requireClient
        try await withPassword(password) { try await client.addEmailWithAuth(secret: secret, sid: sid, auth: $0) }
    }

    func removeEmail(_ email: String) async throws {
        try await requireClient.removeEmail(address: email)
    }

    func deactivateAccount(password: String, eraseData: Bool) async throws {
        let client = try requireClient
        try await withPassword(password) { try await client.deactivateAccountWithAuth(erase: eraseData, auth: $0) }
        await logout()
    }

    func deleteDevices(_ deviceIds: [String], password: String?) async throws {
        let client = try requireClient
        try await withPassword(password) { try await client.deleteDevicesWithAuth(deviceIds: deviceIds, auth: $0) }
    }

    func uploadMedia(_ data: Data, mimeType: String) async throws -> String {
        try await requireClient.uploadMedia(data: data, mimetype: mimeType)
    }

    func recover(with recoveryKey: String) async throws {
        try await requireClient.recover(recoveryKey: recoveryKey.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func hasEncryptionIdentity() async -> Bool? {
        guard let client, let userId else { return nil }
        return try? await client.userTrust(userId: userId).hasIdentity
    }

    /// A new encryption identity; OAuth accounts approve it on their account page (`approve`),
    /// others confirm with their password
    func resetIdentity(password: String?, approve: @escaping @Sendable (URL) -> Void) async throws {
        let client = try requireClient
        try await withPassword(password) { auth in
            try await client.resetIdentityWithAuth(auth: auth) { url in
                if let url = URL(string: url) { approve(url) }
            }
        }
    }

    func cancelIdentityReset() async {
        try? await client?.cancelIdentityReset()
    }

    func enableRecovery() async throws -> String {
        try await requireClient.enableRecovery()
    }

    func resetRecoveryKey() async throws -> String {
        try await requireClient.resetRecoveryKey()
    }

    func createSpace(name: String, topic: String?, isPublic: Bool) async throws -> String {
        try await requireClient.createRoom(options: CreateRoomOptions(name: name, topic: topic, isPublic: isPublic, isSpace: true))
    }

    func createRoom(name: String, topic: String?, isPublic: Bool, encrypted: Bool, isVoice: Bool,
                    alias: String?, spaceId: String?) async throws -> String {
        try await requireClient.createRoom(options: CreateRoomOptions(
            name: name, topic: topic, isPublic: isPublic, alias: isPublic ? alias : nil,
            isVoice: isVoice, parentSpaceId: spaceId, encrypted: encrypted && !isPublic
        ))
    }

    func startDirectMessage(with userId: String) async throws -> String {
        try await requireClient.startDm(userId: userId)
    }

    func join(_ idOrAliasOrLink: String, via servers: [String] = []) async throws -> String {
        var target = idOrAliasOrLink.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = target.range(of: "matrix.to/#/") {
            target = String(target[range.upperBound...])
        }
        var via = servers
        if let query = target.firstIndex(of: "?") {
            let params = URLComponents(string: "x:/" + target[query...])?.queryItems ?? []
            via += params.filter { $0.name == "via" }.compactMap(\.value)
            target = String(target[..<query])
        }
        target = target.removingPercentEncoding ?? target
        return try await requireClient.join(idOrAlias: target, via: via)
    }

    func addChild(_ roomId: String, to spaceId: String) async throws {
        try await requireClient.addToSpace(spaceId: spaceId, childId: roomId, suggested: false)
    }

    func searchUsers(_ term: String) async -> [UserResult] {
        guard let client, !term.isEmpty else { return [] }
        return (try? await client.searchUsers(query: term, limit: 20)) ?? []
    }

    func profile(of userId: String) async -> UserProfile? {
        try? await client?.userProfile(userId: userId)
    }

    func ignore(_ userId: String) async throws {
        try await requireClient.ignoreUser(userId: userId)
    }
}

extension MatrixSession {
    func stateEvents(_ eventType: String, in roomId: String) async -> [(key: String, content: [String: Any])] {
        guard let pairs = try? await client?.stateEventsOfType(roomId: roomId, eventType: eventType) else { return [] }
        return pairs.compactMap { pair in
            guard pair.count == 2, let key = pair[0].string, let content = pair[1].any as? [String: Any] else { return nil }
            return (key, content)
        }
    }

    func setStateEvent(_ eventType: String, key: String, content: [String: Any], in roomId: String) async throws {
        try await requireClient.setStateEvent(roomId: roomId, eventType: eventType, stateKey: key, content: JSONValue(any: content))
    }

    func canSendState(_ eventType: String, in roomId: String) async -> Bool {
        guard let client, let details = try? await client.roomDetails(roomId: roomId) else { return false }
        guard let own = details.ownPowerLevel else { return true }
        let levels = (try? await client.stateEvent(roomId: roomId, eventType: "m.room.power_levels", stateKey: "")) ?? nil
        let needed = levels?["events"]?[eventType]?.number ?? levels?["state_default"]?.number ?? 50
        return Double(own) >= needed
    }
}

extension MatrixSession {
    func accountDataJSON(_ eventType: String) async -> [String: Any]? {
        guard let value = try? await client?.accountData(eventType: eventType) else { return nil }
        return value.any as? [String: Any]
    }

    func setAccountDataJSON(_ eventType: String, _ content: [String: Any]) async throws {
        try await requireClient.setAccountData(eventType: eventType, content: JSONValue(any: content))
    }
}
