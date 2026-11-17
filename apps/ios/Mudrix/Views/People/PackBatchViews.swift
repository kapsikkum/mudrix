import ImageIO
import MudrixCore
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// One picture picked for a pack. Its bytes are read only when it is about to be uploaded, so a long list does
/// not sit in memory.
struct PackPick: Identifiable {
    /// Identifies the file across attempts (a retry or resume does not upload it twice)
    let id: String
    /// What its shortcode is made from
    let name: String
    let load: @Sendable () async throws -> Data
}

/// A file that is not a picture the pack can hold
struct UnsupportedPackFile: Error, LocalizedError {
    var errorDescription: String? { String(localized: "room.settings.emojis.unsupportedFormat") }
}

enum PackImageFile {
    static let supported = ["image/png", "image/jpeg", "image/gif", "image/webp"]

    /// The bytes to upload, their type and size in pixels. HEIC and other formats the pack cannot hold are
    /// converted to PNG; nil for what is not a picture.
    static func prepare(_ data: Data) -> (data: Data, mimetype: String, width: Int?, height: Int?)? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(source) else {
            return nil
        }
        var bytes = data
        var mimetype = UTType(type as String)?.preferredMIMEType ?? ""
        if !supported.contains(mimetype) {
            guard let image = UIImage(data: data), let png = image.pngData() else { return nil }
            bytes = png
            mimetype = "image/png"
        }
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let width = properties?[kCGImagePropertyPixelWidth] as? Int
        let height = properties?[kCGImagePropertyPixelHeight] as? Int
        return (bytes, mimetype, width, height)
    }
}

/// A batch of pack pictures going up: four at a time, retried on a rate limit, cancellable, and resumable (what
/// is already up is not sent again)
@MainActor
final class PackBatchUploader: ObservableObject {
    enum Phase: Equatable { case idle, running, cancelled, finished }

    @Published private(set) var phase = Phase.idle
    @Published private(set) var completed = 0
    @Published private(set) var total = 0
    @Published private(set) var failed = 0

    private var picks: [PackPick] = []
    private var codes: [String] = []
    private let ledger = PackUploadLedger()
    private var task: Task<Void, Never>?
    private var client: MudrixClient?
    private var finished: (([(shortcode: String, image: UploadedPackImage)]) async -> Void)?
    private var scopedUrls: [URL] = []

    /// Shortcodes the batch will use, one per picture, none of them in `taken`
    static func shortcodes(for names: [String], taken: Set<String>) -> [String] {
        var used = taken
        return names.map { name in
            let code = PackUpload.uniqueShortcode(PackUpload.shortcode(fromFile: name), taken: used)
            used.insert(code)
            return code
        }
    }

    /// Starts a new batch; `finished` gets every picture that is up when a run ends (also after a cancel or failures)
    func begin(_ picks: [PackPick], taken: Set<String>, client: MudrixClient, scopedUrls: [URL] = [],
               finished: @escaping ([(shortcode: String, image: UploadedPackImage)]) async -> Void) {
        guard phase != .running, !picks.isEmpty else { return }
        releaseScopes()
        self.picks = picks
        codes = Self.shortcodes(for: picks.map(\.name), taken: taken)
        self.client = client
        self.finished = finished
        self.scopedUrls = scopedUrls
        total = picks.count
        completed = 0
        failed = 0
        Task { await ledger.clear() }
        run()
    }

    /// Runs again: what is up stays, only the failed and the not started are sent
    func retryOrResume() {
        guard phase == .cancelled || (phase == .finished && failed > 0) else { return }
        run()
    }

    func cancel() {
        task?.cancel()
    }

    /// Forgets the batch (the picker closed)
    func reset() {
        task?.cancel()
        releaseScopes()
        picks = []
        codes = []
        phase = .idle
        completed = 0
        total = 0
        failed = 0
    }

    private func releaseScopes() {
        scopedUrls.forEach { $0.stopAccessingSecurityScopedResource() }
        scopedUrls = []
    }

