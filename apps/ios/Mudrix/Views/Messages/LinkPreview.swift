import AVFoundation
import MudrixCore
import SwiftUI

struct LinkPreviewData {
    let url: URL
    let title: String
    let description: String?
    let siteName: String
    let imageUrl: String?
}

/// Fetches and caches link previews from the homeserver through the core. Only used in
/// unencrypted rooms, so the server never sees links from encrypted chats.
@MainActor
final class LinkPreviewLoader {
    private static var cache: [String: LinkPreviewData?] = [:]
    private static var inFlight: [String: Task<LinkPreviewData?, Never>] = [:]
    let client: MudrixClient

    init(client: MudrixClient) { self.client = client }

    func preview(for url: URL) async -> LinkPreviewData? {
        let key = url.absoluteString
        if let cached = Self.cache[key] { return cached }
        if let running = Self.inFlight[key] { return await running.value }
        let client = client
        let task = Task<LinkPreviewData?, Never> {
            guard let preview = try? await client.urlPreview(url: key),
                  let title = preview.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty
            else { return nil }
            let pageUrl = URL(string: preview.url) ?? url
            let host = (pageUrl.host ?? url.host ?? "").replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
            return LinkPreviewData(
                url: url,
                title: title,
                description: preview.description?.trimmingCharacters(in: .whitespacesAndNewlines),
                siteName: preview.siteName ?? host,
                imageUrl: preview.imageUrl)
        }
        Self.inFlight[key] = task
        let result = await task.value
        Self.inFlight[key] = nil
        Self.cache[key] = result
        return result
    }
}

struct LinkPreviewCard: View {
    let url: URL
    let loader: LinkPreviewLoader

    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.openURL) private var openURL
    @Environment(\.theme) private var theme
    @State private var data: LinkPreviewData?
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let data {
                Button { openURL(data.url) } label: { card(data) }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint(String(localized: "timeline.opensTheLink"))
            }
        }
        .task(id: url) {
            data = await loader.preview(for: url)
            guard let imageUrl = data?.imageUrl else { return }
            if imageUrl.hasPrefix("mxc://") {
                image = await mediaLoader?.thumbnail(imageUrl, size: 400)
            } else if let remote = URL(string: imageUrl),
                      let (bytes, _) = try? await URLSession.shared.data(from: remote) {
                image = AnimatedImage.image(from: bytes, animated: false)
            }
        }
    }

    private func card(_ data: LinkPreviewData) -> some View {
        HStack(alignment: .top, spacing: WZ.Space.space4) {
            RoundedRectangle(cornerRadius: WZ.Radius.xs).fill(theme.linkColor).frame(width: WZ.Space.space1)
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                Text(data.siteName)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textMuted)
                Text(data.title)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.linkColor)
                    .lineLimit(2)
                if let description = data.description, !description.isEmpty {
                    Text(description)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(3)
                }
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: WZ.Size.sidebar, maxHeight: WZ.SizeAvatar.xxl)
                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.md, style: .continuous))
                        .padding(.top, WZ.Space.space2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(WZ.Space.space4)
        .frame(maxWidth: WZ.Size.panel, alignment: .leading)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .padding(.top, WZ.Space.space2)
    }
}

extension MessageText {
    static func firstPreviewURL(in text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        let ns = text as NSString
        for match in detector.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let url = match.url, ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  url.host?.lowercased() != "matrix.to" else { continue }
            return url
        }
        return nil
    }
}

// MARK: - Link embeds built by embeds.now

/// A service with its own link-embed setting. YouTube keeps its own card (`YouTubeCard`); Spotify has a setting, which
/// the web uses for its player, but no card on iOS yet. Every other one is drawn from an embeds.now card.
enum LinkEmbedService: String, CaseIterable, Identifiable {
    case youtube, spotify, x, instagram, tiktok, reddit, facebook, threads, bluesky, mastodon, pinterest, linkedin, tumblr

    var id: String { rawValue }

    static let players: [LinkEmbedService] = [.youtube, .spotify]
    static let cards: [LinkEmbedService] = allCases.filter { !players.contains($0) }

    /// Brand names are not translated
    var name: String {
        switch self {
        case .youtube: return "YouTube"
        case .spotify: return "Spotify"
        case .x: return "X"
        case .instagram: return "Instagram"
        case .tiktok: return "TikTok"
        case .reddit: return "Reddit"
        case .facebook: return "Facebook"
        case .threads: return "Threads"
        case .bluesky: return "Bluesky"
        case .mastodon: return "Mastodon"
        case .pinterest: return "Pinterest"
        case .linkedin: return "LinkedIn"
        case .tumblr: return "Tumblr"
        }
    }

    /// Only the icon set's own symbols exist; no brand logos, so each service gets a generic one that hints at its content
    var icon: String {
        switch self {
        case .youtube: return "ph-youtube-logo-fill"
        case .spotify: return "ph-speaker-high-regular"
        case .x: return "ph-chat-text-regular"
        case .instagram: return "ph-camera-regular"
        case .tiktok: return "ph-film-strip-regular"
        case .reddit: return "ph-chat-circle-regular"
        case .facebook: return "ph-users-regular"
        case .threads: return "ph-chat-dots-regular"
        case .bluesky: return "ph-globe-simple-regular"
        case .mastodon: return "ph-hash-straight-regular"
        case .pinterest: return "ph-push-pin-regular"
        case .linkedin: return "ph-note-pencil-regular"
        case .tumblr: return "ph-quotes-regular"
        }
    }

