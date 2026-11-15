import MudrixCore
import SwiftUI

/// The top of a profile sheet: the person's banner flush under the drag handle (the sheet rounds its top corners), the
/// `menu` button inside it, and their picture overlapping its lower edge. The area below it is the plain sheet surface.
struct ProfileBannerHeader<MenuButton: View>: View {
    let userId: String
    let name: String
    let avatarUrl: String?
    let accent: String?
    let decoration: CosmeticValue?
    let profileFrame: CosmeticValue?
    let effect: CosmeticValue?
    @ViewBuilder let menu: () -> MenuButton

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var image: UIImage?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            VStack(spacing: 0) {
                banner
                Color.clear.frame(height: WZ.SizeAvatar.xl / 2)
            }
            AccentAvatar(name: name, url: avatarUrl, accent: accent, decoration: decoration, frame: profileFrame)
                .padding(.leading, WZ.Space.space6)
        }
        .task(id: userId) { await load() }
    }

    private var banner: some View {
        Rectangle()
            .fill(theme.fill)
            .aspectRatio(CGFloat(BannerCrop.aspect), contentMode: .fit)
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .allowsHitTesting(false)
                }
            }
            .overlay { CosmeticEffect(value: effect) }
            .clipped()
            .overlay(alignment: .topTrailing) {
                // Inside the banner, clear of the sheet's rounded top corner
                menu()
                    .padding(.top, WZ.Space.space8)
                    .padding(.trailing, WZ.Space.space6)
            }
    }

    private func load() async {
        image = nil
        guard let client = session.client,
              let mxc = (try? await client.banner(userId: userId)) ?? nil else { return }
        image = mediaLoader?.cachedThumbnail(mxc)
        if image == nil {
            image = await mediaLoader?.thumbnail(mxc, size: 640)
        }
    }
}
