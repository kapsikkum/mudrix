import Foundation

/// What to do to attachments before they are uploaded: the photo options, and what each video is sent as
struct UploadPrep {
    var photo: ImagePrep.Options
    var videoPrefs: VideoUploadPrefs
    var maxUploadBytes: Int64
    /// What each video is sent as (by the file's URL); one not listed here follows the settings
    var videoQualities: [URL: VideoQuality] = [:]

    @MainActor
    init(prefs: AppPreferences, maxUploadBytes: Int64, videoQualities: [URL: VideoQuality] = [:]) {
        photo = ImagePrep.Options(stripMetadata: prefs.photoStripMetadata, maxSide: prefs.photoUploadSize.maxSide)
        videoPrefs = prefs.videoUploadPrefs()
        self.maxUploadBytes = maxUploadBytes
        self.videoQualities = videoQualities
    }
}

extension MediaMetadata {
    /// What `VideoPlan` needs to know about a video file; nil when it cannot be read
    static func videoMeta(at url: URL) async -> VideoMeta? {
        let info = await video(at: url)
        guard let duration = info.duration, duration > 0, let size = info.size,
              size.width >= 1, size.height >= 1 else { return nil }
        let bytes = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        return VideoMeta(durationSec: duration, width: Int(size.width.rounded()), height: Int(size.height.rounded()),
                         bitrate: Double(bytes) * 8 / duration)
    }

    static func fileSize(at url: URL) -> Int64 {
        Int64((try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
    }
}