    /// The edge colour of the consent prompt and the loading card, as the web's registry has it (`0xRRGGBB`)
    var accent: Int {
        switch self {
        case .youtube: return 0xFF0000
        case .spotify: return 0x1DB954
        case .x: return 0x1D9BF0
        case .instagram: return 0xE1306C
        case .tiktok: return 0x25F4EE
        case .reddit: return 0xFF4500
        case .facebook: return 0x1877F2
        case .threads: return 0x8A8A8A
        case .bluesky: return 0x1185FE
        case .mastodon: return 0x6364FF
        case .pinterest: return 0xE60023
        case .linkedin: return 0x0A66C2
        case .tumblr: return 0x36465D
        }
    }

    var descriptionKey: String { "settings.media.linkEmbeds.desc.\(rawValue)" }

    @MainActor var modeKey: ReferenceWritableKeyPath<AppPreferences, LinkEmbedMode> {
        switch self {
        case .youtube: return \.youtubeEmbeds
        case .spotify: return \.spotifyEmbeds
        case .x: return \.xEmbeds
        case .instagram: return \.instagramEmbeds
        case .tiktok: return \.tiktokEmbeds
        case .reddit: return \.redditEmbeds
        case .facebook: return \.facebookEmbeds
        case .threads: return \.threadsEmbeds
        case .bluesky: return \.blueskyEmbeds
        case .mastodon: return \.mastodonEmbeds
        case .pinterest: return \.pinterestEmbeds
        case .linkedin: return \.linkedinEmbeds
        case .tumblr: return \.tumblrEmbeds
        }
    }
}

/// A link an embeds.now service recognises, as that service's canonical https address
struct LinkEmbedMatch: Equatable {
    let service: LinkEmbedService
    let url: String
}

/// What a link in a message turns into for its service's setting
enum LinkEmbedPlan: Equatable {
    /// Ask once: a prompt, nothing is requested
    case prompt
    /// Allowed: the card is requested at once, in encrypted rooms too (allowing is the consent)
    case card

    /// nil is "hide": the link keeps its plain preview
    static func plan(for mode: LinkEmbedMode) -> LinkEmbedPlan? {
        switch mode {
        case .off: return nil
        case .ask: return .prompt
        case .on: return .card
        }
    }
}

/// Recognises the links embeds.now can build a card for, with the same shapes as the web's `util/linkEmbeds.ts`.
/// Hosts are public DNS names and the address is https, without credentials or a port.
enum LinkEmbedLinks {
    private static let maxLength = 2000

    private struct Link {
        let components: URLComponents
        let host: String
        let segments: [String]

        func at(_ index: Int) -> String? { index < segments.count ? segments[index] : nil }

        func query(_ name: String) -> String? {
            components.queryItems?.first { $0.name == name }?.value
        }

        /// The address with https and no fragment, otherwise as it was written
        var normalized: String { components.string ?? "" }
    }

    static func match(_ raw: String) -> LinkEmbedMatch? {
        guard raw.count <= maxLength, var components = URLComponents(string: raw),
              let scheme = components.scheme?.lowercased(), scheme == "https" || scheme == "http",
              components.user == nil, components.password == nil, components.port == nil,
              let host = components.host?.lowercased(), !IntegrationNetwork.isForbiddenHost(host) else { return nil }
        components.scheme = "https"
        components.host = host
        components.fragment = nil
        let segments = components.percentEncodedPath.split(separator: "/").map { part -> String in
            let text = String(part)
            return text.removingPercentEncoding ?? text
        }
        let link = Link(components: components, host: host, segments: segments)
        for (service, parse) in parsers {
            if let url = parse(link) { return LinkEmbedMatch(service: service, url: url) }
        }
        return nil
    }

    private static let parsers: [(LinkEmbedService, (Link) -> String?)] = [
        (.x, x), (.instagram, instagram), (.tiktok, tiktok), (.reddit, reddit), (.facebook, facebook),
        (.threads, threads), (.bluesky, bluesky), (.mastodon, mastodon), (.pinterest, pinterest),
        (.linkedin, linkedin), (.tumblr, tumblr),
    ]

    private static func ok(_ text: String?, _ pattern: String) -> Bool {
        guard let text else { return false }
        return text.range(of: pattern, options: .regularExpression) != nil
    }

    private static let xHosts: Set<String> = [
        "x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com",
    ]
    /// First path segments of x.com that are pages, not accounts
    private static let xPages: Set<String> = [
        "home", "i", "explore", "search", "settings", "notifications", "messages", "login", "logout", "signup",
        "intent", "share", "hashtag", "compose", "tos", "privacy", "about", "jobs", "download", "account", "lists",
        "bookmarks", "premium", "verified", "communities", "topics", "grok",
    ]

