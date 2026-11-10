import SwiftUI
import UIKit

/// A round avatar drawn into an image, for places that only take images (tab bar items, menus)
@MainActor
enum AvatarImage {
    /// The picture at [url], else [fallback], else the initial placeholder
    static func circular(_ url: String?, name: String, media: MediaLoader?, theme: WizardTheme,
                         side: CGFloat, fallback: UIImage? = nil) async -> UIImage? {
        var image: UIImage?
        if let url, let media {
            image = media.cachedThumbnail(url)
            if image == nil { image = await media.thumbnail(url, size: 96) }
        }
        if let image = image ?? fallback { return circle(image, side: side) }
        let renderer = ImageRenderer(content: AvatarView(name: name, url: nil, size: side).environment(\.theme, theme))
        renderer.scale = UITraitCollection.current.displayScale
        return renderer.uiImage?.withRenderingMode(.alwaysOriginal)
    }

    static func circle(_ image: UIImage, side: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { _ in
            UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: side, height: side)).addClip()
            let scale = max(side / image.size.width, side / image.size.height)
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            image.draw(in: CGRect(x: (side - size.width) / 2, y: (side - size.height) / 2, width: size.width, height: size.height))
        }.withRenderingMode(.alwaysOriginal)
    }
}
