import SwiftUI

/// Drives the viewer's backdrop while a picture is dragged away. Only the backdrop observes it, so
/// a drag does not re-render the pager or the pictures.
@MainActor
final class MediaDismissProgress: ObservableObject {
    @Published var value: CGFloat = 0
}

/// A picture that can be pinched up to 6x (and stays zoomed), panned while zoomed, zoomed in and out
/// by double tap, and, at 1x, dragged vertically: it follows the finger, and letting go past a fifth
/// of the height (or with a flick) closes the viewer. A sideways drag at 1x is left to the pager
/// around it; `isZoomed` tells the pager to stop paging while zoomed.
///
/// The transform lives in plain `@State` that is only read in `scaleEffect` and `offset`.
struct ZoomableImage: View {
    let image: UIImage
    @Binding var isZoomed: Bool
    let progress: MediaDismissProgress
    var onTap: () -> Void = {}
    var onLongPress: () -> Void = {}
    var onDismiss: () -> Void = {}

    private static let maxScale: CGFloat = 6
    private static let doubleTapScale: CGFloat = 3

    /// The committed zoom and pan, plus the live pinch and drag on top of them
    @State private var scale: CGFloat = 1
    @State private var pinch: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var pan: CGSize = .zero
    @State private var dismissY: CGFloat = 0
    /// Whether the drag in progress at 1x is vertical (decided by its first movement)
    @State private var verticalDrag: Bool?

    private var liveScale: CGFloat { min(max(scale * pinch, 1), Self.maxScale) }

    var body: some View {
        GeometryReader { geometry in
            let viewport = geometry.size
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: viewport.width, height: viewport.height)
                .scaleEffect(liveScale)
                .offset(x: offset.width + pan.width, y: offset.height + pan.height + dismissY)
                .contentShape(Rectangle())
                .onTapGesture(count: 2) { toggleZoom() }
                .onTapGesture { onTap() }
                .onLongPressGesture(minimumDuration: 0.5) { onLongPress() }
                .simultaneousGesture(magnify(viewport))
                .simultaneousGesture(drag(viewport))
        }
        .clipped()
    }

    // MARK: Geometry

    /// The size the picture takes at 1x inside the viewport
    private func fitted(in viewport: CGSize) -> CGSize {
        guard image.size.width > 0, image.size.height > 0 else { return viewport }
        let ratio = min(viewport.width / image.size.width, viewport.height / image.size.height)
        return CGSize(width: image.size.width * ratio, height: image.size.height * ratio)
    }

    /// Keeps the zoomed picture from being panned past its edges
    private func clamped(_ value: CGSize, scale: CGFloat, viewport: CGSize) -> CGSize {
        let size = fitted(in: viewport)
        let maxX = max((size.width * scale - viewport.width) / 2, 0)
        let maxY = max((size.height * scale - viewport.height) / 2, 0)
        return CGSize(width: min(max(value.width, -maxX), maxX), height: min(max(value.height, -maxY), maxY))
    }

    // MARK: Gestures

    private func toggleZoom() {
        let wasZoomed = scale > 1.01
        withAnimation(.spring(duration: 0.3)) {
            scale = wasZoomed ? 1 : Self.doubleTapScale
            offset = .zero
        }
        isZoomed = !wasZoomed
    }

    private func magnify(_ viewport: CGSize) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                pinch = value.magnification
                let zoomedNow = liveScale > 1.01
                if zoomedNow != isZoomed { isZoomed = zoomedNow }
            }
            .onEnded { value in
                let target = min(max(scale * value.magnification, 1), Self.maxScale)
                withAnimation(.spring(duration: 0.25)) {
                    scale = target
                    pinch = 1
                    offset = target > 1.01 ? clamped(offset, scale: target, viewport: viewport) : .zero
                }
                isZoomed = target > 1.01
            }
    }

    private func drag(_ viewport: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                if scale > 1.01 {
                    let proposed = CGSize(width: offset.width + value.translation.width,
                                          height: offset.height + value.translation.height)
                    let limited = clamped(proposed, scale: liveScale, viewport: viewport)
                    pan = CGSize(width: limited.width - offset.width, height: limited.height - offset.height)
                } else {
                    if verticalDrag == nil {
                        verticalDrag = abs(value.translation.height) > abs(value.translation.width)
                    }
                    guard verticalDrag == true else { return }
                    dismissY = value.translation.height
                    progress.value = min(abs(dismissY) / max(viewport.height * 0.5, 1), 1)
                }
            }
            .onEnded { value in
                defer { verticalDrag = nil }
                if scale > 1.01 {
                    offset = CGSize(width: offset.width + pan.width, height: offset.height + pan.height)
                    pan = .zero
                } else if verticalDrag == true {
                    let far = abs(dismissY) > viewport.height * 0.2
                    let flick = abs(value.velocity.height) > 900 && value.velocity.height * dismissY > 0
                    if far || flick {
                        onDismiss()
                    } else {
                        withAnimation(.spring(duration: 0.3)) {
                            dismissY = 0
                            progress.value = 0
                        }
                    }
                }
            }
    }
}