    private func run() {
        guard let client else { return }
        phase = .running
        let keys = picks.map(\.id)
        let picks = picks
        let ledger = ledger
        task = Task { [weak self] in
            let outcome = await PackUpload.run(keys: keys, ledger: ledger, upload: { index in
                try await PackUpload.withRateLimitRetry {
                    try Task.checkCancellation()
                    let raw = try await picks[index].load()
                    guard let prepared = PackImageFile.prepare(raw) else { throw UnsupportedPackFile() }
                    let url = try await client.uploadMedia(data: prepared.data, mimetype: prepared.mimetype)
                    return UploadedPackImage(url: url, mimetype: prepared.mimetype, size: prepared.data.count,
                                             width: prepared.width, height: prepared.height)
                }
            }, onProgress: { done, all, failures in
                Task { @MainActor in self?.progress(done, all, failures) }
            })
            await self?.end(outcome)
        }
    }

    private func progress(_ done: Int, _ all: Int, _ failures: Int) {
        completed = done
        total = all
        failed = failures
    }

    private func end(_ outcome: PackUpload.Outcome) async {
        failed = outcome.failedCount
        phase = outcome.cancelled ? .cancelled : .finished
        var results: [(shortcode: String, image: UploadedPackImage)] = []
        for (index, image) in outcome.uploaded.enumerated() where index < codes.count {
            if let image { results.append((codes[index], image)) }
        }
        completed = results.count + failed
        if phase == .finished && failed == 0 { releaseScopes() }
        await finished?(results)
    }
}

/// "Add images": pictures from the library or the Files app, then progress with Cancel, Retry and Resume
struct PackBatchControls: View {
    @ObservedObject var uploader: PackBatchUploader
    /// The shortcodes already in the pack, so new ones do not clash
    let taken: () -> Set<String>
    let onFinished: ([(shortcode: String, image: UploadedPackImage)]) async -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var photos: [PhotosPickerItem] = []
    @State private var showFiles = false

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space4) {
            HStack(spacing: WZ.Space.space6) {
                PhotosPicker(selection: $photos, maxSelectionCount: 50, matching: .images) {
                    Label(String(localized: "settings.emojisStickers.upload"), image: "ph-images-regular")
                        .minTouchTarget()
                }
                Button { showFiles = true } label: {
                    Label(String(localized: "room.settings.emojis.addImages"), image: "ph-file-regular")
                        .minTouchTarget()
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
            }
            .foregroundStyle(theme.accent)
            .disabled(uploader.phase == .running)
            status
        }
        .onChange(of: photos) { _, items in
            guard !items.isEmpty else { return }
            let picks = items.enumerated().map { index, item in
                PackPick(id: item.itemIdentifier ?? "photo-\(UUID().uuidString)-\(index)", name: "image", load: {
                    guard let data = try await item.loadTransferable(type: Data.self) else { throw UnsupportedPackFile() }
                    return data
                })
            }
            photos = []
            start(picks, scoped: [])
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.image], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            var scoped: [URL] = []
            let picks = urls.map { url -> PackPick in
                if url.startAccessingSecurityScopedResource() { scoped.append(url) }
                let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
                let stamp = Int((values?.contentModificationDate ?? .distantPast).timeIntervalSince1970)
                // The web's `fileResumeKey`: name, size and modified time
                let key = "\(url.lastPathComponent):\(values?.fileSize ?? 0):\(stamp)"
                return PackPick(id: key, name: url.lastPathComponent, load: { try Data(contentsOf: url) })
            }
            start(picks, scoped: scoped)
        }
        .onDisappear { if uploader.phase != .running { uploader.reset() } }
    }

    private func start(_ picks: [PackPick], scoped: [URL]) {
        guard let client = session.client else { return }
        uploader.begin(picks, taken: taken(), client: client, scopedUrls: scoped, finished: onFinished)
    }

    @ViewBuilder
    private var status: some View {
        switch uploader.phase {
        case .idle:
            EmptyView()
        case .running:
            HStack(spacing: WZ.Space.space5) {
                ProgressView(value: Double(uploader.completed), total: Double(max(uploader.total, 1))).tint(theme.accent)
                Button(String(localized: "common.cancel")) { uploader.cancel() }
                    .buttonStyle(.borderless)
            }
            Text(L10n.format("room.settings.emojis.uploadingProgress", uploader.completed, uploader.total))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
        case .cancelled:
            Text(L10n.format("room.settings.emojis.uploadCancelled", uploader.completed - uploader.failed, uploader.total))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
            Button(String(localized: "room.settings.emojis.resumeUpload")) { uploader.retryOrResume() }
                .buttonStyle(.borderless)
        case .finished:
            if uploader.failed > 0 {
                Text(L10n.plural("room.settings.emojis.uploadFailedSome", count: uploader.failed, uploader.failed))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.error)
                Button(L10n.plural("room.settings.emojis.retryFailed", count: uploader.failed, uploader.failed)) {
                    uploader.retryOrResume()
                }
                .buttonStyle(.borderless)
            }
        }
    }
}

