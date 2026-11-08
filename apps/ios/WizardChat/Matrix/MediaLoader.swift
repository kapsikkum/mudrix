import UIKit
import UniformTypeIdentifiers
import WizardChatCore

@MainActor
final class MediaLoader {
    let client: WizardClient
    private let cache = NSCache<NSString, UIImage>()
    private var inFlight: [String: Task<UIImage?, Never>] = [:]
    private let files = FileManager.default.temporaryDirectory.appendingPathComponent("media", isDirectory: true)

    init(client: WizardClient) {
        self.client = client
    }

    func cachedThumbnail(_ key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func store(_ image: UIImage, for key: String) {
        cache.setObject(image, forKey: key as NSString)
    }

    private var thumbnailSizes: [String: Int] = [:]

    static func standardSize(_ size: Int) -> Int { [96, 320, 640, 800].first { $0 >= size } ?? 800 }

    func thumbnail(_ url: String, size: Int = 96) async -> UIImage? {
        let pixels = Self.standardSize(size)
        if let cached = cachedThumbnail(url), thumbnailSizes[url, default: 0] >= pixels { return cached }
        let image = await load("\(url)|\(pixels)") { client in
            try await client.thumbnail(mxc: url, width: pixels, height: pixels, crop: pixels == 96 ? true : nil)
        }
        if let image, thumbnailSizes[url, default: 0] < pixels {
            store(image, for: url)
            thumbnailSizes[url] = pixels
        }
        return image ?? cachedThumbnail(url)
    }

    func image(for source: MediaSource, thumbnailSize: Int?, animated: Bool) async -> UIImage? {
        let size = animated ? nil : thumbnailSize
        return await load("\(Self.key(source))|\(size ?? 0)|\(animated)", animated: animated) { client in
            try await client.media(source: source, width: size, height: size)
        }
    }

    func file(for source: MediaSource, filename: String, mimetype: String?) async throws -> URL {
        let folder = files.appendingPathComponent(Self.key(source).addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? UUID().uuidString)
        let url = folder.appendingPathComponent(Self.safeName(filename, mimetype: mimetype))
        if FileManager.default.fileExists(atPath: url.path) { return url }
        let data = try await client.media(source: source)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    private func load(_ key: String, animated: Bool = false, fetch: @escaping (WizardClient) async throws -> Data) async -> UIImage? {
        if let image = cachedThumbnail(key) { return image }
        if let task = inFlight[key] { return await task.value }
        let client = client
        let task = Task<UIImage?, Never> {
            guard let data = try? await fetch(client) else { return nil }
            return AnimatedImage.image(from: data, animated: animated)
        }
        inFlight[key] = task
        let image = await task.value
        inFlight[key] = nil
        if let image { store(image, for: key) }
        return image
    }

    private static func safeName(_ filename: String, mimetype: String?) -> String {
        var name = filename.replacingOccurrences(of: "/", with: "-").trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { name = "file" }
        if let mimetype, let type = UTType(mimeType: mimetype), let ext = type.preferredFilenameExtension,
           UTType(filenameExtension: (name as NSString).pathExtension)?.conforms(to: type) != true {
            name += ".\(ext)"
        }
        return name
    }

    static func key(_ source: MediaSource) -> String {
        source["url"]?.string ?? source["file"]?["url"]?.string ?? "\(source.hashValue)"
    }
}
