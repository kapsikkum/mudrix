import Foundation

/// A message that is nothing but one GIPHY or KLIPY link, the web's `gifProviders/links.ts` and Android's
/// `media/GifLink.kt`. Only a body that is nothing but one such link counts; text around it, other hosts and
/// lookalike domains stay an ordinary message.
enum GifLink: Equatable {
    case giphy(id: String)
    case klipySlug(slug: String)
    case klipyMedia(url: String)

    /// The provider the link points at, for the consent check (`giphy` or `klipy`)
    var provider: String {
        switch self {
        case .giphy: return GifProvider.giphy.id
        case .klipySlug, .klipyMedia: return GifProvider.klipy.id
        }
    }

    private static let giphyIdPattern = "^[A-Za-z0-9]{6,32}$"
    private static let klipySlugPattern = "^[a-z0-9][a-z0-9_-]{0,200}$"
    private static let mediaHostPattern = "^media[0-9]*\\.giphy\\.com$"

    static func parse(_ text: String) -> GifLink? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains(where: { $0.isWhitespace }) else { return nil }
        // Matrix shows a bare URL in angle brackets sometimes ("<https://…>")
        var bare = trimmed
        if bare.hasPrefix("<"), bare.hasSuffix(">"), bare.count > 2 {
            bare = String(bare.dropFirst().dropLast())
        }
        guard let url = URL(string: bare),
              url.scheme?.lowercased() == "https",
              url.user == nil, url.password == nil,
              let host = url.host?.lowercased() else { return nil }
        let parts = url.path.split(separator: "/").map(String.init).filter { !$0.isEmpty }

        if let id = giphyId(host: host, parts: parts) { return .giphy(id: id) }

        if host == "klipy.com" || host == "www.klipy.com" {
            guard let at = parts.firstIndex(of: "gifs"), at + 1 < parts.count else { return nil }
            let slug = parts[at + 1]
            return matches(slug, Self.klipySlugPattern) ? .klipySlug(slug: slug) : nil
        }
        if host.hasSuffix(".klipy.com"), GifApi.isAllowedKlipyUrl(bare),
           url.path.lowercased().hasSuffix(".gif") {
            return .klipyMedia(url: bare)
        }
        return nil
    }

    /// The GIF a link points at without asking the provider: a GIPHY id has a stable media URL, and a direct KLIPY
    /// file URL is the GIF itself. A KLIPY page link needs the provider's API (see `GifApi.klipyBySlug`).
    static func direct(_ link: GifLink, title: String = "GIF") -> GiphyGif? {
        switch link {
        case .giphy(let id):
            let url = "https://media.giphy.com/media/\(id)/giphy.gif"
            return GiphyGif(id: id, title: title, url: url, previewUrl: url, width: 0, height: 0)
        case .klipyMedia(let url):
            return GiphyGif(id: url, title: title, url: url, previewUrl: url, width: 0, height: 0)
        case .klipySlug:
            return nil
        }
    }

    /// Whether the link can only be resolved through the provider's API (a KLIPY page link)
    var needsApi: Bool {
        if case .klipySlug = self { return true }
        return false
    }

    /// The page slug of a `klipy.com/gifs/<slug>` link, when that is what it is
    var klipySlug: String? {
        if case .klipySlug(let slug) = self { return slug }
        return nil
    }

    /// What to remember the resolved GIF by, so a redrawn row does not ask again
    var cacheKey: String {
        switch self {
        case .giphy(let id): return "giphy:\(id)"
        case .klipySlug(let slug): return "klipy:\(slug)"
        case .klipyMedia(let url): return "media:\(url)"
        }
    }

    private static func giphyId(host: String, parts: [String]) -> String? {
        let first = parts.first
        let second: String? = parts.count > 1 ? parts[1] : nil
        if host == "i.giphy.com" {
            let raw = first == "media" ? second : first
            let id = raw?.replacingOccurrences(of: "\\.gif$", with: "", options: [.regularExpression, .caseInsensitive])
            return id.flatMap { matches($0, giphyIdPattern) ? $0 : nil }
        }
        if matches(host, mediaHostPattern) {
            guard first == "media", let second, matches(second, giphyIdPattern) else { return nil }
            return second
        }
        if host == "giphy.com" || host == "www.giphy.com", first == "gifs" || first == "embed" {
            // /gifs/some-title-<id> or /gifs/<id>
            let id = second?.split(separator: "-").last.map(String.init)
            return id.flatMap { matches($0, giphyIdPattern) ? $0 : nil }
        }
        return nil
    }

    private static func matches(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }
}
