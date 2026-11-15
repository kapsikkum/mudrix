import Combine
import Foundation
import MudrixCore

/// The GIFs starred in the picker, in Matrix account data like the web (`useGifFavourites.ts`):
/// `{ urls: [...] }` under `io.github.kapsikkum.mudrix.gif_favourites`, newest first and at most 50.
///
/// The picker kept them on this device only (`@AppStorage("gifFavourites")`) until now; `migrateLegacy`
/// folds that list into the account's once. The upstream base's event is read until the first save
/// writes the Mudrix one, as the web does.
@MainActor
final class GifFavourites: ObservableObject {
    static let shared = GifFavourites()

    /// The web's `GIF_FAVOURITES_CAP`
    static let cap = 50

    static let type = Namespace.mudrixKey("gif_favourites")
    /// Where the base this app is forked from kept them; never written
    static let upstreamType = Namespace.upstreamKey("gif_favourites")
    static let readTypes = [type, upstreamType]

    /// The device-only list the picker used before this existed
    static let legacyKey = "gifFavourites"

    /// The starred URLs, newest first
    @Published private(set) var urls: [String] = []

    private var contents: [String: JSONValue] = [:]
    /// `Combine` is imported too, so the core's watcher class is named in full
    private var subscriptions: [MudrixCore.Subscription] = []
    private var client: WizardClient?
    private var migrated = false

    /// Follows the account's list; call when a session starts
    func start(client: WizardClient) {
        stop()
        self.client = client
        for type in Self.readTypes {
            let subscription = client.watchAccountData(eventType: type) { [weak self] content in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if let content { self.contents[type] = content } else { self.contents.removeValue(forKey: type) }
                    self.urls = Self.parse(Self.readTypes.compactMap { self.contents[$0] }.first)
                }
            }
            subscriptions.append(subscription)
        }
    }

    func stop() {
        subscriptions.forEach { $0.cancel() }
        subscriptions = []
        contents = [:]
        urls = []
        client = nil
        migrated = false
    }

    func isFavourite(_ url: String) -> Bool { urls.contains(url) }

    /// Stars or unstars a GIF, like the web's `toggleFavourite`: the newest goes first and the oldest falls
    /// off the end. Puts the list back when the account cannot be written.
    func toggle(_ url: String) async {
        guard let client else { return }
        let before = urls
        let next = Self.toggled(before, url: url)
        guard next != before else { return }
        urls = next
        do {
            try await client.setAccountData(eventType: Self.type, content: Self.content(next))
            contents[Self.type] = Self.content(next)
        } catch {
            urls = before
        }
    }

    /// Adds the picker's old device-only list to the account's, once, and leaves a copy on the device for
    /// older builds. Nothing is written when there is nothing to add or the account already has them.
    func migrateLegacy(defaults: UserDefaults = .standard) async {
        guard let client, !migrated else { return }
        migrated = true
        let data = defaults.data(forKey: Self.legacyKey) ?? Data()
        let legacy = Self.legacyUrls(from: data)
        guard !legacy.isEmpty else { return }
        let current = Self.parse(await client.firstAccountData(Self.readTypes))
        let merged = Self.sanitize(current + legacy)
        guard merged != current else { return }
        do {
            try await client.setAccountData(eventType: Self.type, content: Self.content(merged))
        } catch {
            return
        }
        contents[Self.type] = Self.content(merged)
        urls = merged
    }

    // MARK: Values

    /// Whether a URL may be stored: the web keeps `https://` and `mxc://` only
    static func isStorable(_ url: String) -> Bool {
        url.hasPrefix("https://") || url.hasPrefix("mxc://")
    }

    /// The URLs of a list, without duplicates, storables only, newest first and capped
    static func sanitize(_ raw: [String]) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for url in raw where isStorable(url) {
            guard seen.insert(url).inserted else { continue }
            out.append(url)
            if out.count == cap { break }
        }
        return out
    }

    /// The list after starring or unstarring `url`
    static func toggled(_ urls: [String], url: String) -> [String] {
        guard isStorable(url) else { return urls }
        if urls.contains(url) { return urls.filter { $0 != url } }
        return Array(([url] + urls).prefix(cap))
    }

    /// The stored event for a list
    static func content(_ urls: [String]) -> JSONValue {
        .object(["urls": .array(sanitize(urls).map { JSONValue.string($0) })])
    }

    /// The list in a stored event
    static func parse(_ value: JSONValue?) -> [String] {
        guard let fields = value?.object, let list = fields["urls"]?.array else { return [] }
        return sanitize(list.compactMap(\.string))
    }

    /// The URLs of the picker's old list: encoded GIFs, or plain strings
    static func legacyUrls(from data: Data) -> [String] {
        if let gifs = try? JSONDecoder().decode([LegacyGif].self, from: data) {
            return sanitize(gifs.map(\.url))
        }
        if let list = try? JSONDecoder().decode([String].self, from: data) {
            return sanitize(list)
        }
        return []
    }

    /// The part of the picker's old entries this needs
    private struct LegacyGif: Decodable {
        let url: String
    }
}
