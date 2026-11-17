import Foundation

/// Planning for sending big videos, a line-by-line port of the web's `util/videoPlan.ts` and of
/// Android's `VideoPlan.kt` (same thresholds, tiers and arithmetic; `VideoPlanTests` compares it with
/// values computed by the web file). Nothing here touches AVFoundation, so it runs in unit tests.
///
/// A video is either sent untouched or re-encoded to H.264 + AAC in an MP4 with the moov atom first;
/// `VideoPlan.planCompression` decides how far it is shrunk.

/// What one attachment is sent as: untouched, shrunk to fit the size the settings aim for, or a fixed resolution
enum VideoQuality: Hashable {
    case original
    case smart
    case fixed(Int)
}

/// What the encoder is asked for: a size to fit under, or a resolution to scale down to
enum CompressTarget: Equatable {
    case smart(maxBytes: Int64)
    case fixed(height: Int)
}

/// What is known about a source video before it is encoded; `width` and `height` are as displayed
struct VideoMeta: Equatable {
    var durationSec: Double
    var width: Int
    var height: Int
    /// Bits per second of the whole file, sound included
    var bitrate: Double
}

struct CompressPlan: Equatable {
    /// Short side the video is scaled down to (never above its own)
    var height: Int
    /// Bits per second for the picture
    var videoBitrate: Int64
    var estimatedBytes: Double
}

/// The video settings in the form `VideoPlan` plans with
struct VideoUploadPrefs: Equatable {
    var mode: VideoUploadMode
    var height: Int
    /// Largest size a smart upload aims for, before the server's limit is applied
    var targetBytes: Int64
    /// Videos smaller than this are never re-encoded
    var minBytes: Int64
}

/// What one video can be sent as; `size` is the expected size when sent this way, nil while the video's own details aren't known yet
struct VideoChoice: Equatable {
    var quality: VideoQuality
    var size: Int64?
}

enum VideoPlan {
    private struct Tier {
        let height: Int
        let min: Double
        let cap: Double
    }

    /// Resolution steps a smart plan picks from: each needs at least `min` bit/s to look decent, and gains nothing past `cap`
    private static let tiers: [Tier] = [
        Tier(height: 1080, min: 3_500_000, cap: 6_000_000),
        Tier(height: 720, min: 1_800_000, cap: 3_000_000),
        Tier(height: 480, min: 800_000, cap: 1_500_000),
        Tier(height: 360, min: 400_000, cap: 800_000),
    ]

    /// What a fixed resolution is encoded at
    static let fixedBitrate: [Int: Int64] = [1080: 5_000_000, 720: 2_800_000, 480: 1_400_000]
    static let audioBitrate: Int64 = 128_000

    /// Lowest picture bitrate a smart plan will go to for a clip too long to fit otherwise
    private static let minVideoBitrate: Double = 150_000

    /// Share of the size budget left for the picture and sound; the rest absorbs container overhead and rate overshoot
    private static let budgetShare: Double = 0.9
    static let maxFrameRate = 30

    /// The result is only worth sending if it is at least this much smaller than the original
    static let minSaving: Double = 0.15

    /// JavaScript's `Math.round`: halves go up
    private static func jsRound(_ value: Double) -> Int64 {
        Int64((value + 0.5).rounded(.down))
    }

    /// How to re-encode a video for a target, or nil when it should go as it is (it already fits, or
    /// is already smaller than the target would make it).
    static func planCompression(_ meta: VideoMeta, _ target: CompressTarget) -> CompressPlan? {
        let durationSec = meta.durationSec
        guard durationSec > 0, meta.width > 0, meta.height > 0 else { return nil }
        let shortSide = min(meta.width, meta.height)
        let audio = Double(audioBitrate)
        let sourceVideoBitrate = max(0, meta.bitrate - audio)

        switch target {
        case .fixed(let height):
            guard let fixed = fixedBitrate[height] else { return nil }
            let videoBitrate = Double(fixed)
            let fitsAlready = shortSide <= height
                && (sourceVideoBitrate == 0 || sourceVideoBitrate <= videoBitrate * 1.25)
            if fitsAlready { return nil }
            let bitrate = jsRound(sourceVideoBitrate > 0 ? min(videoBitrate, sourceVideoBitrate) : videoBitrate)
            return CompressPlan(height: min(height, shortSide), videoBitrate: bitrate,
                                estimatedBytes: durationSec * (Double(bitrate) + audio) / 8)

        case .smart(let maxBytes):
            let limit = Double(maxBytes)
            if meta.bitrate * durationSec / 8 <= limit { return nil }
            let available = limit * 8 * budgetShare / durationSec - audio
            let smallest = tiers[tiers.count - 1]
            var tier: Tier? = tiers.first { $0.height <= shortSide && available >= $0.min }
            if tier == nil && !(available >= smallest.min) { tier = smallest }
            // Fewer pixels than even the smallest step has: keep them all and spend what is available on them
            let stepHeight = tier?.height ?? shortSide
            let cap = tier?.cap ?? smallest.cap
            var videoBitrate = max(minVideoBitrate, min(available, cap))
            if sourceVideoBitrate > 0 { videoBitrate = min(videoBitrate, sourceVideoBitrate) }
            let rounded = jsRound(videoBitrate)
            return CompressPlan(height: min(stepHeight, shortSide), videoBitrate: rounded,
                                estimatedBytes: durationSec * (Double(rounded) + audio) / 8)
        }
    }

