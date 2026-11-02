import Foundation
import WizardChatCore

@MainActor
final class MemberDirectory {
    static let shared = MemberDirectory()

    struct Profile {
        let name: String?
        let avatarUrl: String?
    }

    private var rooms: [String: Task<[String: Member], Never>] = [:]
    private var users: [String: Task<Profile, Never>] = [:]

    func profile(_ userId: String, in roomId: String?, client: WizardClient) async -> Profile {
        if let roomId {
            let task = rooms[roomId] ?? Task {
                let members = (try? await client.members(roomId: roomId)) ?? []
                return Dictionary(members.map { ($0.userId, $0) }, uniquingKeysWith: { a, _ in a })
            }
            rooms[roomId] = task
            if let member = await task.value[userId] {
                return Profile(name: member.displayName, avatarUrl: member.avatarUrl)
            }
        }
        let task = users[userId] ?? Task {
            let profile = try? await client.userProfile(userId: userId)
            return Profile(name: profile?.displayName, avatarUrl: profile?.avatarUrl)
        }
        users[userId] = task
        return await task.value
    }

    func forget(roomId: String) {
        rooms[roomId] = nil
    }

    func reset() {
        rooms = [:]
        users = [:]
    }
}

extension MatrixSession {
    func memberProfile(_ userId: String, in roomId: String?) async -> MemberDirectory.Profile {
        guard let client else { return .init(name: nil, avatarUrl: nil) }
        return await MemberDirectory.shared.profile(userId, in: roomId, client: client)
    }
}
