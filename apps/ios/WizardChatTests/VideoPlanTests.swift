import XCTest
@testable import WizardChat

/// `VideoPlan` against values computed by the web planner (apps/web/src/util/videoPlan.ts) in node
final class VideoPlanTests: XCTestCase {
    private struct PlanExpected {
        let height: Int
        let videoBitrate: Int64
        let estimatedBytes: Double
    }

    private struct PlanCase {
        let meta: VideoMeta
        let target: CompressTarget
        let expected: PlanExpected?
    }

    private static let cases: [PlanCase] = [
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 320, height: 240, bitrate: 600000), target: .fixed(height: 480), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 1080, height: 1080, bitrate: 2000000), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 1400000, estimatedBytes: 687600000)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 200, height: 100, bitrate: 600000), target: .smart(maxBytes: 104857600), expected: PlanExpected(height: 100, videoBitrate: 150000, estimatedBytes: 250200000)),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 200, height: 100, bitrate: 2000000), target: .fixed(height: 480), expected: PlanExpected(height: 100, videoBitrate: 1400000, estimatedBytes: 22920000)),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 200, height: 100, bitrate: 100000), target: .smart(maxBytes: 15728640), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 1080, height: 1080, bitrate: 4321987), target: .smart(maxBytes: 52428800), expected: PlanExpected(height: 480, videoBitrate: 1130291, estimatedBytes: 47185912.5)),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 1080, height: 1920, bitrate: 2000000), target: .smart(maxBytes: 20971520), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 720, height: 1280, bitrate: 4321987), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 1080, height: 1080, bitrate: 150000), target: .smart(maxBytes: 52428800), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 1080, height: 1920, bitrate: 25000000), target: .fixed(height: 1080), expected: PlanExpected(height: 1080, videoBitrate: 5000000, estimatedBytes: 3846000)),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 320, height: 240, bitrate: 100000), target: .smart(maxBytes: 20971520), expected: PlanExpected(height: 240, videoBitrate: 150000, estimatedBytes: 125100000)),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 854, height: 480, bitrate: 100000), target: .smart(maxBytes: 10485760), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 320, height: 240, bitrate: 2000000), target: .smart(maxBytes: 20971520), expected: PlanExpected(height: 240, videoBitrate: 800000, estimatedBytes: 13920000)),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 3840, height: 2160, bitrate: 100000), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 43920000)),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 320, height: 240, bitrate: 150000), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 640, height: 360, bitrate: 100000), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 3840, height: 2160, bitrate: 4321987), target: .smart(maxBytes: 5242880), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 20850000)),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 320, height: 240, bitrate: 8000000), target: .fixed(height: 720), expected: PlanExpected(height: 240, videoBitrate: 2800000, estimatedBytes: 1317600000)),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 3840, height: 2160, bitrate: 25000000), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 1400000, estimatedBytes: 1146000)),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 640, height: 360, bitrate: 2000000), target: .fixed(height: 480), expected: PlanExpected(height: 360, videoBitrate: 1400000, estimatedBytes: 114600000)),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 1920, height: 1080, bitrate: 25000000), target: .fixed(height: 1080), expected: PlanExpected(height: 1080, videoBitrate: 5000000, estimatedBytes: 769200000)),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 1080, height: 1080, bitrate: 100000), target: .smart(maxBytes: 5242880), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 720, height: 1280, bitrate: 150000), target: .smart(maxBytes: 10485760), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 1080, height: 1080, bitrate: 25000000), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 1400000, estimatedBytes: 57300000)),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 1280, height: 720, bitrate: 150000), target: .smart(maxBytes: 15728640), expected: PlanExpected(height: 360, videoBitrate: 22000, estimatedBytes: 22500000)),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 320, height: 240, bitrate: 25000000), target: .fixed(height: 720), expected: PlanExpected(height: 240, videoBitrate: 2800000, estimatedBytes: 439200000)),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 320, height: 240, bitrate: 4321987), target: .smart(maxBytes: 52428800), expected: PlanExpected(height: 240, videoBitrate: 150000, estimatedBytes: 125100000)),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 720, height: 1280, bitrate: 25000000), target: .smart(maxBytes: 104857600), expected: PlanExpected(height: 720, videoBitrate: 3000000, estimatedBytes: 46920000)),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 3840, height: 2160, bitrate: 100000), target: .smart(maxBytes: 10485760), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 200, height: 100, bitrate: 4321987), target: .smart(maxBytes: 14942208), expected: PlanExpected(height: 100, videoBitrate: 150000, estimatedBytes: 41700000)),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 720, height: 1280, bitrate: 600000), target: .smart(maxBytes: 10485760), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 1920, height: 1080, bitrate: 600000), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 472000, estimatedBytes: 450000)),
        PlanCase(meta: VideoMeta(durationSec: 30, width: 1080, height: 1920, bitrate: 2000000), target: .smart(maxBytes: 14942208), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 1280, height: 720, bitrate: 25000000), target: .smart(maxBytes: 52428800), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 250200000)),
        PlanCase(meta: VideoMeta(durationSec: 2250, width: 1920, height: 1080, bitrate: 600000), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 472000, estimatedBytes: 168750000)),
        PlanCase(meta: VideoMeta(durationSec: 2250, width: 3840, height: 2160, bitrate: 2000000), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 1400000, estimatedBytes: 429750000)),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 25000000), target: .fixed(height: 1080), expected: PlanExpected(height: 720, videoBitrate: 5000000, estimatedBytes: 76920000)),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 640, height: 360, bitrate: 25000000), target: .fixed(height: 480), expected: PlanExpected(height: 360, videoBitrate: 1400000, estimatedBytes: 229200000)),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 200, height: 100, bitrate: 2000000), target: .smart(maxBytes: 10485760), expected: PlanExpected(height: 100, videoBitrate: 501146, estimatedBytes: 9437190)),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 1280, height: 720, bitrate: 100000), target: .fixed(height: 720), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 720, height: 1280, bitrate: 600000), target: .smart(maxBytes: 104857600), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 854, height: 480, bitrate: 4321987), target: .fixed(height: 720), expected: PlanExpected(height: 480, videoBitrate: 2800000, estimatedBytes: 109800000)),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 1920, height: 1080, bitrate: 600000), target: .smart(maxBytes: 20971520), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 2250, width: 1920, height: 1080, bitrate: 4321987), target: .smart(maxBytes: 20971520), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 78187500)),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 3840, height: 2160, bitrate: 4321987), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 1400000, estimatedBytes: 11460000)),
        PlanCase(meta: VideoMeta(durationSec: 2250, width: 720, height: 1280, bitrate: 150000), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 22000, estimatedBytes: 42187500)),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 640, height: 360, bitrate: 150000), target: .fixed(height: 720), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 30, width: 200, height: 100, bitrate: 4321987), target: .smart(maxBytes: 104857600), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 200, height: 100, bitrate: 150000), target: .fixed(height: 720), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 1080, height: 1920, bitrate: 2000000), target: .smart(maxBytes: 5242880), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 1280, height: 720, bitrate: 600000), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 472000, estimatedBytes: 540000000)),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 1080, height: 1920, bitrate: 25000000), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 1400000, estimatedBytes: 687600000)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 1080, height: 1920, bitrate: 2000000), target: .smart(maxBytes: 15728640), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 250200000)),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 720, height: 1280, bitrate: 100000), target: .smart(maxBytes: 20971520), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 1080, height: 1920, bitrate: 4321987), target: .smart(maxBytes: 15728640), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 125100000)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 320, height: 240, bitrate: 100000), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 320, height: 240, bitrate: 100000), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 640, height: 360, bitrate: 0), target: .fixed(height: 720), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 30, width: 200, height: 100, bitrate: 4321987), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 854, height: 480, bitrate: 25000000), target: .smart(maxBytes: 52428800), expected: PlanExpected(height: 480, videoBitrate: 1500000, estimatedBytes: 12210000)),
        PlanCase(meta: VideoMeta(durationSec: 2250, width: 720, height: 1280, bitrate: 25000000), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 823500000)),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 200, height: 100, bitrate: 25000000), target: .smart(maxBytes: 15728640), expected: PlanExpected(height: 100, videoBitrate: 150000, estimatedBytes: 41700000)),
        PlanCase(meta: VideoMeta(durationSec: 30, width: 1080, height: 1080, bitrate: 2000000), target: .smart(maxBytes: 20971520), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 30, width: 854, height: 480, bitrate: 8000000), target: .fixed(height: 720), expected: PlanExpected(height: 480, videoBitrate: 2800000, estimatedBytes: 10980000)),
        PlanCase(meta: VideoMeta(durationSec: 2250, width: 200, height: 100, bitrate: 150000), target: .fixed(height: 480), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 1080, height: 1920, bitrate: 25000000), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 1317600000)),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 854, height: 480, bitrate: 100000), target: .smart(maxBytes: 10485760), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 125100000)),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 1080, height: 1920, bitrate: 8000000), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 1317600000)),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 854, height: 480, bitrate: 8000000), target: .smart(maxBytes: 104857600), expected: PlanExpected(height: 480, videoBitrate: 1130291, estimatedBytes: 94371825)),
        PlanCase(meta: VideoMeta(durationSec: 2250, width: 200, height: 100, bitrate: 150000), target: .smart(maxBytes: 15728640), expected: PlanExpected(height: 100, videoBitrate: 22000, estimatedBytes: 42187500)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 1920, height: 1080, bitrate: 8000000), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 2635200000)),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 3840, height: 2160, bitrate: 25000000), target: .smart(maxBytes: 10485760), expected: PlanExpected(height: 1080, videoBitrate: 6000000, estimatedBytes: 4596000)),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 320, height: 240, bitrate: 0), target: .smart(maxBytes: 15728640), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 1080, height: 1920, bitrate: 8000000), target: .smart(maxBytes: 15728640), expected: PlanExpected(height: 480, videoBitrate: 815718, estimatedBytes: 14155770)),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 720, height: 1280, bitrate: 8000000), target: .fixed(height: 1080), expected: PlanExpected(height: 720, videoBitrate: 5000000, estimatedBytes: 3846000)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 720, height: 1280, bitrate: 25000000), target: .smart(maxBytes: 10485760), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 250200000)),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 1080, height: 1080, bitrate: 25000000), target: .fixed(height: 1080), expected: PlanExpected(height: 1080, videoBitrate: 5000000, estimatedBytes: 38460000)),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 200, height: 100, bitrate: 2000000), target: .smart(maxBytes: 15728640), expected: PlanExpected(height: 100, videoBitrate: 150000, estimatedBytes: 20850000)),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 720, height: 1280, bitrate: 100000), target: .smart(maxBytes: 10485760), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 30, width: 1920, height: 1080, bitrate: 4321987), target: .smart(maxBytes: 5242880), expected: PlanExpected(height: 480, videoBitrate: 1130291, estimatedBytes: 4718591.25)),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 1920, height: 1080, bitrate: 2000000), target: .smart(maxBytes: 5242880), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 854, height: 480, bitrate: 600000), target: .smart(maxBytes: 10485760), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 250200000)),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 720, height: 1280, bitrate: 25000000), target: .smart(maxBytes: 52428800), expected: PlanExpected(height: 480, videoBitrate: 1130291, estimatedBytes: 47185912.5)),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 1920, height: 1080, bitrate: 0), target: .fixed(height: 480), expected: PlanExpected(height: 480, videoBitrate: 1400000, estimatedBytes: 687600000)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 1280, height: 720, bitrate: 150000), target: .smart(maxBytes: 15728640), expected: PlanExpected(height: 360, videoBitrate: 22000, estimatedBytes: 135000000)),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 720, height: 1280, bitrate: 600000), target: .fixed(height: 720), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 854, height: 480, bitrate: 150000), target: .smart(maxBytes: 20971520), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 640, height: 360, bitrate: 150000), target: .fixed(height: 480), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 2250, width: 640, height: 360, bitrate: 8000000), target: .fixed(height: 1080), expected: PlanExpected(height: 360, videoBitrate: 5000000, estimatedBytes: 1442250000)),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 1080, height: 1080, bitrate: 2000000), target: .smart(maxBytes: 10485760), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 20850000)),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 1080, height: 1920, bitrate: 150000), target: .smart(maxBytes: 14942208), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 3840, height: 2160, bitrate: 4321987), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 43920000)),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 3840, height: 2160, bitrate: 100000), target: .smart(maxBytes: 14942208), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 320, height: 240, bitrate: 25000000), target: .fixed(height: 480), expected: PlanExpected(height: 240, videoBitrate: 1400000, estimatedBytes: 114600000)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 200, height: 100, bitrate: 600000), target: .smart(maxBytes: 104857600), expected: PlanExpected(height: 100, videoBitrate: 150000, estimatedBytes: 250200000)),
        PlanCase(meta: VideoMeta(durationSec: 120, width: 1920, height: 1080, bitrate: 100000), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 43920000)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 720, height: 1280, bitrate: 150000), target: .fixed(height: 720), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 30, width: 1080, height: 1920, bitrate: 4321987), target: .smart(maxBytes: 20971520), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 300, width: 1280, height: 720, bitrate: 8000000), target: .smart(maxBytes: 104857600), expected: PlanExpected(height: 720, videoBitrate: 2388582, estimatedBytes: 94371825)),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 1920, height: 1080, bitrate: 0), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 1200, width: 1280, height: 720, bitrate: 8000000), target: .smart(maxBytes: 10485760), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 41700000)),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 854, height: 480, bitrate: 600000), target: .fixed(height: 480), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 4321987), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 219600000)),
        PlanCase(meta: VideoMeta(durationSec: 600, width: 200, height: 100, bitrate: 600000), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 320, height: 240, bitrate: 2000000), target: .smart(maxBytes: 52428800), expected: PlanExpected(height: 240, videoBitrate: 150000, estimatedBytes: 125100000)),
        PlanCase(meta: VideoMeta(durationSec: 30, width: 1280, height: 720, bitrate: 600000), target: .fixed(height: 1080), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 1080, height: 1080, bitrate: 0), target: .fixed(height: 720), expected: PlanExpected(height: 720, videoBitrate: 2800000, estimatedBytes: 21960000)),
        PlanCase(meta: VideoMeta(durationSec: 6, width: 1080, height: 1080, bitrate: 2000000), target: .smart(maxBytes: 104857600), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 7200, width: 640, height: 360, bitrate: 2000000), target: .smart(maxBytes: 5242880), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 250200000)),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 1080, height: 1080, bitrate: 2000000), target: .smart(maxBytes: 5242880), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 125100000)),
        PlanCase(meta: VideoMeta(durationSec: 0, width: 1920, height: 1080, bitrate: 8000000), target: .smart(maxBytes: 10485760), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 0, height: 1080, bitrate: 8000000), target: .fixed(height: 720), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 60, width: 1920, height: -1, bitrate: 8000000), target: .fixed(height: 720), expected: nil),
        PlanCase(meta: VideoMeta(durationSec: 3600, width: 1920, height: 1080, bitrate: 8000000), target: .smart(maxBytes: 1048576), expected: PlanExpected(height: 360, videoBitrate: 150000, estimatedBytes: 125100000)),
    ]

    func testPlansMatchTheWeb() {
        for item in Self.cases {
            let plan = VideoPlan.planCompression(item.meta, item.target)
            let label = "\(item.meta) \(item.target)"
            guard let expected = item.expected else {
                XCTAssertNil(plan, label)
                continue
            }
            XCTAssertEqual(plan?.height, expected.height, label)
            XCTAssertEqual(plan?.videoBitrate, expected.videoBitrate, label)
            XCTAssertEqual(plan?.estimatedBytes ?? Double.nan, expected.estimatedBytes, accuracy: 1e-6, label)
        }
    }

    func testSettingsMapToQualities() {
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), 15728640), 14942208, "smart720 15728640")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), 20971520), 19922944, "smart720 20971520")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), 104857600), 52428800, "smart720 104857600")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), 2097152000), 52428800, "smart720 2097152000")
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 1048576, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 1048576, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 10485760, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 10485760, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 26214399, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 26214399, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 26214400, maxUploadBytes: 104857600, canCompress: true), .smart)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 26214400, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 31457280, maxUploadBytes: 104857600, canCompress: true), .smart)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 31457280, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 103809024, maxUploadBytes: 104857600, canCompress: true), .smart)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 103809024, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 136314880, maxUploadBytes: 104857600, canCompress: true), .smart)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 136314880, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 3145728000, maxUploadBytes: 104857600, canCompress: true), .smart)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 3145728000, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), 15728640), 14942208, "original 15728640")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), 20971520), 19922944, "original 20971520")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), 104857600), 52428800, "original 104857600")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), 2097152000), 52428800, "original 2097152000")
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 1048576, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 1048576, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 10485760, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 10485760, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 26214399, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 26214399, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 26214400, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 26214400, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 31457280, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 31457280, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 103809024, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 103809024, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 136314880, maxUploadBytes: 104857600, canCompress: true), .smart)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 136314880, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 3145728000, maxUploadBytes: 104857600, canCompress: true), .smart)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), size: 3145728000, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), 15728640), 14942208, "fixed1080 15728640")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), 20971520), 19922944, "fixed1080 20971520")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), 104857600), 26214400, "fixed1080 104857600")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), 2097152000), 26214400, "fixed1080 2097152000")
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 1048576, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 1048576, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 10485760, maxUploadBytes: 104857600, canCompress: true), .fixed(1080))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 10485760, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 26214399, maxUploadBytes: 104857600, canCompress: true), .fixed(1080))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 26214399, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 26214400, maxUploadBytes: 104857600, canCompress: true), .fixed(1080))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 26214400, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 31457280, maxUploadBytes: 104857600, canCompress: true), .fixed(1080))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 31457280, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 103809024, maxUploadBytes: 104857600, canCompress: true), .fixed(1080))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 103809024, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 136314880, maxUploadBytes: 104857600, canCompress: true), .fixed(1080))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 136314880, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 3145728000, maxUploadBytes: 104857600, canCompress: true), .fixed(1080))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), size: 3145728000, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), 15728640), 14942208, "fixed480 15728640")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), 20971520), 19922944, "fixed480 20971520")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), 104857600), 99614720, "fixed480 104857600")
        XCTAssertEqual(VideoPlan.smartMaxBytes(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), 2097152000), 104857600, "fixed480 2097152000")
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 1048576, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 1048576, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 10485760, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 10485760, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 26214399, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 26214399, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 26214400, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 26214400, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 31457280, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 31457280, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 103809024, maxUploadBytes: 104857600, canCompress: true), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 103809024, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 136314880, maxUploadBytes: 104857600, canCompress: true), .fixed(480))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 136314880, maxUploadBytes: 104857600, canCompress: false), .original)
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 3145728000, maxUploadBytes: 104857600, canCompress: true), .fixed(480))
        XCTAssertEqual(VideoPlan.defaultQuality(VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), size: 3145728000, maxUploadBytes: 104857600, canCompress: false), .original)
    }

    func testChoicesMatchTheWeb() {
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 8000000), fileSize: 600000000, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 600000000), VideoChoice(quality: .smart, size: 20850000), VideoChoice(quality: .fixed(720), size: 219600000), VideoChoice(quality: .fixed(480), size: 114600000)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 8000000), fileSize: 600000000, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 600000000), VideoChoice(quality: .smart, size: 47185950), VideoChoice(quality: .fixed(720), size: 219600000), VideoChoice(quality: .fixed(480), size: 114600000)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 20, width: 1920, height: 1080, bitrate: 8000000), fileSize: 20000000, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 20000000), VideoChoice(quality: .smart, size: 13447987), VideoChoice(quality: .fixed(720), size: 7320000), VideoChoice(quality: .fixed(480), size: 3820000)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 20, width: 1920, height: 1080, bitrate: 8000000), fileSize: 20000000, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 20000000), VideoChoice(quality: .fixed(720), size: 7320000), VideoChoice(quality: .fixed(480), size: 3820000)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 3000000), fileSize: 45000000, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 45000000), VideoChoice(quality: .smart, size: 13447980), VideoChoice(quality: .fixed(480), size: 22920000)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 3000000), fileSize: 45000000, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 45000000), VideoChoice(quality: .fixed(480), size: 22920000)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 90, width: 640, height: 360, bitrate: 900000), fileSize: 10125000, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 10125000)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 90, width: 640, height: 360, bitrate: 900000), fileSize: 10125000, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 10125000)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: nil, fileSize: 104857600, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 104857600), VideoChoice(quality: .smart, size: nil), VideoChoice(quality: .fixed(720), size: nil), VideoChoice(quality: .fixed(480), size: nil)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: nil, fileSize: 104857600, prefs: VideoUploadPrefs(mode: .smart, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 104857600), VideoChoice(quality: .smart, size: nil), VideoChoice(quality: .fixed(720), size: nil), VideoChoice(quality: .fixed(480), size: nil)], "smart720")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 8000000), fileSize: 600000000, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 600000000), VideoChoice(quality: .smart, size: 20850000), VideoChoice(quality: .fixed(720), size: 219600000), VideoChoice(quality: .fixed(480), size: 114600000)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 8000000), fileSize: 600000000, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 600000000), VideoChoice(quality: .smart, size: 47185950), VideoChoice(quality: .fixed(720), size: 219600000), VideoChoice(quality: .fixed(480), size: 114600000)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 20, width: 1920, height: 1080, bitrate: 8000000), fileSize: 20000000, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 20000000), VideoChoice(quality: .smart, size: 13447987), VideoChoice(quality: .fixed(720), size: 7320000), VideoChoice(quality: .fixed(480), size: 3820000)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 20, width: 1920, height: 1080, bitrate: 8000000), fileSize: 20000000, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 20000000), VideoChoice(quality: .fixed(720), size: 7320000), VideoChoice(quality: .fixed(480), size: 3820000)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 3000000), fileSize: 45000000, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 45000000), VideoChoice(quality: .smart, size: 13447980), VideoChoice(quality: .fixed(480), size: 22920000)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 3000000), fileSize: 45000000, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 45000000), VideoChoice(quality: .fixed(480), size: 22920000)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 90, width: 640, height: 360, bitrate: 900000), fileSize: 10125000, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 10125000)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 90, width: 640, height: 360, bitrate: 900000), fileSize: 10125000, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 10125000)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: nil, fileSize: 104857600, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 104857600), VideoChoice(quality: .smart, size: nil), VideoChoice(quality: .fixed(720), size: nil), VideoChoice(quality: .fixed(480), size: nil)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: nil, fileSize: 104857600, prefs: VideoUploadPrefs(mode: .original, height: 720, targetBytes: 52428800, minBytes: 26214400), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 104857600), VideoChoice(quality: .smart, size: nil), VideoChoice(quality: .fixed(720), size: nil), VideoChoice(quality: .fixed(480), size: nil)], "original")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 8000000), fileSize: 600000000, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 600000000), VideoChoice(quality: .smart, size: 20850000), VideoChoice(quality: .fixed(1080), size: 384600000), VideoChoice(quality: .fixed(720), size: 219600000), VideoChoice(quality: .fixed(480), size: 114600000)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 8000000), fileSize: 600000000, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 600000000), VideoChoice(quality: .smart, size: 23592975), VideoChoice(quality: .fixed(1080), size: 384600000), VideoChoice(quality: .fixed(720), size: 219600000), VideoChoice(quality: .fixed(480), size: 114600000)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 20, width: 1920, height: 1080, bitrate: 8000000), fileSize: 20000000, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 20000000), VideoChoice(quality: .smart, size: 13447987), VideoChoice(quality: .fixed(1080), size: 12820000), VideoChoice(quality: .fixed(720), size: 7320000), VideoChoice(quality: .fixed(480), size: 3820000)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 20, width: 1920, height: 1080, bitrate: 8000000), fileSize: 20000000, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 20000000), VideoChoice(quality: .fixed(1080), size: 12820000), VideoChoice(quality: .fixed(720), size: 7320000), VideoChoice(quality: .fixed(480), size: 3820000)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 3000000), fileSize: 45000000, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 45000000), VideoChoice(quality: .smart, size: 13447980), VideoChoice(quality: .fixed(480), size: 22920000)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 3000000), fileSize: 45000000, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 45000000), VideoChoice(quality: .smart, size: 23592960), VideoChoice(quality: .fixed(480), size: 22920000)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 90, width: 640, height: 360, bitrate: 900000), fileSize: 10125000, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 10125000)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 90, width: 640, height: 360, bitrate: 900000), fileSize: 10125000, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 10125000)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: nil, fileSize: 104857600, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 104857600), VideoChoice(quality: .smart, size: nil), VideoChoice(quality: .fixed(1080), size: nil), VideoChoice(quality: .fixed(720), size: nil), VideoChoice(quality: .fixed(480), size: nil)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: nil, fileSize: 104857600, prefs: VideoUploadPrefs(mode: .fixed, height: 1080, targetBytes: 26214400, minBytes: 10485760), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 104857600), VideoChoice(quality: .smart, size: nil), VideoChoice(quality: .fixed(1080), size: nil), VideoChoice(quality: .fixed(720), size: nil), VideoChoice(quality: .fixed(480), size: nil)], "fixed1080")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 8000000), fileSize: 600000000, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 600000000), VideoChoice(quality: .smart, size: 20850000), VideoChoice(quality: .fixed(720), size: 219600000), VideoChoice(quality: .fixed(480), size: 114600000)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 600, width: 1920, height: 1080, bitrate: 8000000), fileSize: 600000000, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 600000000), VideoChoice(quality: .smart, size: 89653275), VideoChoice(quality: .fixed(720), size: 219600000), VideoChoice(quality: .fixed(480), size: 114600000)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 20, width: 1920, height: 1080, bitrate: 8000000), fileSize: 20000000, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 20000000), VideoChoice(quality: .smart, size: 13447987), VideoChoice(quality: .fixed(720), size: 7320000), VideoChoice(quality: .fixed(480), size: 3820000)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 20, width: 1920, height: 1080, bitrate: 8000000), fileSize: 20000000, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 20000000), VideoChoice(quality: .fixed(720), size: 7320000), VideoChoice(quality: .fixed(480), size: 3820000)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 3000000), fileSize: 45000000, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 45000000), VideoChoice(quality: .smart, size: 13447980), VideoChoice(quality: .fixed(480), size: 22920000)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 120, width: 1280, height: 720, bitrate: 3000000), fileSize: 45000000, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 45000000), VideoChoice(quality: .fixed(480), size: 22920000)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 90, width: 640, height: 360, bitrate: 900000), fileSize: 10125000, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 10125000)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: VideoMeta(durationSec: 90, width: 640, height: 360, bitrate: 900000), fileSize: 10125000, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 10125000)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: nil, fileSize: 104857600, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 15728640),
                       [VideoChoice(quality: .original, size: 104857600), VideoChoice(quality: .smart, size: nil), VideoChoice(quality: .fixed(720), size: nil), VideoChoice(quality: .fixed(480), size: nil)], "fixed480")
        XCTAssertEqual(VideoPlan.choices(meta: nil, fileSize: 104857600, prefs: VideoUploadPrefs(mode: .fixed, height: 480, targetBytes: 104857600, minBytes: 104857600), maxUploadBytes: 104857600),
                       [VideoChoice(quality: .original, size: 104857600), VideoChoice(quality: .smart, size: nil), VideoChoice(quality: .fixed(720), size: nil), VideoChoice(quality: .fixed(480), size: nil)], "fixed480")
    }

    func testScaledSizeKeepsTheShapeAndStaysEven() {
        XCTAssertEqual(VideoPlan.scaledSize(width: 1920, height: 1080, shortSideTarget: 720).width, 1280)
        XCTAssertEqual(VideoPlan.scaledSize(width: 1920, height: 1080, shortSideTarget: 720).height, 720)
        XCTAssertEqual(VideoPlan.scaledSize(width: 1080, height: 1920, shortSideTarget: 480).width, 480)
        XCTAssertEqual(VideoPlan.scaledSize(width: 1080, height: 1920, shortSideTarget: 480).height, 854)
        // Already small enough: only made even
        XCTAssertEqual(VideoPlan.scaledSize(width: 641, height: 361, shortSideTarget: 720).width, 642)
        XCTAssertEqual(VideoPlan.scaledSize(width: 641, height: 361, shortSideTarget: 720).height, 362)
    }

    func testEstimateIsTheOriginalWhenNothingIsPlanned() {
        let meta = VideoMeta(durationSec: 10, width: 1280, height: 720, bitrate: 1_000_000)
        XCTAssertEqual(VideoPlan.estimateCompressedSize(meta, .smart(maxBytes: 50_000_000), originalSize: 1_250_000), 1_250_000)
    }
}
