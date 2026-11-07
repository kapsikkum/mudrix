import SwiftUI
import WizardChatCore

/// A link in a message that an installed integration's rule matches, and the lookup it may make for it
struct IntegrationCardData: Identifiable {
    let url: String
    let match: IntegrationMatching.LinkCardMatch
    let lookup: IntegrationMatching.LinkLookupRef?
    var id: String { url }
}

/// What a card shows of its lookup
private enum DetailsState {
    case none
    /// Encrypted room: nothing is asked until the person presses the button
    case ask(host: String)
    /// Streamer mode is on: nothing is asked on its own until it ends
    case paused(host: String)
    case loading(host: String)
    case ready(host: String, details: IntegrationDetails.Details)
    case failed(host: String, requested: Bool)
}

private struct SettledState {
    let key: String
    let state: DetailsState
}

private enum IntegrationCardLinks {
    static let maxCards = 3
    private static let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    /// The https links of a text, without duplicates
    static func urls(in text: String) -> [String] {
        guard let detector else { return [] }
        let ns = text as NSString
        var seen = Set<String>()
        var out: [String] = []
        for match in detector.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let url = match.url, url.scheme?.lowercased() == "https" else { continue }
            let text = url.absoluteString
            if seen.insert(text).inserted { out.append(text) }
        }
        return out
    }
}

/// Cards for the links of a message that installed integrations recognise. Matching is local; a card whose integration may
/// look the link up asks its one approved host when the card is shown in an unencrypted room, only when the person presses its
/// button in an encrypted one, and never on its own while streamer mode is on.
struct IntegrationLinkCards: View {
    let text: String
    let roomId: String?
    let isEncrypted: Bool
    @ObservedObject private var store = IntegrationStore.shared

    private var cards: [IntegrationCardData] {
        guard !store.installed.isEmpty else { return [] }
        var out: [IntegrationCardData] = []
        for url in IntegrationCardLinks.urls(in: text) {
            if out.count >= IntegrationCardLinks.maxCards { break }
            guard let match = IntegrationMatching.matchLinkCard(url, store.installed, store.grants, stored: store.settings) else { continue }
            out.append(IntegrationCardData(url: url, match: match, lookup: IntegrationMatching.findLinkLookup(match, store.installed, store.grants)))
        }
        return out
    }

    var body: some View {
        let list = cards
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(list) { card in
                    IntegrationCardView(card: card, isEncrypted: isEncrypted)
                }
            }
        }
    }
}

private struct IntegrationCardView: View {
    let card: IntegrationCardData
    let isEncrypted: Bool
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL
    @State private var requestedUrl: String?
    @State private var settled: SettledState?

    private var lookupUrl: String? {
        guard let lookup = card.lookup, IntegrationSettings.lookupShowsAnything(lookup.lookup, card.match.settings) else { return nil }
        if case .ok(let url) = IntegrationDetails.buildLookupUrl(host: lookup.host, lookup: lookup.lookup, captures: card.match.captures) {
            return url
        }
        return nil
    }

    var body: some View {
        let url = lookupUrl
        let requested = url != nil && requestedUrl == url
        let cached = url != nil && LinkDetailsLoader.shared.isCached(url ?? "")
        let auto = url != nil && (!isEncrypted || cached)
        let waiting = prefs.streamerModeActive && !requested && !cached
        let key = "\(url ?? "")|\(Locale.current.identifier)|\(String(describing: card.match.settings))"
        let state = currentState(url: url, key: key, requested: requested, auto: auto, waiting: waiting)
        let taskId = "\(key)|\(auto)|\(requested)|\(waiting)"

        content(state: state, url: url)
            .task(id: taskId) {
                await load(key: key, requested: requested, auto: auto, waiting: waiting)
            }
    }

    private func currentState(url: String?, key: String, requested: Bool, auto: Bool, waiting: Bool) -> DetailsState {
        guard let lookup = card.lookup, url != nil else { return .none }
        if let settled, settled.key == key { return settled.state }
        if waiting && auto { return .paused(host: lookup.host) }
        if !auto && !requested { return .ask(host: lookup.host) }
        return .loading(host: lookup.host)
    }

    private func load(key: String, requested: Bool, auto: Bool, waiting: Bool) async {
        guard let lookup = card.lookup, (auto || requested), !waiting else { return }
        let result = await LinkDetailsLoader.shared.load(
            host: lookup.host, lookup: lookup.lookup, captures: card.match.captures, allow: lookup.allow, locale: .current,
            settings: card.match.settings, userInitiated: requested, encrypted: isEncrypted)
        if Task.isCancelled { return }
        switch result {
        case .ok(let details):
            settled = SettledState(key: key, state: .ready(host: lookup.host, details: details))
        case .error(_, let paused):
            if paused { return }
            settled = SettledState(key: key, state: .failed(host: lookup.host, requested: requested))
        case .needsAsk:
            return
        }
    }

    private func content(state: DetailsState, url: String?) -> some View {
        let name = card.match.integrationName
        var details: IntegrationDetails.Details?
        var detailsHost = ""
        if case .ready(let host, let d) = state {
            details = d
            detailsHost = host
        }
        let title = details?.title ?? card.match.title
        let via = details != nil ? L10n.format("integrations.card.viaDetails", name, detailsHost) : L10n.format("integrations.card.via", name)
        let openLabel = card.match.rule.buttonLabel ?? String(localized: "integrations.card.open")
        return HStack(alignment: .top, spacing: 10) {
            letterTile(name)
            VStack(alignment: .leading, spacing: 4) {
                Text(via)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                // Everything below is plain text; nothing from an answer is a link or markup
                Text(verbatim: title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(2)
                if let subtitle = card.match.subtitle {
                    Text(verbatim: subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(2)
                }
                stateView(state, url: url, details: details)
                Button(openLabel) {
                    if let target = URL(string: card.url) { openURL(target) }
                }
                .buttonStyle(.plain)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(theme.linkColor)
                .frame(minHeight: 36, alignment: .leading)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: 420, alignment: .leading)
        .background(theme.bgHover, in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func stateView(_ state: DetailsState, url: String?, details: IntegrationDetails.Details?) -> some View {
        switch state {
        case .ask(let host):
            Button(L10n.format("integrations.card.loadDetails", host)) { requestedUrl = url }
                .buttonStyle(.plain)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(theme.accent)
                .frame(minHeight: 36, alignment: .leading)
        case .paused(let host):
            Text(L10n.format("integrations.card.paused", host))
                .font(.system(size: 13))
                .foregroundStyle(theme.textMuted)
        case .failed(let host, let requested):
            if requested {
                Text(L10n.format("integrations.card.noDetails", host))
                    .font(.system(size: 13))
                    .foregroundStyle(theme.textMuted)
            }
        case .ready:
            if let description = details?.description {
                Text(verbatim: description)
                    .font(.system(size: 13))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(4)
            }
            if let facts = details?.facts, !facts.isEmpty {
                HStack(spacing: 12) {
                    ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
                        Text(verbatim: "\(fact.label) \(fact.value)")
                            .font(.system(size: 13))
                            .foregroundStyle(theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }
        case .none, .loading:
            EmptyView()
        }
    }

    /// A letter instead of an icon: icons are never fetched
    private func letterTile(_ name: String) -> some View {
        let letter = name.trimmingCharacters(in: .whitespaces).first.map { String($0).uppercased() } ?? "?"
        return Text(verbatim: letter)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(theme.textOnAccent)
            .frame(width: 32, height: 32)
            .background(theme.accent, in: RoundedRectangle(cornerRadius: 8))
            .accessibilityHidden(true)
    }
}