    private static func x(_ l: Link) -> String? {
        if l.host == "t.co" { return l.normalized }
        guard xHosts.contains(l.host) else { return nil }
        var user: String?
        var id: String?
        if l.at(0) == "i", l.at(1) == "web", l.at(2) == "status" {
            id = l.at(3)
        } else if l.at(0) == "i", l.at(1) == "status" {
            id = l.at(2)
        } else if l.at(1) == "status" || l.at(1) == "statuses" {
            user = l.at(0)
            id = l.at(2)
        } else if l.segments.count == 1, let handle = l.at(0), ok(handle, "^[A-Za-z0-9_]{1,15}$"),
                  !xPages.contains(handle.lowercased()) {
            return "https://x.com/\(handle)"
        }
        guard let id, ok(id, "^[0-9]{1,25}$") else { return nil }
        if let user, !ok(user, "^[A-Za-z0-9_]{1,15}$") { return nil }
        return user.map { "https://x.com/\($0)/status/\(id)" } ?? "https://x.com/i/status/\(id)"
    }

    private static let instagramHosts: Set<String> = [
        "instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am",
    ]

    private static func instagram(_ l: Link) -> String? {
        guard instagramHosts.contains(l.host) else { return nil }
        guard let kind = l.at(0) else { return nil }
        if kind == "share" { return l.normalized }
        guard ["p", "reel", "reels", "tv"].contains(kind), let code = l.at(1), ok(code, "^[A-Za-z0-9_-]{5,30}$") else { return nil }
        let embedKind = kind == "p" || kind == "tv" ? "p" : "reel"
        return "https://www.instagram.com/\(embedKind)/\(code)/"
    }

    private static func tiktok(_ l: Link) -> String? {
        if l.host == "vt.tiktok.com" || l.host == "vm.tiktok.com" { return l.normalized }
        guard ["tiktok.com", "www.tiktok.com", "m.tiktok.com"].contains(l.host) else { return nil }
        if l.at(0) == "t" { return l.normalized }
        var user: String?
        var id: String?
        if l.at(0) == "embed", l.at(1) == "v2" {
            id = l.at(2)
        } else if l.at(0) == "v" {
            id = l.at(1).map { $0.replacingOccurrences(of: "\\.html$", with: "", options: [.regularExpression, .caseInsensitive]) }
        } else if let first = l.at(0), first.hasPrefix("@"), l.at(1) == "video" || l.at(1) == "photo" {
            user = String(first.dropFirst())
            id = l.at(2)
        }
        guard let id, ok(id, "^[0-9]{6,25}$") else { return nil }
        if let user, !ok(user, "^[A-Za-z0-9._-]{1,64}$") { return nil }
        return user.map { "https://www.tiktok.com/@\($0)/video/\(id)" } ?? l.normalized
    }

    private static func reddit(_ l: Link) -> String? {
        if l.host == "redd.it" || l.host == "www.redd.it" { return l.normalized }
        guard ["reddit.com", "www.reddit.com", "old.reddit.com", "m.reddit.com", "new.reddit.com"].contains(l.host) else { return nil }
        if l.at(0) == "r", l.at(2) == "s" { return l.normalized }
        var sub: String?
        var id: String?
        if l.at(0) == "r", l.at(2) == "comments" {
            sub = l.at(1)
            id = l.at(3)
        } else if l.at(0) == "comments" {
            id = l.at(1)
        }
        guard let id, ok(id, "^[A-Za-z0-9]{4,12}$") else { return nil }
        guard let sub else { return l.normalized }
        guard ok(sub, "^[A-Za-z0-9_]{2,32}$") else { return nil }
        let slug = ok(l.at(4), "^[A-Za-z0-9_-]{1,120}$") ? "\(l.at(4) ?? "")/" : ""
        return "https://www.reddit.com/r/\(sub)/comments/\(id)/\(slug)"
    }

    private static let facebookSafe = "^[A-Za-z0-9._-]{1,100}$"

