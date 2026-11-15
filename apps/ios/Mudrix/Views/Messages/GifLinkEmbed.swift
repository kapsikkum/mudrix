import MudrixCore
import SwiftUI

/// Turns a message that is nothing but one GIPHY or KLIPY link into the GIF it names, the web's `GifLinkEmbed`
/// and Android's `ui/room/GifLinkEmbed.kt`. Nothing is fetched until the person agreed to contact the GIF
/// services (the same consent the picker asks for), and a link that cannot be resolved stays a link.
@MainActor
final class GifLinkLoader: ObservableObject {
    /// The GIF to draw; nil while loading, when it is not a GIF link, or when it could not be fetched
    @Published private(set) var item: GiphyGif?
    /// The link named a GIF that could not be fetched (so the row shows the link instead)
    @Published private(set) var failed = false

    /// The link last asked about, so a row that is re-drawn does not fetch again
    private var loaded: String?

    func load(_ link: GifLink?, consented: Bool) async {
        guard let link, consented else {
            // Most rows are not GIF links; leaving their state alone keeps the timeline from redrawing every row
            guard item != nil || loaded != nil else { return }
            item = nil
            failed = false
            loaded = nil
            return
        }
        let key = link.cacheKey
        if loaded == key { return }
        loaded = key
        failed = false
        // A GIPHY link (and a direct KLIPY file) needs no API call
        if let direct = GifLink.direct(link) {
            item = direct
            return
        }
        item = nil
        guard let slug = link.klipySlug, GifProvider.klipy.isConfigured else {
            failed = true
            return
        }
        let found = await GifApi.klipyBySlug(slug)
        guard !Task.isCancelled else { return }
        item = found
        failed = found == nil
    }
}

/// The GIF a link names, in the box a sent GIF takes: sized from its own shape, scaled to the media maximum
struct GifLinkPicture: View {
    let item: GiphyGif

    private static let maxWidth: CGFloat = 260
    private static let maxHeight: CGFloat = 340

    /// The GIF's own shape, kept between a fifth as wide and half as tall; a link carries no size, so it takes the
    /// wider box the web and Android use for one
    private var ratio: CGFloat {
        let width = CGFloat(item.width), height = CGFloat(item.height)
        guard width > 0, height > 0 else { return 1.6 }
        return min(max(width / height, 0.5), 2.5)
    }

    private var size: CGSize {
        let width = min(Self.maxWidth, Self.maxHeight * ratio)
        return CGSize(width: width.rounded(), height: (width / ratio).rounded())
    }

    var body: some View {
        RemoteAnimatedImage(url: item.url)
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityLabel(item.title.isEmpty ? String(localized: "composer.gif") : item.title)
            .overlay(alignment: .topTrailing) {
                GifFavouriteStar(url: item.url)
            }
    }
}
