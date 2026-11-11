import Photos
import WizardChatCore
import SwiftUI

struct SpoilerCover: View {
    let reason: String
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: WZ.Space.space3) {
            if !reason.isEmpty {
                Text(reason)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            }
            Label(String(localized: "timeline.spoilerMedia"), image: "ph-eye-slash-regular")
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textOnAccent)
                .padding(.horizontal, WZ.Space.space4)
                .padding(.vertical, WZ.Space.space2)
                .background(theme.overlay, in: Capsule())
        }
        .padding(WZ.Space.space4)
        .accessibilityElement(children: .combine)
        .accessibilityHint(String(localized: "timeline.tapToReveal"))
    }
}

extension MessageText {
    static func hidingSpoilers(_ text: AttributedString, spoilers: [String], cover: Color) -> AttributedString {
        guard !spoilers.isEmpty else { return text }
        var result = text
        for spoiler in spoilers {
            var searchStart = result.startIndex
            while searchStart < result.endIndex,
                  let range = result[searchStart...].range(of: spoiler) {
                result[range].foregroundColor = .clear
                result[range].backgroundColor = cover
                result[range].link = nil
                searchStart = range.upperBound
            }
        }
        return result
    }
}

struct GalleryGridView: View {
    let items: [ChatEntry]
    var isPrivateRoom = true

    @State private var openIndex: Int?
    private static let maxVisible = 8
    private let width: CGFloat = 260
    private let spacing: CGFloat = 3

    private var media: [(entry: ChatEntry, media: ChatEntry.MediaContent)] {
        items.compactMap { entry in
            if case .image(let media) = entry.kind { return (entry, media) }
            return nil
        }
    }

    var body: some View {
        let all = media
        let visible = Array(all.prefix(Self.maxVisible))
        let extra = all.count - visible.count
        let columns = visible.count <= 2 ? visible.count : (visible.count == 4 ? 2 : 3)
        let tile = (width - spacing * CGFloat(columns - 1)) / CGFloat(columns)
        LazyVGrid(columns: Array(repeating: GridItem(.fixed(tile), spacing: spacing), count: columns),
                  spacing: spacing) {
            ForEach(Array(visible.enumerated()), id: \.element.entry.id) { index, item in
                GalleryTile(media: item.media, spoiler: item.entry.mediaSpoiler, isPrivateRoom: isPrivateRoom,
                            moreCount: index == visible.count - 1 && extra > 0 ? extra : 0) {
                    openIndex = index
                }
                .frame(width: tile, height: tile)
            }
        }
        .frame(width: width, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .fullScreenCover(item: Binding(get: { openIndex.map(IdentifiedInt.init) }, set: { openIndex = $0?.id })) { start in
            MediaPagerView(items: all.map(\.media), startIndex: start.id)
        }
        .accessibilityLabel(L10n.format("timeline.photos", all.count))
    }
}

struct IdentifiedInt: Identifiable { let id: Int }

private struct GalleryTile: View {
    let media: ChatEntry.MediaContent
    let spoiler: String?
    let isPrivateRoom: Bool
    let moreCount: Int
    let onOpen: () -> Void

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var image: UIImage?
    @State private var revealed = false

    private var hidden: Bool {
        guard !revealed else { return false }
        if spoiler != nil { return true }
        switch prefs.mediaVisibility {
        case .always: return false
        case .private: return !isPrivateRoom
        case .never: return true
        }
    }

    var body: some View {
        ZStack {
            theme.fill
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            }
            if hidden {
                Rectangle().fill(.thinMaterial)
                Image(spoiler != nil ? "ph-eye-slash-regular" : "ph-eye-regular")
                    .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
            } else if moreCount > 0 {
                Rectangle().fill(theme.overlay)
                Text("+\(moreCount)")
                    .font(.wizard(WZ.FontSize.xxl, .bold))
                    .foregroundStyle(theme.textOnAccent)
            }
        }
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture { if hidden { withAnimation { revealed = true } } else { onOpen() } }
        .task(id: hidden) {
            guard !hidden, let mediaLoader else { return }
            image = await mediaLoader.image(for: media.thumbnail ?? media.source, thumbnailSize: 400, animated: false)
        }
    }
}

