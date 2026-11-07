import Foundation
import WizardChatCore

/// Which threads have been looked at: thread root event id -> the time (milliseconds) up to which its replies were
/// seen. Kept on this device only, like the web's `threadLastSeen`; the web also stores the id of the last reply,
/// which the core's `ThreadInfo` does not carry, so only the time is compared.
@MainActor
final class ThreadLastSeen: ObservableObject {
    static let shared = ThreadLastSeen()

    private static let key = "threadLastSeen"

    @Published private var seen: [String: Double]

    private init() {
        seen = UserDefaults.standard.dictionary(forKey: Self.key) as? [String: Double] ?? [:]
    }

    /// Marks the replies of a thread up to `time` (milliseconds) as seen
    func markSeen(_ rootEventId: String, time: Int64 = SavedMessages.nowMs) {
        let value = Double(time)
        if (seen[rootEventId] ?? 0) >= value { return }
        seen[rootEventId] = value
        UserDefaults.standard.set(seen, forKey: Self.key)
    }

    /// True when the latest reply is somebody else's and newer than what was seen
    func isUnread(_ info: ThreadInfo, myUserId: String?) -> Bool {
        Self.isUnread(latestSender: info.latestSender, latestTimestamp: info.latestTimestamp.map { Int64($0) },
                      myUserId: myUserId, seenUpTo: seen[info.rootEventId].map { Int64($0) })
    }

    /// The rule, without storage
    nonisolated static func isUnread(latestSender: String?, latestTimestamp: Int64?, myUserId: String?,
                                     seenUpTo: Int64?) -> Bool {
        guard let latestSender, latestSender != myUserId else { return false }
        return (latestTimestamp ?? 0) > (seenUpTo ?? 0)
    }
}