    /// Even sizes, as H.264 wants; the short side becomes `shortSideTarget` and the shape stays
    static func scaledSize(width: Int, height: Int, shortSideTarget: Int) -> (width: Int, height: Int) {
        let shortSide = min(width, height)
        if shortSide <= shortSideTarget { return (even(Double(width)), even(Double(height))) }
        let scale = Double(shortSideTarget) / Double(shortSide)
        return (even(Double(width) * scale), even(Double(height) * scale))
    }

    private static func even(_ value: Double) -> Int {
        Int(max(2, jsRound(value / 2) * 2))
    }

    /// Rough size the video will have after being encoded for `target`; the original size when it is sent as it is
    static func estimateCompressedSize(_ meta: VideoMeta, _ target: CompressTarget, originalSize: Int64) -> Int64 {
        guard let plan = planCompression(meta, target) else { return originalSize }
        return Int64(min(plan.estimatedBytes, Double(originalSize)))
    }

    // MARK: Settings -> what one video is sent as

    /// Share of the server's limit a smart upload aims for, so a little overshoot still goes through
    private static let serverLimitShare: Double = 0.95

    /// The size a smart upload aims for: what the settings ask, but never beyond what the server takes
    static func smartMaxBytes(_ prefs: VideoUploadPrefs, _ maxUploadBytes: Int64) -> Int64 {
        Int64(min(Double(prefs.targetBytes), Double(maxUploadBytes) * serverLimitShare).rounded(.down))
    }

    /// What a video is sent as when the user hasn't picked for it: untouched, unless the settings ask for
    /// big videos to be shrunk or the server wouldn't take it otherwise.
    static func defaultQuality(_ prefs: VideoUploadPrefs, size: Int64, maxUploadBytes: Int64,
                               canCompress: Bool) -> VideoQuality {
        if !canCompress { return .original }
        let shrunk: VideoQuality = prefs.mode == .fixed ? .fixed(prefs.height) : .smart
        if size > maxUploadBytes { return shrunk }
        if prefs.mode == .original || size < prefs.minBytes { return .original }
        return shrunk
    }

    static func qualityTarget(_ quality: VideoQuality, _ prefs: VideoUploadPrefs,
                              _ maxUploadBytes: Int64) -> CompressTarget? {
        switch quality {
        case .original: return nil
        case .smart: return .smart(maxBytes: smartMaxBytes(prefs, maxUploadBytes))
        case .fixed(let height): return .fixed(height: height)
        }
    }

    private static let offeredHeights = [720, 480]

    /// An option is only offered if it comes out at most this share of the original (the encoder wants 15% saved)
    private static let minSavingRatio: Double = 0.85

    /// What one video can be sent as, each with its expected size. Original is always first. Sizes the
    /// video already fits in, or resolutions at or above its own, are left out as they'd change nothing.
    static func choices(meta: VideoMeta?, fileSize: Int64, prefs: VideoUploadPrefs,
                        maxUploadBytes: Int64) -> [VideoChoice] {
        var result = [VideoChoice(quality: .original, size: fileSize)]
        var heights = Set(offeredHeights)
        if prefs.mode == .fixed { heights.insert(prefs.height) }
        var qualities: [VideoQuality] = [.smart]
        for height in heights.sorted(by: >) { qualities.append(.fixed(height)) }
        for quality in qualities {
            guard let target = qualityTarget(quality, prefs, maxUploadBytes) else { continue }
            guard let known = meta else {
                result.append(VideoChoice(quality: quality, size: nil))
                continue
            }
            // The encoder keeps the original when it wouldn't be clearly smaller, so don't offer what saves nothing
            if let plan = planCompression(known, target), plan.estimatedBytes <= Double(fileSize) * minSavingRatio {
                result.append(VideoChoice(quality: quality, size: Int64(plan.estimatedBytes)))
            }
        }
        return result
    }
}

extension AppPreferences {
    /// The video options in the form `VideoPlan` plans with
    func videoUploadPrefs() -> VideoUploadPrefs {
        let megabyte: Int64 = 1024 * 1024
        // Without a size the server limit is the target; `smartMaxBytes` caps it anyway
        let target: Int64 = videoUploadTarget.megabytes.map { Int64($0) * megabyte } ?? Int64.max
        return VideoUploadPrefs(mode: videoUploadMode, height: videoUploadHeight.pixels, targetBytes: target,
                                minBytes: Int64(videoUploadMinSize.megabytes) * megabyte)
    }
}