/// The viewer's black backdrop, fading while a picture is dragged away
private struct MediaBackdrop: View {
    @ObservedObject var progress: MediaDismissProgress
    @Environment(\.theme) private var theme

    var body: some View {
        theme.overlay.opacity(1 - progress.value * 0.85).ignoresSafeArea()
    }
}

struct MediaPagerView: View {
    let items: [ChatEntry.MediaContent]
    let startIndex: Int
    var isVideo: [Bool] = []

    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @Environment(\.mediaLoader) private var mediaLoader
    @State private var scrollId: Int?
    @State private var isZoomed = false
    @State private var barsHidden = false
    @State private var menuOpen = false
    @State private var saving = false
    @State private var saveResult: String?
    @StateObject private var dismissProgress = MediaDismissProgress()

    init(items: [ChatEntry.MediaContent], startIndex: Int, isVideo: [Bool] = []) {
        self.items = items
        self.startIndex = startIndex
        self.isVideo = isVideo
        _scrollId = State(initialValue: startIndex)
    }

    private var index: Int { scrollId ?? startIndex }

    private func isVideoItem(_ position: Int) -> Bool {
        isVideo.indices.contains(position) && isVideo[position]
    }

    private var photoCount: Int {
        items.indices.filter { !isVideoItem($0) }.count
    }

    var body: some View {
        NavigationStack {
            // A paging scroll view rather than a TabView, so paging can be switched off while zoomed
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(items.indices, id: \.self) { i in
                        MediaPage(media: items[i], isVideo: isVideoItem(i), isZoomed: $isZoomed, progress: dismissProgress,
                                  onTap: { withAnimation(.easeInOut(duration: 0.2)) { barsHidden.toggle() } },
                                  onLongPress: { menuOpen = true },
                                  onDismiss: { dismiss() })
                            .containerRelativeFrame([.horizontal, .vertical])
                            .id(i)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $scrollId)
            .scrollDisabled(isZoomed)
            .scrollIndicators(.hidden)
            .background { MediaBackdrop(progress: dismissProgress) }
            .navigationTitle(items.count > 1 ? L10n.format("timeline.pageIndicator", "\(index + 1)", items.count) : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar(barsHidden ? .hidden : .visible, for: .navigationBar)
            .statusBarHidden(barsHidden)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.done")) { dismiss() } }
                if photoCount > 1 {
                    ToolbarItem(placement: .primaryAction) {
                        Button { Task { await saveAll() } } label: {
                            Text(saving ? String(localized: "mediaLightbox.savingAll")
                                        : L10n.format("mediaLightbox.saveAll", photoCount))
                        }
                        .disabled(saving)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu { mediaMenuItems } label: {
                        Image("ph-dots-three-bold").accessibilityLabel(String(localized: "common.more"))
                    }
                }
            }
            .confirmationDialog("", isPresented: $menuOpen, titleVisibility: .hidden) { mediaMenuItems }
            .alert(saveResult ?? "", isPresented: Binding(get: { saveResult != nil }, set: { if !$0 { saveResult = nil } })) {
                Button(String(localized: "common.done")) {}
            }
        }
        .preferredColorScheme(.dark)
        .presentationBackground(.clear)
    }

    /// Copy and Save for the picture or video on screen (the long press menu and the bar's more button)
    @ViewBuilder
    private var mediaMenuItems: some View {
        let video = isVideoItem(index)
        if !video {
            Button { Task { await copyImage() } } label: {
                Label(menu: String(localized: "common.copyImage"), icon: "ph-copy-regular")
            }
        }
        Button { Task { await saveCurrent() } } label: {
            Label(menu: video ? String(localized: "common.saveVideo") : String(localized: "common.saveImage"),
                  icon: "ph-download-simple-regular")
        }
        .disabled(saving)
    }

    private func localFile(_ media: ChatEntry.MediaContent) async throws -> URL {
        guard let mediaLoader else { throw CocoaError(.fileNoSuchFile) }
        return try await mediaLoader.file(for: media.source, filename: media.filename, mimetype: media.mimetype)
    }

    /// Puts the decrypted picture on the pasteboard (a GIF as its data, so it stays animated)
    private func copyImage() async {
        guard items.indices.contains(index) else { return }
        let media = items[index]
        do {
            let url = try await localFile(media)
            if media.mimetype == "image/gif" {
                UIPasteboard.general.setData(try Data(contentsOf: url), forPasteboardType: "com.compuserve.gif")
            } else if let picture = UIImage(contentsOfFile: url.path) {
                UIPasteboard.general.image = picture
            } else {
                throw CocoaError(.fileReadCorruptFile)
            }
            CopyToast.shared.show(String(localized: "common.copied"))
        } catch {
            CopyToast.shared.show(String(localized: "common.copyImageFailed"))
        }
    }

    private func requestLibraryAccess() async -> Bool {
        let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        return access == .authorized || access == .limited
    }

    private func addToLibrary(_ media: ChatEntry.MediaContent, isVideo: Bool) async throws {
        let url = try await localFile(media)
        try await PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = media.filename
            request.addResource(with: isVideo ? .video : .photo, fileURL: url, options: options)
        }
    }