    private static func facebook(_ l: Link) -> String? {
        if l.host == "fb.watch" || l.host == "fb.me" { return l.normalized }
        guard ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "mbasic.facebook.com"].contains(l.host)
        else { return nil }
        switch l.at(0) {
        case "watch":
            guard let id = l.query("v"), ok(id, facebookSafe) else { return nil }
            return "https://www.facebook.com/watch/?v=\(id)"
        case "reel":
            guard let id = l.at(1), ok(id, facebookSafe) else { return nil }
            return "https://www.facebook.com/reel/\(id)"
        case "videos":
            guard ok(l.at(1), facebookSafe) else { return nil }
            return l.normalized
        case "posts":
            guard let id = l.at(1), ok(id, facebookSafe) else { return nil }
            return "https://www.facebook.com/posts/\(id)"
        case "permalink.php", "story.php":
            guard let story = l.query("story_fbid"), let owner = l.query("id"),
                  ok(story, facebookSafe), ok(owner, facebookSafe) else { return nil }
            return "https://www.facebook.com/\(l.at(0) ?? "")?story_fbid=\(story)&id=\(owner)"
        case "photo.php":
            guard let photo = l.query("fbid"), ok(photo, facebookSafe) else { return nil }
            return "https://www.facebook.com/photo.php?fbid=\(photo)"
        case "share":
            return l.normalized
        default:
            if l.at(1) == "posts", let page = l.at(0), ok(page, facebookSafe), let id = l.at(2), ok(id, facebookSafe) {
                return "https://www.facebook.com/\(page)/posts/\(id)"
            }
            return nil
        }
    }

    private static func threads(_ l: Link) -> String? {
        guard ["threads.net", "www.threads.net", "threads.com", "www.threads.com"].contains(l.host) else { return nil }
        if l.at(0) == "t" { return l.normalized }
        guard let handle = l.at(0), handle.hasPrefix("@"), l.at(1) == "post" else { return nil }
        let user = String(handle.dropFirst())
        guard ok(user, "^[A-Za-z0-9._-]{1,64}$"), let id = l.at(2), ok(id, "^[A-Za-z0-9_-]{1,64}$") else { return nil }
        return "https://www.threads.net/@\(user)/post/\(id)"
    }

    private static func bluesky(_ l: Link) -> String? {
        guard l.host == "bsky.app" || l.host == "www.bsky.app" else { return nil }
        guard l.at(0) == "profile", l.at(2) == "post", let handle = l.at(1), let rkey = l.at(3),
              ok(rkey, "^[A-Za-z0-9._~-]{1,512}$") else { return nil }
        let isDid = ok(handle, "^did:[a-z]+:[A-Za-z0-9._:%-]+$")
        guard isDid || ok(handle, "^[A-Za-z0-9.-]{1,253}$") else { return nil }
        return "https://bsky.app/profile/\(handle)/post/\(rkey)"
    }

    /// Hosts that belong to another service, so their `/@user/123` links are never taken for Mastodon posts
    private static let ownedHosts: Set<String> = Set([
        "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com",
        "open.spotify.com", "play.spotify.com", "spotify.link", "spotify.app.link",
        "t.co", "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vt.tiktok.com", "vm.tiktok.com",
        "redd.it", "www.redd.it", "fb.watch", "fb.me", "bsky.app", "www.bsky.app",
        "pinterest.com", "www.pinterest.com", "m.pinterest.com", "pin.it",
        "linkedin.com", "www.linkedin.com", "m.linkedin.com", "lnkd.in", "www.lnkd.in",
        "tumblr.com", "www.tumblr.com", "tmblr.co", "www.tmblr.co",
    ]).union(xHosts).union(instagramHosts).union([
        "reddit.com", "www.reddit.com", "old.reddit.com", "m.reddit.com", "new.reddit.com",
        "facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "mbasic.facebook.com",
        "threads.net", "www.threads.net", "threads.com", "www.threads.com",
    ])

    private static func isOwned(_ host: String) -> Bool {
        if ownedHosts.contains(host) { return true }
        if ok(host, "^[a-z]{2,5}\\.pinterest\\.com$") { return true }
        return ok(host, "^[a-z0-9-]+\\.tumblr\\.com$")
    }

    /// Mastodon has no fixed host list; the shape (`/@user/123…`, `/users/user/statuses/123…`) is what gives it away
    private static func mastodon(_ l: Link) -> String? {
        if isOwned(l.host) { return nil }
        var parts = l.segments
        if parts.first == "web", parts.count > 1, parts[1].hasPrefix("@") { parts.removeFirst() }
        func part(_ index: Int) -> String? { index < parts.count ? parts[index] : nil }
        var user: String?
        var id: String?
        if let first = part(0), first.hasPrefix("@") {
            user = String(first.dropFirst())
            id = part(1)
        } else if part(0) == "users", part(2) == "statuses" {
            user = part(1)
            id = part(3)
        }
        guard let id, ok(id, "^[0-9]{4,32}$") else { return nil }
        if let user, !ok(user, "^[A-Za-z0-9_.-]+(@[A-Za-z0-9.-]+)?$") { return nil }
        return l.normalized
    }

    private static func pinterest(_ l: Link) -> String? {
        if l.host == "pin.it" { return l.normalized }
        let localised = ok(l.host, "^[a-z]{2,5}\\.pinterest\\.com$") && l.host != "www.pinterest.com"
        guard ["pinterest.com", "www.pinterest.com", "m.pinterest.com"].contains(l.host) || localised else { return nil }
        guard l.at(0) == "pin", let id = l.at(1), ok(id, "^[0-9]{4,30}$") else { return nil }
        return "https://www.pinterest.com/pin/\(id)/"
    }

    private static func linkedin(_ l: Link) -> String? {
        if l.host == "lnkd.in" || l.host == "www.lnkd.in" { return l.normalized }
        guard ["linkedin.com", "www.linkedin.com", "m.linkedin.com"].contains(l.host) else { return nil }
        if l.at(0) == "feed", l.at(1) == "update", let urn = l.at(2) {
            guard ok(urn, "^urn:li:(activity|share|ugcPost):[0-9]{1,30}$") else { return nil }
            return "https://www.linkedin.com/feed/update/\(urn)/"
        }
        if l.at(0) == "posts" || l.at(0) == "pulse" { return l.normalized }
        return nil
    }

    private static func tumblr(_ l: Link) -> String? {
        if l.host == "tmblr.co" || l.host == "www.tmblr.co" { return l.normalized }
        var blog: String?
        var id: String?
        if l.host == "tumblr.com" || l.host == "www.tumblr.com" {
            guard let first = l.at(0), ok(first, "^[A-Za-z0-9-]{1,64}$") else { return nil }
            blog = first
            id = l.at(1) == "post" ? l.at(2) : l.at(1)
        } else if ok(l.host, "^[a-z0-9-]+\\.tumblr\\.com$") {
            blog = String(l.host.dropLast(".tumblr.com".count))
            id = l.at(0) == "post" ? l.at(1) : l.at(0)
        } else {
            return nil
        }
        guard let blog, let id, ok(id, "^[0-9]{4,30}$") else { return nil }
        return "https://www.tumblr.com/\(blog)/\(id)"
    }
}

