import SwiftUI

/// Where a pinch has to move a picture so the spot under the fingers stays under them, the web's and Android's
/// zoom-to-point. Kept apart from the gesture so the arithmetic can be checked without a view.
enum ZoomAnchor {
    /// The offset that keeps the point `anchor` of the viewport in place while the picture goes from
    /// `fromScale` to `toScale`, starting from `current` (the offset it had at `fromScale`).
    ///
    /// An offset is the picture's displacement from the viewport centre. The point under `anchor` sits at
    /// `current + anchor * fromScale` of the picture; it stays under `anchor` when the offset becomes
    /// `anchorPoint - (anchorPoint - current) * toScale / fromScale`, where `anchorPoint` is the anchor in
    /// viewport coordinates measured from the centre.
    static func offset(current: CGSize, anchor: UnitPoint, fromScale: CGFloat,
                       toScale: CGFloat, viewport: CGSize) -> CGSize {
        guard fromScale > 0, toScale > 0, viewport.width > 0, viewport.height > 0 else { return current }
        let ratio = toScale / fromScale
        guard ratio.isFinite else { return current }
        let point = CGPoint(x: (anchor.x - 0.5) * viewport.width, y: (anchor.y - 0.5) * viewport.height)
        return CGSize(width: point.x - (point.x - current.width) * ratio,
                      height: point.y - (point.y - current.height) * ratio)
    }
}