    /// Saves the picture or video on screen to the photo library
    private func saveCurrent() async {
        guard items.indices.contains(index), !saving else { return }
        let media = items[index]
        let video = isVideoItem(index)
        saving = true
        defer { saving = false }
        do {
            guard await requestLibraryAccess() else { throw CocoaError(.userCancelled) }
            try await addToLibrary(media, isVideo: video)
            CopyToast.shared.show(L10n.format("common.downloadSaved", media.filename))
        } catch {
            CopyToast.shared.show(String(localized: "common.downloadFailed"))
        }
    }

    /// Saves every photo of the gallery to the photo library; says how many could not be saved
    private func saveAll() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        guard await requestLibraryAccess() else {
            saveResult = L10n.format("mediaLightbox.saveAllFailed", "\(photoCount)", "\(photoCount)")
            return
        }
        var failed = 0
        var total = 0
        for (position, media) in items.enumerated() where !isVideoItem(position) {
            total += 1
            do {
                try await addToLibrary(media, isVideo: false)
            } catch {
                failed += 1
            }
        }
        if failed > 0 {
            saveResult = L10n.format("mediaLightbox.saveAllFailed", "\(failed)", "\(total)")
        }
    }
}

private struct MediaPage: View {
    let media: ChatEntry.MediaContent
    let isVideo: Bool
    @Binding var isZoomed: Bool
    let progress: MediaDismissProgress
    let onTap: () -> Void
    let onLongPress: () -> Void
    let onDismiss: () -> Void
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var image: UIImage?
    @StateObject private var download = VideoDownloader()

    var body: some View {
        ZStack {
            if let image {
                ZoomableImage(image: image, isZoomed: $isZoomed, progress: progress,
                              onTap: onTap, onLongPress: onLongPress, onDismiss: onDismiss)
            } else {
                ProgressView().tint(theme.textOnAccent)
            }
            if isVideo {
                Button { Task { await playVideo() } } label: {
                    VideoPlayButton(download: download)
                }
                if let error = download.error {
                    Text(error)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textOnAccent)
                        .padding(WZ.Space.space4)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
            }
        }
        .task {
            guard let mediaLoader else { return }
            if isVideo {
                if let thumbnail = media.thumbnail {
                    image = await mediaLoader.image(for: thumbnail, thumbnailSize: 800, animated: false)
                }
            } else {
                image = await mediaLoader.image(for: media.source, thumbnailSize: nil, animated: media.isAnimated)
            }
        }
    }

    private func playVideo() async {
        guard let mediaLoader else { return }
        if download.isDownloading {
            download.cancel(using: mediaLoader)
        } else {
            await download.play(media, using: mediaLoader)
        }
    }
}

struct RoomMediaView: View {
    let room: RoomSummary

    enum Section: String, CaseIterable, Identifiable {
        case media, docs, links
        var id: Self { self }
        var title: LocalizedStringKey {
            switch self {
            case .media: return "timeline.mediaTabMedia"
            case .docs: return "timeline.mediaTabDocs"
            case .links: return "timeline.mediaTabLinks"
            }
        }
    }