/// Fetches embeds.now cards through the core, which asks embeds.now itself. A card (or "no card") is kept for the
/// session; a failure is only reported, never kept, so the next try asks again. Two views asking for one link share a request.
@MainActor
final class LinkEmbedLoader {
    static let shared = LinkEmbedLoader { try await MudrixClient.linkEmbed(url: $0) }
    private static let maxCached = 200

    private let fetch: @Sendable (String) async throws -> LinkEmbedCard?
    private var cache: [String: LinkEmbedCard?] = [:]
    private var order: [String] = []
    private var inFlight: [String: Task<LinkEmbedCard?, Error>] = [:]

    init(fetch: @escaping @Sendable (String) async throws -> LinkEmbedCard?) { self.fetch = fetch }

    func card(for url: String) async throws -> LinkEmbedCard? {
        if let cached = cache[url] { return cached }
        if let running = inFlight[url] { return try await running.value }
        let fetch = fetch
        let task = Task<LinkEmbedCard?, Error> { try await fetch(url) }
        inFlight[url] = task
        do {
            let card = try await task.value
            inFlight[url] = nil
            remember(url, card)
            return card
        } catch {
            inFlight[url] = nil
            throw error
        }
    }

    private func remember(_ url: String, _ card: LinkEmbedCard?) {
        if cache[url] == nil { order.append(url) }
        cache[url] = .some(card)
        while order.count > Self.maxCached {
            cache[order.removeFirst()] = nil
        }
    }

    func isCached(_ url: String) -> Bool { cache[url] != nil }
}

/// The Discord subset embeds.now sends: `**bold**`, `[label](https-url)`, `-# small line`, and backslash escapes
enum LinkEmbedMarkdown {
    struct Run: Equatable {
        var text: String
        var bold = false
        var url: URL?
    }

    struct Line: Equatable {
        var runs: [Run]
        var small = false
    }

    /// Texts come from strangers: anything past this is dropped
    static let maxLength = 6000

    static func lines(_ markdown: String) -> [Line] {
        var out: [Line] = []
        for raw in String(markdown.prefix(maxLength)).components(separatedBy: "\n") {
            var text = raw.trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
            var small = false
            if text.hasPrefix("-# ") {
                small = true
                text = String(text.dropFirst(3))
            }
            out.append(Line(runs: inline(Array(text), bold: false), small: small))
        }
        while out.first?.runs.isEmpty == true { out.removeFirst() }
        while out.last?.runs.isEmpty == true { out.removeLast() }
        return out
    }

    private static let punctuation = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")

    private static func inline(_ chars: [Character], bold: Bool) -> [Run] {
        var runs: [Run] = []
        var buffer = ""
        func flush() {
            if !buffer.isEmpty { runs.append(Run(text: buffer, bold: bold)) }
            buffer = ""
        }
        var index = 0
        while index < chars.count {
            let char = chars[index]
            if char == "\\", index + 1 < chars.count, punctuation.contains(chars[index + 1]) {
                buffer.append(chars[index + 1])
                index += 2
            } else if char == "*", index + 1 < chars.count, chars[index + 1] == "*",
                      let close = closingBold(chars, from: index + 2), close > index + 2 {
                flush()
                runs += inline(Array(chars[(index + 2)..<close]), bold: true)
                index = close + 2
            } else if char == "[", let link = link(chars, at: index) {
                flush()
                var label = inline(link.label, bold: bold)
                if let url = link.url { label = label.map { Run(text: $0.text, bold: $0.bold, url: url) } }
                runs += label
                index = link.end
            } else {
                buffer.append(char)
                index += 1
            }
        }
        flush()
        var merged: [Run] = []
        for run in runs {
            if var last = merged.last, last.bold == run.bold, last.url == run.url {
                last.text += run.text
                merged[merged.count - 1] = last
            } else {
                merged.append(run)
            }
        }
        return merged
    }

    private static func closingBold(_ chars: [Character], from start: Int) -> Int? {
        var index = start
        while index < chars.count {
            if chars[index] == "\\" {
                index += 2
            } else if chars[index] == "*", index + 1 < chars.count, chars[index + 1] == "*" {
                return index
            } else {
                index += 1
            }
        }
        return nil
    }

    private static func link(_ chars: [Character], at start: Int) -> (label: [Character], url: URL?, end: Int)? {
        var close = start + 1
        while close < chars.count, chars[close] != "]" {
            close += chars[close] == "\\" ? 2 : 1
        }
        guard close + 1 < chars.count, chars[close] == "]", chars[close + 1] == "(" else { return nil }
        var end = close + 2
        var depth = 1
        while end < chars.count {
            if chars[end] == "\\" {
                end += 2
                continue
            }
            if chars[end] == "(" { depth += 1 }
            if chars[end] == ")" {
                depth -= 1
                if depth == 0 { break }
            }
            end += 1
        }
        guard end < chars.count, chars[end] == ")" else { return nil }
        var target = ""
        var index = close + 2
        while index < end {
            if chars[index] == "\\", index + 1 < end, punctuation.contains(chars[index + 1]) {
                target.append(chars[index + 1])
                index += 2
            } else {
                target.append(chars[index])
                index += 1
            }
        }
        return (Array(chars[(start + 1)..<close]), EmbedURL.https(target), end + 1)
    }

