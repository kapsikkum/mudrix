import AVFoundation
import ImageIO
import SwiftUI
import UIKit

enum MediaMetadata {
    static func imageSize(at url: URL) -> CGSize? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = props[kCGImagePropertyPixelWidth] as? CGFloat,
              let height = props[kCGImagePropertyPixelHeight] as? CGFloat else { return nil }
        return CGSize(width: width, height: height)
    }

    static func video(at url: URL) async -> (duration: TimeInterval?, size: CGSize?) {
        let asset = AVURLAsset(url: url)
        let duration = try? await asset.load(.duration).seconds
        var size: CGSize?
        if let track = try? await asset.loadTracks(withMediaType: .video).first,
           let natural = try? await track.load(.naturalSize),
           let transform = try? await track.load(.preferredTransform) {
            let rect = CGRect(origin: .zero, size: natural).applying(transform)
            size = CGSize(width: abs(rect.width), height: abs(rect.height))
        }
        return (duration, size)
    }

    static func duration(at url: URL) async -> TimeInterval? {
        try? await AVURLAsset(url: url).load(.duration).seconds
    }

    static func temporaryCopy(of data: Data, filename: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(filename)
        try data.write(to: url)
        return url
    }
}

enum AnimatedImage {
    static func image(from data: Data, animated: Bool) -> UIImage? {
        guard animated, let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            return UIImage(data: data)
        }
        let count = CGImageSourceGetCount(source)
        guard count > 1 else { return UIImage(data: data) }
        var frames: [UIImage] = []
        var duration: TimeInterval = 0
        for index in 0..<count {
            guard let cgImage = CGImageSourceCreateImageAtIndex(source, index, nil) else { continue }
            frames.append(UIImage(cgImage: cgImage))
            let props = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
            let frame = (props?[kCGImagePropertyGIFDictionary] ?? props?[kCGImagePropertyWebPDictionary]
                ?? props?[kCGImagePropertyPNGDictionary]) as? [CFString: Any]
            let delay = (frame?[kCGImagePropertyGIFUnclampedDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyGIFDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyWebPUnclampedDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyWebPDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyAPNGUnclampedDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyAPNGDelayTime] as? Double) ?? 0.1
            duration += max(delay, 0.02)
        }
        return UIImage.animatedImage(with: frames, duration: duration)
    }
}


/// Shows a UIImage and plays it when it's animated. SwiftUI's Image only draws the first
/// frame of an animated UIImage, so GIFs and animated stickers need a UIImageView.
struct AnimatedImageView: UIViewRepresentable {
    let image: UIImage
    var contentMode: UIView.ContentMode = .scaleAspectFill

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.clipsToBounds = true
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        return view
    }

    func updateUIView(_ view: UIImageView, context: Context) {
        view.contentMode = contentMode
        if view.image !== image {
            view.image = image
            if image.images != nil { view.startAnimating() }
        }
    }
}

private struct AnimatesMediaKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var animatesMedia: Bool {
        get { self[AnimatesMediaKey.self] }
        set { self[AnimatesMediaKey.self] = newValue }
    }
}
