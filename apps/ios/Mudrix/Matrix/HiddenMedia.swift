import Combine
import Foundation

/// Messages whose media the user hid with "Hide media": event id -> hidden. The web keeps the same map
/// in its account storage (`hiddenMediaAtom`); this app keeps it on the device, like the other
/// per-message lists (`ThreadLastSeen`), because the core's settings event has no room for it.
@MainActor
final class HiddenMedia: ObservableObject {
    static let shared = HiddenMedia()

    private static let key = "hiddenMedia"

    /// The event ids whose media is hidden
    @Published private(set) var ids: Set<String>

    private init() {
        let stored = UserDefaults.standard.dictionary(forKey: Self.key) as? [String: Bool] ?? [:]
        ids = Self.parse(stored)
    }

    /// Whether every one of `eventIds` is hidden; the web's rule for a whole gallery
    func isHidden(all eventIds: [String]) -> Bool {
        !eventIds.isEmpty && eventIds.allSatisfy { ids.contains($0) }
    }

    /// Whether this one message's media is hidden
    func isHidden(_ eventId: String?) -> Bool {
        guard let eventId else { return false }
        return ids.contains(eventId)
    }

    /// Hides the media of these messages
    func hide(_ eventIds: [String]) {
        apply(Self.hiding(ids, eventIds: eventIds))
    }

    /// Shows them again: a hidden picture that was tapped stays shown, as on the web
    func reveal(_ eventIds: [String]) {
        apply(Self.revealing(ids, eventIds: eventIds))
    }

    private func apply(_ next: Set<String>) {
        guard next != ids else { return }
        ids = next
        UserDefaults.standard.set(Self.stored(next), forKey: Self.key)
    }

    // MARK: Storage, without the class

    nonisolated static func parse(_ stored: [String: Bool]) -> Set<String> {
        Set(stored.filter { $0.value }.keys)
    }

    nonisolated static func stored(_ ids: Set<String>) -> [String: Bool] {
        Dictionary(ids.map { ($0, true) }, uniquingKeysWith: { first, _ in first })
    }

    nonisolated static func hiding(_ current: Set<String>, eventIds: [String]) -> Set<String> {
        current.union(eventIds)
    }

    nonisolated static func revealing(_ current: Set<String>, eventIds: [String]) -> Set<String> {
        current.subtracting(eventIds)
    }
}
