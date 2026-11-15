import Foundation
import MudrixCore

/// Joining people to every room of a space that has "Join new members to every room" on (Modern spaces have it
/// on unless set otherwise): the rules of the web's `useAutoJoinSpaceRooms.ts`. Private rooms stay invite only,
/// and a room someone leaves is not joined again.
enum AutoJoin {
    /// Rooms tried in one pass over a space, and at the same time: a big space should not hammer the server
    static let maxPerPass = 300
    static let parallel = 3
    static let maxRemembered = 5000
    /// A room the server keeps refusing is given up on after this many passes
    static let maxRefusals = 3
    /// Rooms are looked at again this often, for rooms added to a space while the app is open
    static let revisitSeconds: TimeInterval = 5 * 60
    /// The server may not count us as a member for a moment after we joined the space
    static let settleSeconds: TimeInterval = 4

    /// Refusals about the room itself, which trying again will not change
    static let permanent: Set<String> = [
        "M_FORBIDDEN", "M_NOT_FOUND", "M_UNSUPPORTED_ROOM_VERSION", "M_INCOMPATIBLE_ROOM_VERSION", "M_BAD_JSON",
        "M_INVALID_PARAM", "M_UNRECOGNIZED", "M_BAD_STATE", "M_GUEST_ACCESS_FORBIDDEN",
    ]

    enum Outcome: Equatable { case done, refused, later }

    /// Private (invite only) rooms are left alone. The server leaves the join rule out for some rooms, so a
    /// missing one is tried: the join itself says no if it is not allowed.
    static func joinable(rule: String?) -> Bool {
        switch rule {
        case "invite", "private", "knock": return false
        default: return true
        }
    }

    static func outcome(of error: Error) -> Outcome {
        guard let errcode = (error as? WizardError)?.errcode else { return .later }
        if errcode == "M_LIMIT_EXCEEDED" { return .later }
        return permanent.contains(errcode) ? .refused : .later
    }

    /// What to try in one space: rooms (not sub-spaces) not joined, invited to or knocked on, joinable, and not
    /// tried before
    static func candidates(_ children: [SpaceChild], done: Set<String>) -> [SpaceChild] {
        children.filter { child in
            !child.isSpace && !child.joined && !child.invited && !child.knocked
                && joinable(rule: child.joinRule) && !done.contains(child.id)
        }
    }

    /// Whether a space joins people to its rooms: its own setting, or Modern for a space that has none
    static func enabled(explicit: Bool?, rootStyle: RoomListStyle) -> Bool {
        explicit ?? (rootStyle == .modern)
    }

    /// The remembered rooms, oldest dropped past the cap
    static func trimmed(_ done: [String]) -> [String] {
        done.count > maxRemembered ? Array(done.suffix(maxRemembered)) : done
    }

    /// Seconds to wait before pass `index` after a rate limit or an outage: 30 s, 1 min, 2 min ... up to 15 min
    static func laterDelay(pass index: Int) -> TimeInterval {
        min(30 * pow(2, Double(index)), 15 * 60)
    }
}

/// Runs the auto-join over the account's spaces: once the room list is loaded, then every few minutes
@MainActor
final class AutoJoinRunner {
    static let shared = AutoJoinRunner()

    private func key(_ userId: String) -> String { "autoJoinDone|\(userId)" }

    private func loadDone(_ userId: String) -> [String] {
        UserDefaults.standard.stringArray(forKey: key(userId)) ?? []
    }

    private func saveDone(_ done: [String], _ userId: String) {
        UserDefaults.standard.set(AutoJoin.trimmed(done), forKey: key(userId))
    }

    /// Loops until the task is cancelled
    func loop(roomList: RoomListModel, client: MudrixClient, userId: String) async {
        var done = loadDone(userId)
        var refusals: [String: Int] = [:]
        while !Task.isCancelled {
            let states = MudrixRoomStates.shared
            let spaces = roomList.spaces.map(\.id)
            states.ensureAll(spaces)
            try? await Task.sleep(for: .seconds(AutoJoin.settleSeconds))
            let graph = roomList.graph
            var again = false
            for spaceId in spaces where !Task.isCancelled {
                let root = SpaceModern.rootSpace(of: spaceId, in: graph)
                let style = SpaceModern.style(of: states.state(root))
                let explicit = SpaceModern.explicitAutoJoin(of: states.state(spaceId))
                guard AutoJoin.enabled(explicit: explicit, rootStyle: style) else { continue }
                if await pass(spaceId, client: client, done: &done, refusals: &refusals) { again = true }
            }
            saveDone(done, userId)
            try? await Task.sleep(for: .seconds(again ? AutoJoin.laterDelay(pass: 0) : AutoJoin.revisitSeconds))
        }
    }

    /// One pass over a space; true when something should be tried again later
    private func pass(_ spaceId: String, client: MudrixClient, done: inout [String],
                      refusals: inout [String: Int]) async -> Bool {
        let children = (try? await client.spaceChildren(spaceId: spaceId)) ?? []
        let todo = Array(AutoJoin.candidates(children, done: Set(done)).prefix(AutoJoin.maxPerPass))
        var again = false
        var index = 0
        while index < todo.count, !Task.isCancelled {
            let batch = Array(todo[index..<min(index + AutoJoin.parallel, todo.count)])
            index += batch.count
            let results = await withTaskGroup(of: (String, AutoJoin.Outcome).self) { group -> [(String, AutoJoin.Outcome)] in
                for child in batch {
                    group.addTask {
                        do {
                            _ = try await client.join(idOrAlias: child.id, via: child.via.isEmpty ? nil : child.via)
                            return (child.id, .done)
                        } catch {
                            return (child.id, AutoJoin.outcome(of: error))
                        }
                    }
                }
                var out: [(String, AutoJoin.Outcome)] = []
                for await result in group { out.append(result) }
                return out
            }
            for (id, outcome) in results {
                switch outcome {
                case .done:
                    done.append(id)
                case .refused:
                    refusals[id, default: 0] += 1
                    if refusals[id, default: 0] >= AutoJoin.maxRefusals { done.append(id) } else { again = true }
                case .later:
                    again = true
                }
            }
        }
        return again
    }
}