    @State private var section = Section.media
    @StateObject private var mediaModel: TimelineModel
    @StateObject private var docsModel: TimelineModel
    @StateObject private var linksModel: TimelineModel
    @Environment(\.theme) private var theme

    init(room: RoomSummary, client: WizardClient) {
        self.room = room
        _mediaModel = StateObject(wrappedValue: TimelineModel(client: client, roomId: room.id, onlyTypes: [.image, .video]))
        _docsModel = StateObject(wrappedValue: TimelineModel(client: client, roomId: room.id, onlyTypes: [.file, .audio]))
        _linksModel = StateObject(wrappedValue: TimelineModel(client: client, roomId: room.id, onlyTypes: [.text, .notice, .emote]))
    }

    private var model: TimelineModel {
        switch section {
        case .media: return mediaModel
        case .docs: return docsModel
        case .links: return linksModel
        }
    }

    var body: some View {
        VStack(spacing: WZ.Space.space0) {
            Picker(String(localized: "common.show"), selection: $section) {
                ForEach(Section.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, WZ.Space.space6)
            .padding(.vertical, WZ.Space.space4)

            switch section {
            case .media: MediaGrid(model: mediaModel)
            case .docs: DocsList(model: docsModel)
            case .links: LinksList(model: linksModel)
            }
        }
        .background(theme.bgSecondary)
        .navigationTitle(String(localized: "timeline.mediaLinksAndDocs"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: section) { await model.start() }
    }
}

private struct LoadMoreFooter: View {
    @ObservedObject var model: TimelineModel
    let isEmpty: Bool
    let emptyText: LocalizedStringKey
    let emptyIcon: String
    @Environment(\.theme) private var theme

    var body: some View {
        Group {
            if !model.reachedStart {
                ProgressView()
                    .tint(theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(WZ.Space.space8)
                    .task {
                        while !Task.isCancelled && !model.reachedStart {
                            await model.paginateBackwards()
                            try? await Task.sleep(for: .milliseconds(150))
                        }
                    }
            } else if isEmpty {
                ContentUnavailableView(emptyText, image: emptyIcon)
                    .padding(.top, WZ.Space.space10)
            }
        }
    }
}

private struct MediaGrid: View {
    @ObservedObject var model: TimelineModel
    @State private var openIndex: Int?

    private var items: [(entry: ChatEntry, media: ChatEntry.MediaContent, isVideo: Bool)] {
        model.entries.reversed().compactMap { entry in
            switch entry.kind {
            case .image(let media): return (entry, media, false)
            case .video(let media): return (entry, media, true)
            default: return nil
            }
        }
    }

    var body: some View {
        let items = items
        ScrollView {
            LazyVStack(spacing: WZ.Space.space0) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: WZ.Space.space1), count: 3), spacing: WZ.Space.space1) {
                    ForEach(Array(items.enumerated()), id: \.element.entry.id) { index, item in
                        MediaThumb(media: item.media, isVideo: item.isVideo)
                            .aspectRatio(1, contentMode: .fill)
                            .onTapGesture { openIndex = index }
                    }
                }
                LoadMoreFooter(model: model, isEmpty: items.isEmpty, emptyText: "timeline.noPhotosOrVideos", emptyIcon: "ph-images-regular")
            }
        }
        .fullScreenCover(item: Binding(get: { openIndex.map(IdentifiedInt.init) }, set: { openIndex = $0?.id })) { start in
            MediaPagerView(items: items.map(\.media), startIndex: start.id, isVideo: items.map(\.isVideo))
        }
    }
}

private struct MediaThumb: View {
    let media: ChatEntry.MediaContent
    let isVideo: Bool
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var image: UIImage?