    static func attributed(_ line: Line, size: CGFloat, linkColor: Color) -> AttributedString {
        var out = AttributedString()
        for run in line.runs {
            var piece = AttributedString(run.text)
            if run.bold { piece.font = .wizard(size, .bold) }
            if let url = run.url {
                piece.link = url
                piece.foregroundColor = linkColor
            }
            out += piece
        }
        return out
    }
}

/// Addresses from an embeds.now card are only ever opened or loaded when they are https to a public host
enum EmbedURL {
    static func https(_ raw: String) -> URL? {
        guard raw.count <= 4000, let url = URL(string: raw), url.scheme?.lowercased() == "https",
              url.user == nil, let host = url.host?.lowercased(), !IntegrationNetwork.isForbiddenHost(host) else { return nil }
        return url
    }

    static func color(_ rgb: Int?, fallback: Color) -> Color {
        guard let rgb else { return fallback }
        return Color(red: Double((rgb >> 16) & 0xFF) / 255, green: Double((rgb >> 8) & 0xFF) / 255, blue: Double(rgb & 0xFF) / 255)
    }
}

/// Pictures of a card, kept in memory
@MainActor
final class EmbedImageStore {
    static let shared = EmbedImageStore()
    private let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 80
        return cache
    }()
    private var inFlight: [String: Task<UIImage?, Never>] = [:]
    private static let maxBytes = 15 * 1024 * 1024

    func image(_ raw: String) async -> UIImage? {
        if let cached = cache.object(forKey: raw as NSString) { return cached }
        if let running = inFlight[raw] { return await running.value }
        guard let url = EmbedURL.https(raw) else { return nil }
        let task = Task<UIImage?, Never> {
            var request = URLRequest(url: url)
            request.timeoutInterval = 20
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  (response as? HTTPURLResponse)?.statusCode == 200, data.count <= Self.maxBytes else { return nil }
            return AnimatedImage.image(from: data, animated: false)
        }
        inFlight[raw] = task
        let image = await task.value
        inFlight[raw] = nil
        if let image { cache.setObject(image, forKey: raw as NSString) }
        return image
    }
}

/// A picture from a card, filling the frame it is given (or, with `natural`, its own shape within limits)
struct EmbedRemoteImage: View {
    let url: String
    var natural = false
    @Environment(\.theme) private var theme
    @State private var image: UIImage?

    var body: some View {
        let ratio: CGFloat? = natural
            ? (image.map { min(max($0.size.width / max($0.size.height, 1), 0.6), 2.0) } ?? 16.0 / 9.0)
            : nil
        Color.clear
            .aspectRatio(ratio, contentMode: .fit)
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    theme.bgActive
                }
            }
            .clipped()
            .task(id: url) { image = await EmbedImageStore.shared.image(url) }
    }
}

/// The accent edge every card shares
private struct EmbedFrame<Content: View>: View {
    let accent: Color
    @ViewBuilder let content: () -> Content
    @Environment(\.theme) private var theme

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous)
        HStack(alignment: .top, spacing: 0) {
            Rectangle().fill(accent).frame(width: WZ.Space.space2)
            content()
                .padding(WZ.Space.space5)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: WZ.SizeMedia.maxWidth, alignment: .leading)
        .background(theme.fill, in: shape)
        .clipShape(shape)
        .padding(.top, WZ.Space.space2)
    }
}

/// What a link in a message looks like for its embeds.now service and the person's setting for it
struct LinkEmbedEntry: View {
    let url: URL
    let match: LinkEmbedMatch
    let loader: LinkPreviewLoader?
    @EnvironmentObject private var prefs: AppPreferences

    var body: some View {
        switch LinkEmbedPlan.plan(for: prefs[keyPath: match.service.modeKey]) {
        case .none:
            if let loader { LinkPreviewCard(url: url, loader: loader) }
        case .prompt:
            LinkEmbedConsentCard(service: match.service)
        case .card:
            EmbedsNowCard(url: url, match: match, loader: loader)
        }
    }
}

struct LinkEmbedConsentCard: View {
    let service: LinkEmbedService
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    var body: some View {
        EmbedFrame(accent: EmbedURL.color(service.accent, fallback: theme.linkColor)) {
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                Text(verbatim: service.name)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textMuted)
                Text(L10n.format("timeline.linkEmbed.consentCard", service.name))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: WZ.Space.space3) { buttons }
                    VStack(spacing: WZ.Space.space3) { buttons }
                }
            }
        }
    }

    @ViewBuilder
    private var buttons: some View {
        Button(String(localized: "timeline.linkEmbed.allow")) { prefs[keyPath: service.modeKey] = .on }
            .buttonStyle(PrimaryButtonStyle())
        Button(String(localized: "timeline.linkEmbed.deny")) { prefs[keyPath: service.modeKey] = .off }
            .buttonStyle(SecondaryButtonStyle())
    }
}

/// An embeds.now card: asked for as soon as it is shown, a skeleton meanwhile, the plain link preview when there is none
struct EmbedsNowCard: View {
    let url: URL
    let match: LinkEmbedMatch
    let loader: LinkPreviewLoader?
    @State private var phase = Phase.loading

    private enum Phase {
        case loading
        case ready(LinkEmbedCard)
        case unavailable
    }

