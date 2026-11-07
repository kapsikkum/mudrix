import Foundation
import WizardChatCore

/// Looks a matched link card up on the one host its integration was approved for, with the request discipline of the web app's
/// `details.ts` and Android's `LinkDetailsLoader`: a cache (15 minutes, 5 for a failure), one request per URL at a time, a
/// conditional request once an answer is stale, a budget per host and a back-off after a rate limit. The request itself is
/// made by `IntegrationNetwork`, which also refuses passive requests while streamer mode is on.
@MainActor
final class LinkDetailsLoader: ObservableObject {
    enum Result {
        case ok(IntegrationDetails.Details)
        /// `paused`: nothing was asked because passive requests are off right now (streamer mode)
        case error(String, paused: Bool)
        /// Encrypted room: nothing is asked until the person presses the card's button
        case needsAsk
    }

    private struct Entry {
        /// The last good answer, or nil when there is none
        var json: JSONValue?
        var error: String?
        /// The host's entity tag for `json`, used to ask "has it changed?" once it is stale
        var etag: String?
        /// When `json` was received or last confirmed unchanged (a 304)
        var confirmedAt: Date
        /// Nothing is requested for this URL before this time
        var freshUntil: Date
    }

    private struct Answer {
        var json: JSONValue?
        var error: String?
    }

    static let maxDetailsResponseBytes = 64 * 1024
    private static let cacheOk: TimeInterval = 15 * 60
    private static let cacheFail: TimeInterval = 5 * 60
    /// An answer older than this is never shown, even when the host can not be asked again
    private static let maxStale: TimeInterval = 24 * 60 * 60
    private static let maxCache = 200
    /// After a 403 or 429 (rate limited) the host is left alone for a while
    private static let backoff: TimeInterval = 15 * 60
    /// At most this many requests per host in any 10 minutes, whatever is on screen
    private static let hostBudget = 30
    private static let hostWindow: TimeInterval = 10 * 60

    static let shared = LinkDetailsLoader()

    private let network: IntegrationNetwork
    private let now: () -> Date
    private var cache: [String: Entry] = [:]
    private var cacheOrder: [String] = []
    private var inflight: [String: Task<Answer, Never>] = [:]
    private var backoffUntil: [String: Date] = [:]
    private var recent: [String: [Date]] = [:]

    init(network: IntegrationNetwork = .shared, now: @escaping () -> Date = { Date() }) {
        self.network = network
        self.now = now
    }

    private func remember(_ url: String, _ entry: Entry) {
        cacheOrder.removeAll { $0 == url }
        if cacheOrder.count >= Self.maxCache, let oldest = cacheOrder.first {
            cacheOrder.removeFirst()
            cache[oldest] = nil
        }
        cacheOrder.append(url)
        cache[url] = entry
    }

    /// The cached answer if it is not too old to show, else nil
    private func staleJson(_ entry: Entry?) -> JSONValue? {
        guard let entry, let json = entry.json, now().timeIntervalSince(entry.confirmedAt) < Self.maxStale else { return nil }
        return json
    }

    /// Takes one request from the host's budget; returns its timestamp, or nil when spent
    private func takeBudget(_ host: String) -> Date? {
        let time = now()
        var list = (recent[host] ?? []).filter { time.timeIntervalSince($0) < Self.hostWindow }
        if list.count >= Self.hostBudget {
            recent[host] = list
            return nil
        }
        list.append(time)
        recent[host] = list
        return time
    }

    /// Gives a request back (a 304 did not cost the host an answer)
    private func refundBudget(_ host: String, _ at: Date) {
        guard var list = recent[host], let index = list.firstIndex(of: at) else { return }
        list.remove(at: index)
        recent[host] = list
    }

