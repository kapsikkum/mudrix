import Foundation

/// Stops scrolling back through history this device cannot read: after a couple of pages that are
/// (nearly) all undecryptable, loading pauses until the person asks for more. The web app does the same in
/// `undecryptable.ts`.
struct UnreadableHistory {
    /// Consecutive (nearly) all-unreadable pages that pause scrollback
    static let pagesBeforePause = 2
    /// The share of a page that must be unreadable for it to count
    static let unreadableShare = 0.9

    /// Whether a freshly loaded page is (nearly) all messages this device cannot read
    static func isUnreadablePage(added: Int, unreadable: Int) -> Bool {
        added > 0 && Double(unreadable) >= Double(added) * unreadableShare
    }

    private var streak = 0
    private(set) var paused = false

    /// Records a loaded page; a readable page ends a streak and resumes automatic loading
    mutating func record(added: Int, unreadable: Int) {
        if Self.isUnreadablePage(added: added, unreadable: unreadable) {
            streak += 1
            if streak >= Self.pagesBeforePause { paused = true }
        } else if added > 0 {
            streak = 0
            paused = false
        }
    }

    mutating func reset() {
        streak = 0
        paused = false
    }
}
