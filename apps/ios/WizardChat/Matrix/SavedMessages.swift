import Foundation
import WizardChatCore

extension WizardClient {
    /// The content of the first of these account data types that exists, like the web's `readFirstAccountData`
    func firstAccountData(_ types: [String]) async -> JSONValue? {
        for type in types {
            if let content = (try? await accountData(eventType: type)) ?? nil { return content }
        }
        return nil
    }
}

struct SavedMessage: Equatable, Identifiable {
    let roomId: String
    let eventId: String
    /// Milliseconds since 1970
    let savedAt: Int64

    var id: String { eventId }
}

/// A message's sender, first text and time, from the stored event
struct EventPreview: Equatable {
    let sender: String
    let body: String
    let timestamp: Int64
    let redacted: Bool
}

/// Saved messages, kept in the `io.github.kapsikkum.mudrix.saved_messages` account data like the web
/// (`util/savedMessages.ts`): only room and event ids, so the server never sees the text.
@MainActor
final class SavedMessages: ObservableObject {
    static let shared = SavedMessages()

    static let type = Namespace.mudrixKey("saved_messages")
    /// Earlier versions kept the list under other names; they are read until the current one is written
    static let types = [type, Namespace.legacyMudrixKey("saved_messages"), "io.mudrix.saved_messages"]

    @Published private(set) var items: [SavedMessage] = []

    var ids: Set<String> { Set(items.map(\.eventId)) }

    private var subscriptions: [Subscription] = []
    private var contents: [String: JSONValue] = [:]

    func start(client: WizardClient) {
        stop()
        for type in Self.types {
            let subscription = client.watchAccountData(eventType: type) { [weak self] content in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if let content { self.contents[type] = content } else { self.contents.removeValue(forKey: type) }
                    self.items = Self.parse(Self.types.compactMap { self.contents[$0] }.first)
                }
            }
            subscriptions.append(subscription)
        }
    }

    func stop() {
        subscriptions.forEach { $0.cancel() }
        subscriptions = []
        contents = [:]
        items = []
    }

    /// Saves the message, or removes it when it already is saved; true when it is saved now
    func toggle(client: WizardClient, roomId: String, eventId: String) async throws -> Bool {
        let current = Self.parse(await client.firstAccountData(Self.types))
        let (next, saved) = Self.toggled(current, roomId: roomId, eventId: eventId, now: Self.nowMs)
        try await client.setAccountData(eventType: Self.type, content: Self.toContent(next))
        items = next
        return saved
    }

    nonisolated static var nowMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    nonisolated static func parse(_ content: JSONValue?) -> [SavedMessage] {
        guard let list = content?["items"]?.array else { return [] }
        return list.compactMap { item in
            guard let roomId = item["roomId"]?.string, let eventId = item["eventId"]?.string else { return nil }
            return SavedMessage(roomId: roomId, eventId: eventId, savedAt: Int64(item["savedAt"]?.number ?? 0))
        }
    }

    nonisolated static func toContent(_ items: [SavedMessage]) -> JSONValue {
        .object(["items": .array(items.map {
            .object(["roomId": .string($0.roomId), "eventId": .string($0.eventId), "savedAt": .number(Double($0.savedAt))])
        })])
    }

    /// The list after saving or unsaving, newest first, and whether the message is saved in it
    nonisolated static func toggled(_ current: [SavedMessage], roomId: String, eventId: String,
                                    now: Int64) -> ([SavedMessage], Bool) {
        if current.contains(where: { $0.eventId == eventId }) {
            return (current.filter { $0.eventId != eventId }, false)
        }
        return ([SavedMessage(roomId: roomId, eventId: eventId, savedAt: now)] + current, true)
    }

    /// What a stored event looks like to a person: decrypted when the core could
    nonisolated static func preview(_ source: EventSource) -> EventPreview {
        let clear = (source.decrypted ?? source.original).object ?? [:]
        let content = clear["content"]?.object ?? [:]
        let edited = content["m.new_content"]?.object
        let body = (edited ?? content)["body"]?.string ?? ""
        return EventPreview(sender: clear["sender"]?.string ?? "", body: body,
                            timestamp: Int64(clear["origin_server_ts"]?.number ?? 0), redacted: content.isEmpty)
    }

    /// Looks a saved message up from the core (it decrypts); nil when it cannot be fetched
    static func resolve(client: WizardClient, roomId: String, eventId: String) async -> EventPreview? {
        guard let source = try? await client.eventSource(roomId: roomId, eventId: eventId) else { return nil }
        return preview(source)
    }
}
