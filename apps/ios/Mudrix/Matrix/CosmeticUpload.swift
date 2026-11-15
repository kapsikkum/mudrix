import Foundation

/// Uploading your own decorations, effects, nameplates and profile frames into your personal pack
/// (`im.ponies.user_emotes`), as the web's `uploadUser*` and `deleteUser*` in `useUserPacks.ts`
enum CosmeticUpload {
    /// The largest picture taken for a custom cosmetic
    static let maxMegabytes = 5
    static var maxBytes: Int { maxMegabytes * 1024 * 1024 }

    enum Problem: Equatable { case unsupported, tooLarge }

    /// What a pack image's `usage` says it is, per kind
    static func usage(of kind: CosmeticKind) -> String {
        switch kind {
        case .decoration: return "profile_decoration"
        case .effect: return "profile_effect"
        case .nameplate: return "nameplate"
        case .profileFrame: return "profile_frame"
        }
    }

    /// The name a shortcode falls back to when the file name gives none
    static func fallbackName(of kind: CosmeticKind) -> String {
        switch kind {
        case .decoration: return "decoration"
        case .effect: return "effect"
        case .nameplate: return "nameplate"
        case .profileFrame: return "frame"
        }
    }

    /// PNG, APNG, GIF and WebP, from the file's ending; nil for anything else
    static func mimetype(fileName: String) -> String? {
        switch (fileName.split(separator: ".").last.map { String($0).lowercased() }) ?? "" {
        case "png", "apng": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        default: return nil
        }
    }

    static func check(mimetype: String?, size: Int) -> Problem? {
        if mimetype == nil { return .unsupported }
        return size > maxBytes ? .tooLarge : nil
    }

    /// The pack with one more image, and the shortcode it got. `pack` is the stored content, or nil when there is
    /// no personal pack yet; what is in it is kept as it is.
    static func adding(to pack: [String: Any]?, kind: CosmeticKind, fileName: String, url: String,
                       mimetype: String) -> (content: [String: Any], shortcode: String, name: String) {
        var content = pack ?? [:]
        if content["pack"] as? [String: Any] == nil {
            content["pack"] = ["display_name": "personal", "usage": ["emoticon", "sticker"]] as [String: Any]
        }
        var images = content["images"] as? [String: Any] ?? [:]
        let base = PackUpload.shortcode(fromFile: fileName, fallback: fallbackName(of: kind))
        var shortcode = base
        var counter = 1
        while images[shortcode] != nil {
            shortcode = "\(base)_\(counter)"
            counter += 1
        }
        var name = fileName
        if let dot = name.lastIndex(of: "."), dot != name.startIndex { name = String(name[..<dot]) }
        images[shortcode] = ["url": url, "usage": [usage(of: kind)], "body": name, "mimetype": mimetype] as [String: Any]
        content["images"] = images
        return (content, shortcode, name)
    }

    /// The pack without the image at `url`; nil when there is no pack or nothing matches
    static func removing(url: String, from pack: [String: Any]?) -> [String: Any]? {
        guard var content = pack, var images = content["images"] as? [String: Any] else { return nil }
        let matching = images.filter { ($0.value as? [String: Any])?["url"] as? String == url }.map { $0.key }
        guard !matching.isEmpty else { return nil }
        matching.forEach { images.removeValue(forKey: $0) }
        content["images"] = images
        return content
    }
}
