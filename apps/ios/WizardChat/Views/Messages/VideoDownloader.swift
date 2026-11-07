import SwiftUI
import WizardChatCore

/// Downloads a received video when it is tapped (they are never fetched on their own, as they are big),
/// shows how far it got, can be stopped, and plays it once it is there.
@MainActor
final class VideoDownloader: ObservableObject {
    @Published private(set) var isDownloading = false
    /// 0...1 once the size is known; nil before that
    @Published private(set) var fraction: Double?
    @Published private(set) var error: String?

    private var token: String?
    private var cancelRequested = false

    func play(_ media: ChatEntry.MediaContent, using loader: MediaLoader) async {
        guard !isDownloading else { return }
        error = nil
        if let url = loader.cachedFile(for: media.source, filename: media.filename, mimetype: media.mimetype) {
            NativeVideoPlayer.present(url: url)
            return
        }
        let token = UUID().uuidString
        self.token = token
        cancelRequested = false
        fraction = nil
        isDownloading = true
        defer {
            isDownloading = false
            fraction = nil
            self.token = nil
        }
        do {
            let url = try await loader.downloadFile(for: media.source, filename: media.filename, mimetype: media.mimetype,
                                                    sizeHint: media.size, token: token) { [weak self] progress in
                self?.update(progress)
            }
            if !cancelRequested { NativeVideoPlayer.present(url: url) }
        } catch {
            if !cancelRequested {
                self.error = L10n.format("timeline.video.downloadFailed", error.localizedDescription)
            }
        }
    }

    func cancel(using loader: MediaLoader) {
        guard isDownloading, let token else { return }
        cancelRequested = true
        loader.cancelDownload(token: token)
    }

    private func update(_ progress: DownloadProgress) {
        guard isDownloading, let total = progress.total, total > 0 else { return }
        fraction = min(1, Double(progress.received) / Double(total))
    }
}

/// The play button of a video; while the video downloads it becomes a ring that fills up, and tapping it stops the download
struct VideoPlayButton: View {
    @ObservedObject var download: VideoDownloader
    @Environment(\.theme) private var theme

    var body: some View {
        ZStack {
            if download.isDownloading {
                Circle().stroke(theme.textOnAccent.opacity(0.3), lineWidth: 3)
                if let fraction = download.fraction {
                    Circle()
                        .trim(from: 0, to: fraction)
                        .stroke(theme.textOnAccent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                } else {
                    ProgressView().tint(theme.textOnAccent)
                }
                Image("ph-x-bold")
                    .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                    .foregroundStyle(theme.textOnAccent)
            } else {
                Image("ph-play-fill")
                    .font(.system(size: WZ.SizeIcon.lg, weight: .semibold))
                    .foregroundStyle(theme.textOnAccent)
            }
        }
        .padding(download.isDownloading ? WZ.Space.space3 : 0)
        .frame(width: WZ.Space.space11, height: WZ.Space.space11)
        .background(.ultraThinMaterial, in: Circle())
        .animation(.linear(duration: WZ.MotionDuration.fast), value: download.fraction)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(download.isDownloading
                            ? String(localized: "timeline.video.cancelDownload")
                            : String(localized: "timeline.video.play"))
    }
}
