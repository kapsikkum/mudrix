import Foundation

/// Reporting a room and answering people who knock, as on Android (`ui/people/RoomGeneral.kt` and `ui/people/MembersUi.kt`).
enum RoomModeration {
    /// The reason sent with a report: what was typed without the spaces around it, empty when nothing was.
    static func reportReason(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Pending knocks are worth asking the server for when the person could answer at least one.
    static func showsKnocks(canInvite: Bool, canKick: Bool) -> Bool {
        canInvite || canKick
    }

    /// Accepting a knock needs the invite permission, rejecting it the kick one.
    static func answersKnock(accept: Bool, canInvite: Bool, canKick: Bool) -> Bool {
        accept ? canInvite : canKick
    }
}
