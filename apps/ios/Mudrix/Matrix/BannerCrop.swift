/// The part of a picture kept for a profile banner: the same rectangle as the web's `cropRect`
/// (apps/web/src/util/cropImage.ts) and Android's `BannerCrop`.
enum BannerCrop {
    /// Banners are shown in a 3:1 frame (width / height)
    static let aspect: Double = 3

    struct Rect: Equatable {
        var x: Int
        var y: Int
        var width: Int
        var height: Int
    }

    /// The part of a `width` x `height` picture kept for the 3:1 banner, `focus` (0...1, clamped)
    /// picking the slice of the axis that overflows: 0 = top/left, 0.5 = centre, 1 = bottom/right
    static func rect(width: Int, height: Int, focus: Double) -> Rect {
        guard width > 0, height > 0 else { return Rect(x: 0, y: 0, width: max(width, 0), height: max(height, 0)) }
        let clamped = min(max(focus, 0), 1)
        let source = Double(width) / Double(height)
        var x = 0
        var y = 0
        var w = width
        var h = height
        if source > aspect {
            w = max(Int((Double(height) * aspect).rounded()), 1)
            x = Int((Double(width - w) * clamped).rounded())
        } else if source < aspect {
            h = max(Int((Double(width) / aspect).rounded()), 1)
            y = Int((Double(height - h) * clamped).rounded())
        }
        return Rect(x: x, y: y, width: w, height: h)
    }
}