    var body: some View {
        content
            .task(id: match.url) { await load() }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            LinkEmbedSkeleton(service: match.service)
        case .ready(let card):
            LinkEmbedCardView(card: card, service: match.service)
        case .unavailable:
            if let loader { LinkPreviewCard(url: url, loader: loader) }
        }
    }

    private func load() async {
        if case .ready = phase { return }
        do {
            let card = try await LinkEmbedLoader.shared.card(for: match.url)
            if Task.isCancelled { return }
            if let card { phase = .ready(card) } else { phase = .unavailable }
        } catch {
            if !Task.isCancelled { phase = .unavailable }
        }
    }
}

private struct LinkEmbedSkeleton: View {
    let service: LinkEmbedService
    @Environment(\.theme) private var theme

    var body: some View {
        EmbedFrame(accent: EmbedURL.color(service.accent, fallback: theme.linkColor).opacity(0.5)) {
            VStack(alignment: .leading, spacing: WZ.Space.space4) {
                bar(height: 14).frame(maxWidth: 160)
                bar(height: 12)
                bar(height: 12).padding(.trailing, WZ.Space.space10)
                RoundedRectangle(cornerRadius: WZ.Radius.md, style: .continuous)
                    .fill(theme.bgActive)
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
            }
            .shimmer()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.format("timeline.linkEmbed.loading", service.name))
    }

    private func bar(height: CGFloat) -> some View {
        Capsule().fill(theme.bgActive).frame(height: height)
    }
}

struct LinkEmbedCardView: View {
    let card: LinkEmbedCard
    let service: LinkEmbedService
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    var body: some View {
        EmbedFrame(accent: EmbedURL.color(card.accent, fallback: EmbedURL.color(service.accent, fallback: theme.linkColor))) {
            VStack(alignment: .leading, spacing: WZ.Space.space4) {
                ForEach(Array(card.blocks.enumerated()), id: \.offset) { _, block in
                    blockView(block)
                }
                Text(String(localized: "timeline.linkEmbed.via"))
                    .font(.wizard(WZ.FontSize.xs))
                    .foregroundStyle(theme.textMuted)
            }
        }
        // Whatever the card says, only https links leave the app
        .environment(\.openURL, OpenURLAction { url in
            if url.scheme?.lowercased() == "https" { return .systemAction }
            return .discarded
        })
    }

    @ViewBuilder
    private func blockView(_ block: LinkEmbedBlock) -> some View {
        switch block {
        case .text(let text):
            EmbedTextBlock(block: text, service: service)
        case .gallery(let gallery):
            EmbedGallery(items: gallery.items, service: service)
        case .separator:
            Rectangle().fill(theme.border).frame(height: WZ.BorderWidth.thin)
        case .buttons(let buttons):
            EmbedButtons(buttons: buttons.buttons)
        }
    }
}

private struct EmbedTextBlock: View {
    let block: LinkEmbedBlock.Text
    let service: LinkEmbedService
    private let lines: [LinkEmbedMarkdown.Line]
    @Environment(\.theme) private var theme

    init(block: LinkEmbedBlock.Text, service: LinkEmbedService) {
        self.block = block
        self.service = service
        lines = LinkEmbedMarkdown.lines(block.markdown)
    }

