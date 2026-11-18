import UIKit
import UniformTypeIdentifiers
import MudrixCore

@MainActor
final class MediaLoader {
    let client: MudrixClient
    private let cache = NSCache<NSString, UIImage>()
    private var inFlight: [String: Task<UIImage?, Never>] = [:]
    /// Each account decrypts into a folder of its own, so switching accounts never shows the
    /// previous one's pictures (the folder is dropped when that account signs out).
    private let files: URL

    init(client: MudrixClient, userId: String) {
        self.client = client
        self.files = Self.root.appendingPathComponent(AccountScope.folderName(userId), isDirectory: true)
        Self.removeOldLayout()
    }

    private static var root: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("media", isDirectory: true)
    }

    /// The cache used to be one folder per media key, readable by whichever account was signed
    /// in; those folders (not the per-account ones) are dropped when a loader starts.
    private static func removeOldLayout() {
        let root = Self.root
        Task.detached(priority: .utility) {
            guard let entries = try? FileManager.default.contentsOfDirectory(
                at: root, includingPropertiesForKeys: [.isDirectoryKey]) else { return }
            for entry in entries where !entry.lastPathComponent.hasPrefix("user-") {
                let values = try? entry.resourceValues(forKeys: [.isDirectoryKey])
                guard values?.isDirectory == true else { continue }
                try? FileManager.default.removeItem(at: entry)
            }
        }
    }

    /// Drops the decrypted media cached for an account that signs out or is switched away from.
    static func purge(account userId: String) {
        try? FileManager.default.removeItem(
            at: root.appendingPathComponent(AccountScope.folderName(userId), isDirectory: true))
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

    private func location(for source: MediaSource, filename: String, mimetype: String?) -> (folder: URL, file: URL) {
        let folder = files.appendingPathComponent(Self.key(source).addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? UUID().uuidString)
        return (folder, folder.appendingPathComponent(Self.safeName(filename, mimetype: mimetype)))
    }

    func file(for source: MediaSource, filename: String, mimetype: String?) async throws -> URL {
        let place = location(for: source, filename: filename, mimetype: mimetype)
        if FileManager.default.fileExists(atPath: place.file.path) { return place.file }
        let data = try await client.media(source: source)
        try FileManager.default.createDirectory(at: place.folder, withIntermediateDirectories: true,
                                                attributes: [.protectionKey: FileProtectionType.complete])
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
        try FileManager.default.createDirectory(at: place.folder, withIntermediateDirectories: true,
                                                attributes: [.protectionKey: FileProtectionType.complete])
        try data.write(to: place.file, options: [.atomic, .completeFileProtection])
        return place.file
    }

    func cancelDownload(token: String) {
        let client = client
        Task { try? await client.cancelMediaDownload(token: token) }
    }

    /// Drops the signed-in account's pictures and files (Settings > Developer's "Clear media cache");
    /// signing out drops them too, through `purge(account:)`
    func clearCache() {
        cache.removeAllObjects()
        thumbnailSizes.removeAll()
        inFlight.removeAll()
        try? FileManager.default.removeItem(at: files)
    }

    private func load(_ key: String, animated: Bool = false, fetch: @escaping (MudrixClient) async throws -> Data) async -> UIImage? {
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
