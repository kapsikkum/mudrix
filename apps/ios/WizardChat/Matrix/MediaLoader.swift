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

    func thumbnail(_ url: String, size: Int = 96) async -> UIImage? {
        await load(url) { client in
            try await client.thumbnail(mxc: url, width: size, height: size)
        }
    }

    func image(for source: MediaSource, thumbnailSize: Int?, animated: Bool) async -> UIImage? {
        let size = animated ? nil : thumbnailSize
        return await load("\(Self.key(source))|\(size ?? 0)|\(animated)", animated: animated) { client in
            try await client.media(source: source, width: size, height: size)
        }
    }

    private func location(for source: MediaSource, filename: String, mimetype: String?) -> (folder: URL, file: URL) {
        let folder = files.appendingPathComponent(Self.key(source).addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? UUID().uuidString)
        return (folder, folder.appendingPathComponent(Self.safeName(filename, mimetype: mimetype)))
    }

    func file(for source: MediaSource, filename: String, mimetype: String?) async throws -> URL {
        let place = location(for: source, filename: filename, mimetype: mimetype)
        if FileManager.default.fileExists(atPath: place.file.path) { return place.file }
        let data = try await client.media(source: source)
        try FileManager.default.createDirectory(at: place.folder, withIntermediateDirectories: true)
        try data.write(to: place.file, options: [.atomic, .completeFileProtection])
        return place.file
    }

    /// The file when it has been downloaded already
    func cachedFile(for source: MediaSource, filename: String, mimetype: String?) -> URL? {
        let url = location(for: source, filename: filename, mimetype: mimetype).file
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Like `file(for:)`, but tells how much has arrived and can be stopped with `cancelDownload(token:)`
    /// (the call then throws). `token` must be unique to this download.
    func downloadFile(for source: MediaSource, filename: String, mimetype: String?, sizeHint: Int?, token: String,
                      progress: @escaping @MainActor (DownloadProgress) -> Void) async throws -> URL {
        let place = location(for: source, filename: filename, mimetype: mimetype)
        if FileManager.default.fileExists(atPath: place.file.path) { return place.file }
        let data = try await client.mediaDownload(source: source, sizeHint: sizeHint, token: token) { update in
            Task { @MainActor in progress(update) }
        }
        try FileManager.default.createDirectory(at: place.folder, withIntermediateDirectories: true)
        try data.write(to: place.file, options: [.atomic, .completeFileProtection])
        return place.file
    }

    func cancelDownload(token: String) {
        let client = client
        Task { try? await client.cancelMediaDownload(token: token) }
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