    var body: some View {
        HStack(alignment: .top, spacing: WZ.Space.space5) {
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    if line.runs.isEmpty {
                        Color.clear.frame(height: WZ.Space.space3)
                    } else {
                        let size = line.small ? WZ.FontSize.xs : WZ.FontSize.md
                        Text(LinkEmbedMarkdown.attributed(line, size: size, linkColor: theme.linkColor))
                            .font(.wizard(size))
                            .foregroundStyle(line.small ? theme.textMuted : theme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let thumbnail = block.thumbnail, thumbnail.kind == .image {
                EmbedRemoteImage(url: thumbnail.url)
                    .frame(width: WZ.SizeAvatar.lg, height: WZ.SizeAvatar.lg)
                    .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                    .accessibilityLabel(thumbnail.description ?? "")
                    .accessibilityHidden(thumbnail.description == nil)
            }
        }
    }
}

/// Pictures and videos as a mosaic (one full width, two side by side, three with a tall one, four as a square, up to ten),
/// audio as rows below it. Tapping a picture opens it full screen, a video opens the system player; nothing plays on its own.
private struct EmbedGallery: View {
    let items: [LinkEmbedMedia]
    let service: LinkEmbedService
    @State private var viewing: IdentifiedInt?

    private static let maxVisible = 10
    private static let gap = WZ.Space.space1

    /// How many tiles each row of the mosaic holds
    static func rowSizes(_ count: Int) -> [Int] {
        switch count {
        case ..<1: return []
        case 1: return [1]
        case 2: return [2]
        case 3: return [1, 2]
        case 4: return [2, 2]
        case 5: return [2, 3]
        case 6: return [3, 3]
        case 7: return [1, 3, 3]
        case 8: return [2, 3, 3]
        case 9: return [3, 3, 3]
        default: return [1, 3, 3, 3]
        }
    }

    private var visual: [LinkEmbedMedia] { items.filter { $0.kind != .audio } }
    private var audio: [LinkEmbedMedia] { items.filter { $0.kind == .audio } }

    var body: some View {
        let shown = Array(visual.prefix(Self.maxVisible))
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            if !shown.isEmpty {
                mosaic(shown, extra: visual.count - shown.count)
            }
            ForEach(Array(audio.enumerated()), id: \.offset) { _, media in
                EmbedAudioRow(media: media, service: service)
            }
        }
        .fullScreenCover(item: $viewing) { index in
            if index.id < visual.count {
                EmbedImageViewer(url: visual[index.id].url, title: visual[index.id].description ?? service.name)
            }
        }
    }

    private func mosaic(_ shown: [LinkEmbedMedia], extra: Int) -> some View {
        let sizes = Self.rowSizes(shown.count)
        var start = 0
        let rows: [(start: Int, count: Int)] = sizes.map { size in
            defer { start += size }
            return (start, size)
        }
        return VStack(spacing: Self.gap) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: Self.gap) {
                    ForEach(row.start..<(row.start + row.count), id: \.self) { index in
                        let single = shown.count == 1
                        let ratio: CGFloat? = single
                            ? (shown[index].kind == .video ? 16.0 / 9.0 : nil)
                            : (row.count == 1 ? 16.0 / 9.0 : 1.0)
                        tile(shown[index], index: index, natural: single,
                             more: index == shown.count - 1 ? extra : 0)
                            .aspectRatio(ratio, contentMode: .fit)
                            .frame(maxWidth: .infinity)
                            .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.md, style: .continuous))
                    }
                }
            }
        }
    }

    private func tile(_ media: LinkEmbedMedia, index: Int, natural: Bool, more: Int) -> some View {
        Button {
            open(media, index: index)
        } label: {
            ZStack {
                if media.kind == .video {
                    EmbedVideoTile()
                } else {
                    EmbedRemoteImage(url: media.url, natural: natural)
                }
                if more > 0 {
                    Rectangle().fill(Color.black.opacity(0.55))
                    Text(L10n.format("timeline.linkEmbed.moreMedia", more))
                        .font(.wizard(WZ.FontSize.lg, .bold))
                        .foregroundStyle(.white)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(media.kind == .video
            ? L10n.format("timeline.linkEmbed.play", service.name)
            : (media.description ?? service.name))
    }

    private func open(_ media: LinkEmbedMedia, index: Int) {
        if media.kind == .video {
            if let url = EmbedURL.https(media.url) { NativeVideoPlayer.present(url: url) }
        } else {
            viewing = IdentifiedInt(id: index)
        }
    }
}

private struct EmbedVideoTile: View {
    @Environment(\.theme) private var theme

    var body: some View {
        ZStack {
            Color.black
            Image("ph-play-fill")
                .font(.system(size: WZ.SizeIcon.lg, weight: .semibold))
                .foregroundStyle(theme.textOnAccent)
                .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                .background(theme.overlay, in: Circle())
        }
    }
}

private struct EmbedImageViewer: View {
    let url: String
    let title: String
    @State private var image: UIImage?

    var body: some View {
        ImageViewer(image: image, title: title)
            .task { image = await EmbedImageStore.shared.image(url) }
    }
}

@MainActor
private final class EmbedAudioModel: ObservableObject {
    @Published var isPlaying = false
    private(set) var item: AVPlayerItem?
    private var player: AVPlayer?

    func toggle(_ raw: String) {
        if isPlaying {
            pause()
            return
        }
        if player == nil {
            guard let url = EmbedURL.https(raw) else { return }
            // Play even with the silent switch on, but never touch the audio session during a call
            let session = AVAudioSession.sharedInstance()
            if session.category != .playAndRecord { try? session.setCategory(.playback) }
            let item = AVPlayerItem(url: url)
            self.item = item
            player = AVPlayer(playerItem: item)
        }
        player?.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func finished() {
        player?.seek(to: .zero)
        isPlaying = false
    }
}

private struct EmbedAudioRow: View {
    let media: LinkEmbedMedia
    let service: LinkEmbedService
    @StateObject private var model = EmbedAudioModel()
    @Environment(\.theme) private var theme

    var body: some View {
        Button { model.toggle(media.url) } label: {
            HStack(spacing: WZ.Space.space4) {
                Image(model.isPlaying ? "ph-pause-fill" : "ph-play-fill")
                    .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                    .foregroundStyle(theme.textOnAccent)
                    .frame(width: WZ.SizeControl.lg, height: WZ.SizeControl.lg)
                    .background(theme.accent, in: Circle())
                Text(verbatim: media.description ?? service.name)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(2)
                Spacer(minLength: 0)
            }
            .frame(minHeight: WZ.Size.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.format("timeline.linkEmbed.play", service.name))
        .onReceive(NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification)) { note in
            if let item = note.object as? AVPlayerItem, item === model.item { model.finished() }
        }
        .onDisappear { model.pause() }
    }
}

private struct EmbedButtons: View {
    let buttons: [LinkEmbedButton]
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: WZ.Space.space4) { all }
            VStack(alignment: .leading, spacing: WZ.Space.space4) { all }
        }
    }

    @ViewBuilder
    private var all: some View {
        ForEach(Array(buttons.enumerated()), id: \.offset) { _, button in
            Button {
                if let url = EmbedURL.https(button.url) { openURL(url) }
            } label: {
                Text(verbatim: button.label)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal, WZ.Space.space6)
                    .frame(minHeight: WZ.SizeControl.lg)
                    .background(theme.bgActive, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityHint(String(localized: "timeline.opensTheLink"))
        }
    }
}
