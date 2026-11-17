import Foundation

/// Decides when to tell someone they are alone in a direct call: after the other person left (or never picked up),
/// wait a moment, then count down and hang up unless they stay. The same rules as the web app's AloneNotice.
final class AloneTracker {
    enum Phase: Equatable {
        case idle
        case waiting(until: Int64)
        case counting(endsAt: Int64)
    }

    static let graceMs: Int64 = 10_000
    static let countdownMs: Int64 = 60_000

    private(set) var phase: Phase = .idle
    private let graceMs: Int64
    private let countdownMs: Int64
    private var hadOthers = false
    private var dismissed = false

    init(graceMs: Int64 = AloneTracker.graceMs, countdownMs: Int64 = AloneTracker.countdownMs) {
        self.graceMs = graceMs
        self.countdownMs = countdownMs
    }

    var isCounting: Bool {
        if case .counting = phase { return true }
        return false
    }

    /// Feeds what the call looks like now; call it whenever it changes
    func update(isDirect: Bool, joined: Bool, others: Int, ring: CallManager.RingState?, now: Int64) {
        guard isDirect, joined else {
            phase = .idle
            hadOthers = false
            dismissed = false
            return
        }
        if others > 0 {
            hadOthers = true
            dismissed = false
            phase = .idle
            return
        }
        if ring == .ringing {
            phase = .idle
            return
        }
        let unanswered = ring == .unanswered || ring == .declined
        if phase == .idle, !dismissed, unanswered || hadOthers {
            phase = .waiting(until: now + graceMs)
        }
    }

    /// Moves on with the clock; true when the countdown ran out and the call should end
    @discardableResult
    func tick(now: Int64) -> Bool {
        switch phase {
        case .waiting(let until) where now >= until:
            phase = .counting(endsAt: now + countdownMs)
        case .counting(let endsAt) where now >= endsAt:
            phase = .idle
            dismissed = true
            return true
        default:
            break
        }
        return false
    }

    /// "Stay": no more notices until someone else joins
    func stay() {
        phase = .idle
        dismissed = true
    }

    func secondsLeft(now: Int64) -> Int {
        guard case .counting(let endsAt) = phase else { return 0 }
        let seconds = (endsAt - now + 999) / 1000
        return Int(min(max(seconds, 0), countdownMs / 1000))
    }
}
