import Foundation

/// A link to a single YouTube video; `start` is the offset in seconds from `t=` / `start=`
struct YouTubeVideo: Equatable {
    let id: String
    let start: Int
}

/// Recognises YouTube links the way the web's `util/youtube.ts` and Android's `YouTubeLink` do
enum YouTubeLink {
    static func isVideoId(_ text: String) -> Bool {
        text.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil
    }

    /// "90", "90s" or "1h2m3s" -> seconds
    static func timestamp(_ raw: String?) -> Int {
        guard let raw, !raw.isEmpty else { return 0 }
        if raw.range(of: #"^\d+s?$"#, options: .regularExpression) != nil {
            return Int(raw.trimmingCharacters(in: CharacterSet(charactersIn: "s"))) ?? 0
        }
        guard let regex = try? NSRegularExpression(pattern: #"^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$"#) else { return 0 }
        let text = raw as NSString
        guard let match = regex.firstMatch(in: raw, range: NSRange(location: 0, length: text.length)) else { return 0 }
        func part(_ index: Int) -> Int {
            let range = match.range(at: index)
            return range.location == NSNotFound ? 0 : Int(text.substring(with: range)) ?? 0
        }
        return part(1) * 3600 + part(2) * 60 + part(3)
    }

    /// The video behind a watch, youtu.be, shorts, embed or live link, or nil
    static func parse(_ raw: String) -> YouTubeVideo? {
        guard let components = URLComponents(string: raw), let scheme = components.scheme?.lowercased(),
              scheme == "https" || scheme == "http", let rawHost = components.host?.lowercased() else { return nil }
        let host = rawHost.replacingOccurrences(of: "^(www|m)\\.", with: "", options: .regularExpression)
        let parts = components.path.split(separator: "/").map(String.init)
        let items = components.queryItems ?? []
        func param(_ name: String) -> String? { items.first { $0.name == name }?.value }
        var id: String?
        if host == "youtu.be" {
            id = parts.first
        } else if host == "youtube.com" || host == "youtube-nocookie.com" {
            switch parts.first ?? "" {
            case "watch": id = param("v")
            case "shorts", "embed", "live", "v": id = parts.count > 1 ? parts[1] : nil
            default: id = nil
            }
        }
        guard let id, isVideoId(id) else { return nil }
        return YouTubeVideo(id: id, start: timestamp(param("t") ?? param("start")))
    }

    /// The privacy-enhanced player; nothing is requested from YouTube before this is loaded
    static func embedUrl(_ video: YouTubeVideo) -> String {
        "https://www.youtube-nocookie.com/embed/\(video.id)?autoplay=1&rel=0&playsinline=1"
            + (video.start > 0 ? "&start=\(video.start)" : "")
    }
}