    var body: some View {
        Color.clear
            .overlay {
                ZStack {
                    theme.fill
                    if let image { Image(uiImage: image).resizable().scaledToFill() }
                }
            }
            .overlay(alignment: .bottomLeading) {
                if isVideo {
                    HStack(spacing: WZ.Space.space1) {
                        Image("ph-video-camera-regular")
                        if let duration = media.duration {
                            Text(Duration.seconds(duration).formatted(.time(pattern: .minuteSecond)))
                        }
                    }
                    .font(.wizard(WZ.FontSize.xs, .semibold))
                    .foregroundStyle(theme.textOnAccent)
                    .shadow(radius: 2)
                    .padding(WZ.Space.space2)
                }
            }
            .clipped()
            .contentShape(Rectangle())
            .task {
                guard let mediaLoader, let source = isVideo ? media.thumbnail : (media.thumbnail ?? media.source) else { return }
                image = await mediaLoader.image(for: source, thumbnailSize: 300, animated: false)
            }
            .accessibilityLabel(isVideo ? String(localized: "timeline.summary.video") : String(localized: "timeline.photo"))
            .accessibilityAddTraits(.isButton)
    }
}

private struct DocsList: View {
    @ObservedObject var model: TimelineModel
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    private var items: [(entry: ChatEntry, media: ChatEntry.MediaContent)] {
        model.entries.reversed().compactMap { entry in
            switch entry.kind {
            case .file(let media): return (entry, media)
            case .audio(let media, let isVoice, _) where !isVoice: return (entry, media)
            default: return nil
            }
        }
    }

    var body: some View {
        let items = items
        List {
            ForEach(items, id: \.entry.id) { item in
                VStack(alignment: .leading, spacing: WZ.Space.space2) {
                    FileMessageView(media: item.media)
                    Text(verbatim: "\(item.entry.senderName) · \(Formats.abbreviatedDate(item.entry.timestamp, prefs.dateFormat))")
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
                .listRowBackground(theme.bgSecondary)
            }
            LoadMoreFooter(model: model, isEmpty: items.isEmpty, emptyText: "timeline.noDocuments", emptyIcon: "ph-file-regular")
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }
}

private struct LinksList: View {
    @ObservedObject var model: TimelineModel
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.openURL) private var openURL
    @Environment(\.theme) private var theme

    private var items: [(id: String, url: URL, entry: ChatEntry)] {
        var seen = Set<String>()
        return model.entries.reversed().flatMap { entry -> [(id: String, url: URL, entry: ChatEntry)] in
            guard case .message(let body, _, _) = entry.kind else { return [] }
            return MessageText.allWebURLs(in: body).compactMap { url in
                let id = "\(entry.id)|\(url.absoluteString)"
                guard seen.insert(id).inserted else { return nil }
                return (id, url, entry)
            }
        }
    }

    var body: some View {
        let items = items
        List {
            ForEach(items, id: \.id) { item in
                Button { openURL(item.url) } label: {
                    HStack(spacing: WZ.Space.space5) {
                        Image("ph-link-simple-regular")
                            .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                            .foregroundStyle(theme.linkColor)
                            .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        VStack(alignment: .leading, spacing: WZ.Space.space1) {
                            Text(item.url.host?.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression) ?? item.url.absoluteString)
                                .font(.wizard(WZ.FontSize.md, .semibold))
                                .foregroundStyle(theme.textPrimary)
                            Text(item.url.absoluteString)
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.linkColor)
                            Text(verbatim: "\(item.entry.senderName) · \(Formats.abbreviatedDate(item.entry.timestamp, prefs.dateFormat))")
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                        .lineLimit(1)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button { copyToClipboard(item.url.absoluteString, message: String(localized: "timeline.linkCopied")) } label: {
                        Label(menu: String(localized: "common.copyLink"), icon: "ph-copy-regular")
                    }
                }
                .listRowBackground(theme.bgSecondary)
            }
            LoadMoreFooter(model: model, isEmpty: items.isEmpty, emptyText: "timeline.noLinks", emptyIcon: "ph-link-simple-regular")
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }
}

extension MessageText {
    static func allWebURLs(in text: String) -> [URL] {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return [] }
        let ns = text as NSString
        return detector.matches(in: text, range: NSRange(location: 0, length: ns.length)).compactMap { match in
            guard let url = match.url, ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
            return url
        }
    }
}
