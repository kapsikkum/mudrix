import Foundation
import MudrixCore

/// A GIF service the picker and the link embeds can talk to, the web's `gifProviders/types.ts`
enum GifProvider: String, CaseIterable, Identifiable {
    case giphy
    case klipy

    var id: String { rawValue }

    /// What the tab and the credit line call it (a brand name, the same in every language)
    var title: String { self == .giphy ? "GIPHY" : "KLIPY" }

    /// Set at build time (GIPHY_API_KEY / KLIPY_API_KEY, see docs/SECRETS.md); empty means this provider is off
    var key: String {
        switch self {
        case .giphy: return GifProviders.giphy
        case .klipy: return GifProviders.klipy
        }
    }

    var isConfigured: Bool { !key.isEmpty }
}

/// The build-time keys, read from the Info.plist the build settings fill in
enum GifProviders {
    static let giphy = value("WZGiphyApiKey")
    static let klipy = value("WZKlipyApiKey")

    private static func value(_ name: String) -> String {
        let raw = (Bundle.main.object(forInfoDictionaryKey: name) as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        // An unset build setting arrives as "$(KLIPY_API_KEY)" rather than empty
        return raw.hasPrefix("$(") ? "" : raw
    }
}

/// KLIPY's trending, search and by-slug calls, the web's `gifProviders/klipy.ts`. GIPHY is asked from the picker
/// itself; both hand back the same `GiphyGif` the composer has always sent.
enum GifApi {
    /// One page of trending or searched GIFs
    static let pageSize = 24
    /// The largest GIF the picker will offer: bigger ones are skipped, as on the web
    static let maxGifBytes = 25 * 1024 * 1024

    private static let sendOrder = ["md", "hd", "sm"]
    private static let thumbOrder = ["sm", "xs", "md"]

    /// Accept only https URLs on klipy.com or its subdomains
    static func isAllowedKlipyUrl(_ raw: String) -> Bool {
        guard let url = URL(string: raw), url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else {
            return false
        }
        return host == "klipy.com" || host.hasSuffix(".klipy.com")
    }

    static func klipyUrl(path: String, query: [URLQueryItem] = []) -> URL? {
        guard GifProvider.klipy.isConfigured else { return nil }
        var parts = URLComponents()
        parts.scheme = "https"
        parts.host = "api.klipy.com"
        parts.path = "/api/v1/\(GifProvider.klipy.key)/gifs/\(path)"
        parts.queryItems = query
        return parts.url
    }

    /// The GIFs in a KLIPY answer, and whether another page follows
    static func klipyItems(_ json: JSONValue) -> (items: [GiphyGif], hasNext: Bool) {
        let list = json["data"]?["data"]?.array ?? []
        var seen = Set<String>()
        var items: [GiphyGif] = []
        for raw in list {
            guard let item = klipyItem(raw), !seen.contains(item.id) else { continue }
            seen.insert(item.id)
            items.append(item)
        }
        return (items, json["data"]?["has_next"]?.bool == true)
    }

    /// One KLIPY GIF: the smallest file that still plays, and a thumbnail for the grid
    static func klipyItem(_ raw: JSONValue) -> GiphyGif? {
        guard let object = raw.object else { return nil }
        if let type = object["type"]?.string, type != "gif" { return nil }
        guard let identifier = identifier(object["id"]), !identifier.isEmpty,
              let file = object["file"]?.object else { return nil }
        guard let send = pick(file, sendOrder), let thumb = pick(file, thumbOrder) else { return nil }
        guard send.size <= maxGifBytes else { return nil }
        let title = object["title"]?.string ?? ""
        return GiphyGif(id: identifier, title: title, url: send.url, previewUrl: thumb.url,
                        width: thumb.width > 0 ? thumb.width : send.width,
                        height: thumb.height > 0 ? thumb.height : send.height)
    }

    /// A KLIPY id is a string, but its API sometimes sends a number
    private static func identifier(_ value: JSONValue?) -> String? {
        if let text = value?.string { return text }
        if let number = value?.number, number.isFinite, number.magnitude < 1e15 { return String(Int(number)) }
        return nil
    }

    private struct Rendition {
        let url: String
        let width: Int
        let height: Int
        let size: Int
    }

    private static func pick(_ file: [String: JSONValue], _ order: [String]) -> Rendition? {
        for size in order {
            guard let gif = file[size]?["gif"]?.object, let url = gif["url"]?.string,
                  isAllowedKlipyUrl(url) else { continue }
            return Rendition(url: url, width: number(gif["width"]), height: number(gif["height"]),
                             size: number(gif["size"]))
        }
        return nil
    }

    private static func number(_ value: JSONValue?) -> Int {
        guard let value else { return 0 }
        if let text = value.string { return Int(Double(text) ?? 0) }
        guard let number = value.number, number.isFinite, number.magnitude < 1e9 else { return 0 }
        return Int(number)
    }

    // MARK: Calls

    /// KLIPY's trending GIFs, empty when the provider is off or the call fails
    static func klipyTrending() async -> [GiphyGif] {
        await klipy(page: "trending", query: [])
    }

    /// KLIPY's search results, empty when the provider is off or the call fails
    static func klipySearch(_ text: String) async -> [GiphyGif] {
        await klipy(page: "search", query: [URLQueryItem(name: "q", value: text.trimmingCharacters(in: .whitespaces))])
    }

    private static func klipy(page: String, query: [URLQueryItem]) async -> [GiphyGif] {
        let items = [URLQueryItem(name: "per_page", value: String(pageSize)), URLQueryItem(name: "page", value: "1")]
        guard let url = klipyUrl(path: page, query: query + items),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let body = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
        return klipyItems(body).items
    }

    /// The GIF behind a KLIPY page link (`klipy.com/gifs/<slug>`), which only its API can name
    static func klipyBySlug(_ slug: String) async -> GiphyGif? {
        guard let url = klipyUrl(path: "items", query: [URLQueryItem(name: "slugs", value: slug)]),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let body = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
        return klipyItems(body).items.first
    }
}
