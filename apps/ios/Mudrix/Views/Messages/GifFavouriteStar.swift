import SwiftUI

/// The star on a received GIF that saves it to the picker's favourites, the web's `GifFavouriteButton`.
/// It is refused when the list is full, as there.
struct GifFavouriteStar: View {
    /// The GIF's own address: an `mxc://` URL on the homeserver, or the provider's
    let url: String

    @Environment(\.theme) private var theme
    @ObservedObject private var favourites = GifFavourites.shared

    var body: some View {
        let isFavourite = favourites.isFavourite(url)
        let full = GifFavourites.isFull(favourites.urls, adding: url)
        Button {
            guard !full else { return }
            Task { await favourites.toggle(url) }
        } label: {
            Image(isFavourite ? "ph-star-fill" : "ph-star-regular")
                .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                .foregroundStyle(isFavourite ? theme.warningColor : theme.textOnAccent)
                .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                .background(theme.overlay, in: Circle())
                .opacity(full ? 0.5 : 1)
                .frame(width: WZ.Size.touchTarget, height: WZ.Size.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(isFavourite: isFavourite, full: full))
    }

    private func label(isFavourite: Bool, full: Bool) -> String {
        if isFavourite { return String(localized: "composer.removeFavourite") }
        if full { return String(localized: "composer.favouritesFull") }
        return String(localized: "composer.addFavourite")
    }
}
