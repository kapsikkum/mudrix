import Foundation
import WizardChatCore

@MainActor
final class ExploreModel: ObservableObject {
    @Published private(set) var rooms: [PublicRoom] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isAtEnd = false
    @Published private(set) var error: String?

    private let client: WizardClient
    private var server: String?
    private var filter = ""
    private var next: String?
    private var searchTask: Task<Void, Never>?

    init(client: WizardClient) {
        self.client = client
    }

    func load(server: String?, filter: String?) {
        self.server = server
        self.filter = filter?.trimmingCharacters(in: .whitespaces) ?? ""
        next = nil
        rooms = []
        isAtEnd = false
        fetch()
    }

    func loadNextPage() {
        guard !isLoading, !isAtEnd else { return }
        fetch()
    }

    private func fetch() {
        searchTask?.cancel()
        isLoading = true
        error = nil
        searchTask = Task {
            defer { isLoading = false }
            do {
                let page = try await client.publicRoomsPage(query: filter, server: server, kind: nil, limit: 30, since: next)
                guard !Task.isCancelled else { return }
                rooms += page.rooms.filter { room in !rooms.contains { $0.id == room.id } }
                next = page.next
                isAtEnd = page.next == nil
            } catch {
                if !Task.isCancelled { self.error = error.localizedDescription }
            }
        }
    }
}
