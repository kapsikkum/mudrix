import Foundation

/// `undecryptable.ts` of the web: which runs of unreadable messages fold into one row, and what to tell the reader
enum UndecryptableRuns {
    /// Runs of at least this many consecutive unreadable messages are folded into one row
    static let threshold = 3

    /// `count` unreadable messages in a row, of which this one is the oldest when `isFirst`
    struct Run: Equatable {
        let count: Int
        let isFirst: Bool
    }

    /// For each position, the run it belongs to; nil where the message is readable
    static func compute(_ unreadable: [Bool]) -> [Run?] {
        var runs = [Run?](repeating: nil, count: unreadable.count)
        var start = -1
        func flush(_ end: Int) {
            guard start >= 0 else { return }
            for index in start..<end { runs[index] = Run(count: end - start, isFirst: index == start) }
            start = -1
        }
        for (index, bad) in unreadable.enumerated() {
            if bad {
                if start < 0 { start = index }
            } else {
                flush(index)
            }
        }
        flush(unreadable.count)
        return runs
    }

    /// The raw values are the suffixes of the `timeline.undecryptable.help.*` keys
    enum HelpKind: String {
        case notJoined, withheld, senderUntrusted, unverified, noBackup, waiting
    }

    /// What to tell someone whose message cannot be read. Some causes nothing here can fix; for the rest the first
    /// thing to look at is whether this session is verified (an unverified one is not given the keys), then whether a
    /// backup exists at all.
    static func helpKind(reason: String?, sessionVerified: Bool) -> HelpKind {
        switch reason {
        case "sentBeforeWeJoined": return .notJoined
        case "withheldBySender": return .withheld
        case "verificationViolation", "unsignedDevice", "unknownDevice": return .senderUntrusted
        default: break
        }
        if !sessionVerified { return .unverified }
        return reason == "historicalMessageAndBackupIsDisabled" ? .noBackup : .waiting
    }
}
