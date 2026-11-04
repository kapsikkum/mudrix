import Foundation
import WizardChatCore

/// Recently used emoji, kept in the `m.recent_emoji` account data like the web, so they're the
/// same on every device. They also fill the quick reactions, like the keyboard's Frequently Used.
@MainActor
final class RecentEmoji: ObservableObject {
    /// Element X writes entries with only `emoji` and a use count; the web adds a label and the
    /// image of custom emoji. Either is read, and both fields are written.
    struct Entry: Codable, Equatable {
        var emoji: String
        var label: String?
        var url: String?
        var total: Int?
    }

    @Published private(set) var entries: [Entry] = []

    private static let eventType = "m.recent_emoji"
    private static let limit = 30
    private static let quickCount = 6
    private static let defaultReactions = ["👍", "❤️", "😂", "😮", "😢", "🎉"]

    private var client: WizardClient?
    private var subscription: Subscription?
    private var saveTask: Task<Void, Never>?
    /// Set while a pick is waiting to be written, so an older copy from the server doesn't undo it
    private var unsaved = false

    var quickReactions: [String] {
        var seen = Set<String>()
        let recent = entries.filter { $0.url == nil }.map(\.emoji)
        return (recent + Self.defaultReactions).filter { seen.insert($0).inserted }.prefix(Self.quickCount).map { $0 }
    }

    func start(client: WizardClient) {
        self.client = client
        subscription = client.watchAccountData(eventType: Self.eventType) { [weak self] content in
            MainActor.assumeIsolated { self?.apply(content) }
        }
        Task { apply(try? await client.accountData(eventType: Self.eventType)) }
    }

    func stop() {
        subscription?.cancel()
        subscription = nil
        saveTask?.cancel()
        unsaved = false
        client = nil
        entries = []
    }

    func use(_ emoji: String, label: String, url: String? = nil) {
        let total = (entries.first { $0.emoji == emoji }?.total ?? 0) + 1
        var next = entries.filter { $0.emoji != emoji }
        next.insert(Entry(emoji: emoji, label: label, url: url, total: total), at: 0)
        entries = Array(next.prefix(Self.limit))
        unsaved = true
        // Several picks in a row become one account data write
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard let self, !Task.isCancelled, let client = self.client,
                  let data = try? JSONEncoder().encode(["recent_emoji": self.entries]),
                  let content = try? JSONDecoder().decode(JSONValue.self, from: data) else { return }
            try? await client.setAccountData(eventType: Self.eventType, content: content)
            self.unsaved = false
        }
    }

    private func apply(_ content: JSONValue?) {
        guard !unsaved, case .array(let list)? = content?["recent_emoji"] else { return }
        entries = list.compactMap { item in
            guard let data = try? JSONEncoder().encode(item) else { return nil }
            return try? JSONDecoder().decode(Entry.self, from: data)
        }
    }
}