    private func refresh(url: String, host: String, allow: [String], previous: Entry?, budgetAt: Date, passive: Bool) async -> Answer {
        let stale = staleJson(previous)
        let outcome = await network.fetch(IntegrationNetwork.Request(
            url: url, allow: allow, expect: .json, maxBytes: Self.maxDetailsResponseBytes,
            ifNoneMatch: stale != nil ? previous?.etag : nil, passive: passive))
        let time = now()
        switch outcome {
        case .success(let success):
            remember(url, Entry(json: success.json, error: nil, etag: success.etag, confirmedAt: time, freshUntil: time.addingTimeInterval(Self.cacheOk)))
            return Answer(json: success.json)
        case .failure(let failure):
            if failure.status == 304, let stale, let previous {
                refundBudget(host, budgetAt)
                remember(url, Entry(json: previous.json, error: nil, etag: previous.etag, confirmedAt: time, freshUntil: time.addingTimeInterval(Self.cacheOk)))
                return Answer(json: stale)
            }
            // Refused by the app itself (streamer mode): not a verdict on the link, nothing is remembered
            if failure.reason == .blocked {
                refundBudget(host, budgetAt)
                return Answer(json: stale, error: stale == nil ? "paused" : nil)
            }
            if failure.status == 403 || failure.status == 429 { backoffUntil[host] = time.addingTimeInterval(Self.backoff) }
            // A slow-down, a server error or no answer at all says nothing about the link itself: keep showing what we had.
            // Anything else (404, 410, ...) means the old answer is no longer true.
            let status = failure.status
            let transient = status == nil || status == 403 || status == 429 || (status ?? 0) >= 500
            if transient, let stale, let previous {
                remember(url, Entry(json: previous.json, error: previous.error, etag: previous.etag, confirmedAt: previous.confirmedAt,
                                    freshUntil: time.addingTimeInterval(Self.cacheFail)))
                return Answer(json: stale)
            }
            remember(url, Entry(json: nil, error: failure.error, etag: nil, confirmedAt: time, freshUntil: time.addingTimeInterval(Self.cacheFail)))
            return Answer(json: nil, error: failure.error)
        }
    }

    /// True when a lookup for this URL is already cached (no request would be made)
    func isCached(_ url: String) -> Bool {
        guard let entry = cache[url] else { return false }
        return now() < entry.freshUntil
    }

    /// Looks the link up. `allow` is the list of hosts the person approved for this integration. `userInitiated` is false when
    /// nobody asked (a card appeared on screen) and true when the person pressed the card's button. In an encrypted room
    /// (`encrypted`) nothing is asked on its own. Never throws; failures are only ever "no details".
    func load(host: String, lookup: LinkLookup, captures: [String: String], allow: [String], locale: Locale = .current,
              settings: SettingValues = IntegrationSettings.none, userInitiated: Bool = false, encrypted: Bool = false) async -> Result {
        // Every field it could show is switched off: nothing to ask for
        if !IntegrationSettings.lookupShowsAnything(lookup, settings) { return .ok(IntegrationDetails.Details.empty) }
        let url: String
        switch IntegrationDetails.buildLookupUrl(host: host, lookup: lookup, captures: captures) {
        case .ok(let built): url = built
        case .error(let message): return .error(message, paused: false)
        }
        let passive = !userInitiated
        func finish(_ answer: Answer) -> Result {
            guard let json = answer.json else {
                if answer.error == "paused" { return .error("paused", paused: true) }
                return .error(answer.error ?? "No details", paused: false)
            }
            return .ok(IntegrationDetails.extract(json, lookup, locale: locale, settings: settings))
        }

        let entry = cache[url]
        if let entry, now() < entry.freshUntil { return finish(Answer(json: entry.json, error: entry.error)) }
        if let pending = inflight[url] { return finish(await pending.value) }
        if encrypted && passive { return .needsAsk }
        // When the host can not be asked right now, a recent enough answer is better than none
        let stale = staleJson(entry)
        // Streamer mode: nothing leaves the device on its own, and nothing is remembered as a failure
        if passive && IntegrationNetwork.passiveBlocked {
            if let stale { return finish(Answer(json: stale)) }
            return .error("paused", paused: true)
        }
        if let until = backoffUntil[host], until > now() {
            if let stale { return finish(Answer(json: stale)) }
            return .error("\(host) asked to slow down", paused: false)
        }
        guard let budgetAt = takeBudget(host) else {
            if let stale { return finish(Answer(json: stale)) }
            return .error("Too many lookups on \(host) just now", paused: false)
        }
        let task = Task { [self] in
            await refresh(url: url, host: host, allow: allow, previous: entry, budgetAt: budgetAt, passive: passive)
        }
        inflight[url] = task
        let answer = await task.value
        inflight[url] = nil
        return finish(answer)
    }

    /// Forgets every cached answer, budget and back-off (tests)
    func reset() {
        cache.removeAll()
        cacheOrder.removeAll()
        inflight.removeAll()
        backoffUntil.removeAll()
        recent.removeAll()
    }
}
