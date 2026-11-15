import Foundation

/// The words on an activity card, the web's `profile/ActivityCards.tsx`: what a person is playing or listening to.
/// Kept as keys and arguments so the same card can be drawn on a profile and in Settings > Activity.
enum ProfileActivityText {
    struct Lines: Equatable {
        /// `profile.activity.cardPlaying` or `cardListening`
        let cardKey: String
        /// `profile.activity.playing`, `listening` or `listeningBy`
        let titleKey: String
        let titleArgs: [String]
        /// `profile.activity.justStarted` or `forDuration`; nil when the activity does not say
        let sinceKey: String?
        let sinceArgs: [String]
    }

    /// The lines for one activity, with how long a game has been on measured against `now`
    static func lines(for activity: ProfileActivity, now: Date = Date()) -> Lines {
        let card = activity.type == "playing" ? "profile.activity.cardPlaying" : "profile.activity.cardListening"
        let title: (key: String, args: [String])
        if activity.type == "playing" {
            title = ("profile.activity.playing", [activity.name])
        } else if !activity.details.isEmpty {
            title = ("profile.activity.listeningBy", [activity.name, activity.details])
        } else {
            title = ("profile.activity.listening", [activity.name])
        }
        let since = since(for: activity, now: now)
        return Lines(cardKey: card, titleKey: title.key, titleArgs: title.args,
                     sinceKey: since?.key, sinceArgs: since?.args ?? [])
    }

    /// How long a game has been on ("just started", "for 25 min"); nil for music, or when the start is unknown
    static func since(for activity: ProfileActivity, now: Date = Date()) -> (key: String, args: [String])? {
        guard activity.type == "playing", activity.startedAt > 0 else { return nil }
        let elapsed = Int64(now.timeIntervalSince1970 * 1000) - activity.startedAt
        let minutes = max(0, elapsed / 60_000)
        if minutes < 1 { return ("profile.activity.justStarted", []) }
        let duration = minutes >= 60 ? "\(minutes / 60) h \(minutes % 60) min" : "\(minutes) min"
        return ("profile.activity.forDuration", [duration])
    }

    /// A key with its arguments filled in (the same rendering as `L10n.format`, for a list of them)
    static func text(_ key: String, _ args: [String] = []) -> String {
        L10n.args(key, args)
    }
}