/// "Upload & create pack": a name and pictures; the pictures go up, then the pack is saved, as several packs
/// when it would not fit one state event
struct NewPackFromImagesSheet: View {
    let roomId: String
    /// The state keys already used by this room's packs
    let takenKeys: Set<String>
    let onCreated: () async -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var uploader = PackBatchUploader()
    @State private var name = ""
    @State private var error: String?
    @State private var saving = false

    private var target: String {
        let isSpace = session.roomList?.spaces.contains { $0.id == roomId } == true
        return String(localized: isSpace ? "room.settings.emojis.targetSpace" : "room.settings.emojis.targetRoom")
    }

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    TextField(String(localized: "room.settings.emojis.packNamePlaceholder"), text: $name)
                } header: {
                    Text(String(localized: "room.settings.emojis.packName"))
                }
                Section {
                    PackBatchControls(uploader: uploader, taken: { [] }) { results in
                        await save(results)
                    }
                    .disabled(cleanName.isEmpty || saving)
                } footer: {
                    if cleanName.isEmpty { Text(String(localized: "room.settings.emojis.packName")) }
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .tint(theme.control)
            .navigationTitle(String(localized: "room.settings.emojis.uploadAndCreate"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) {
                        uploader.reset()
                        dismiss()
                    }
                }
            }
        }
    }

    private var cleanName: String { name.trimmingCharacters(in: .whitespaces) }

    /// Saves the pack from what is up so far. Only a complete batch is saved: with failures or a cancel the
    /// pictures stay up and Retry or Resume finishes it, then this runs again.
    private func save(_ results: [(shortcode: String, image: UploadedPackImage)]) async {
        guard uploader.phase == .finished, uploader.failed == 0, !results.isEmpty, !saving else { return }
        saving = true
        defer { saving = false }
        var images: [String: Any] = [:]
        for result in results { images[result.shortcode] = result.image.entry(shortcode: result.shortcode) }
        let base: [String: Any] = [
            "pack": ["display_name": cleanName, "usage": ["emoticon", "sticker"]] as [String: Any],
            "images": images,
        ]
        let parts = PackSize.split(base)
        let key = PackUpload.uniqueShortcode(cleanName.lowercased().replacingOccurrences(of: " ", with: "_"), taken: takenKeys)
        do {
            for (index, var part) in parts.enumerated() {
                var pack = part["pack"] as? [String: Any] ?? [:]
                pack["display_name"] = PackSize.numberedName(cleanName, index: index, total: parts.count)
                part["pack"] = pack
                try await session.setStateEvent(RoomPacksView.packType, key: PackSize.partKey(key, index: index), content: part,
                                                in: roomId)
            }
            ImagePacks.forget(roomId: roomId)
            CopyToast.shared.show(L10n.format("room.settings.emojis.uploadPackDone", cleanName, results.count, parts.count, target))
            await onCreated()
            uploader.reset()
            dismiss()
        } catch {
            self.error = PackSize.isTooLarge(error)
                ? L10n.format("room.settings.emojis.serverTooLarge")
                : L10n.format("room.settings.emojis.createFailed", error.localizedDescription)
        }
    }
}
