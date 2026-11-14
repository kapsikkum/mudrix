import Foundation

/// What moving a room to a newer version carries over, as on Android (`ui/people/RoomGeneral.kt`).
enum RoomUpgrade {
    /// A private room has to bring its people over; in a public one they find the new room themselves.
    static func invitesMembers(joinRule: String) -> Bool {
        joinRule != "public"
    }
}
