import MudrixCore
import SwiftUI

struct GiphyGif: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let url: String
    let previewUrl: String
    let width: Int
    let height: Int
}

struct GifPicker: View {
    let onPick: (GiphyGif) async -> Void

    /// Both services' keys are set at build time (GIPHY_API_KEY / KLIPY_API_KEY in Config/Secrets.xcconfig, see
    /// docs/SECRETS.md); a service with an empty key is not offered
    private static var providers: [GifProvider] { GifProvider.allCases.filter(\.isConfigured) }
    private static let api = "https://api.giphy.com/v1/gifs"

    @Environment(\.theme) private var theme
    @AppStorage("gifConsent") private var consented = false
    /// The starred GIFs live in the account's data (`GifFavourites`), not on this device
    @ObservedObject private var favourites = GifFavourites.shared
    @State private var provider = GifProvider.giphy
    @State private var search = ""
    @State private var showFavourites = false
    @State private var results: [GiphyGif] = []
    @State private var loading = false
    @State private var sending = false

    /// The provider in use: the chosen one, or the only configured one (a tab whose service has no key falls back)
    private var activeProvider: GifProvider {
        Self.providers.contains(provider) ? provider : (Self.providers.first ?? .giphy)
    }

    /// A favourite is only its URL, as the web's `favouriteGifItem`: no Giphy id or dimensions
    private var favouriteGifs: [GiphyGif] {
        favourites.urls.map { url in
            GiphyGif(id: url, title: String(localized: "composer.gif"), url: url, previewUrl: url, width: 0, height: 0)
        }
    }

    var body: some View {
        if Self.providers.isEmpty {
            VStack(spacing: WZ.Space.space5) {
                Image("ph-images-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.textMuted)
                Text(String(localized: "composer.gifNotConfiguredTooltip"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.center)
            }
            .padding(WZ.Space.space8)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if !consented {
            VStack(spacing: WZ.Space.space5) {
                Image("ph-images-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.accent)
                Text(String(localized: "composer.gifConsentTitle"))
                    .font(.wizard(WZ.FontSize.xl, .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(String(localized: "composer.gifConsentBody"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.center)
                Button(String(localized: "composer.gifConsentEnable")) { consented = true }
                    .buttonStyle(PrimaryButtonStyle())
                    .frame(maxWidth: WZ.Size.sidebar)
            }
            .padding(WZ.Space.space8)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            VStack(spacing: WZ.Space.space0) {
                if Self.providers.count > 1 {
                    providerTabs
                }
                HStack(spacing: WZ.Space.space0) {
                    SearchBar(text: $search, prompt: activeProvider == .giphy ? "composer.searchGiphy" : "composer.searchKlipy")
                    Button {
                        showFavourites.toggle()
                    } label: {
                        Image(showFavourites ? "ph-star-fill" : "ph-star-regular")
                            .font(.system(size: WZ.SizeIcon.md))
                            .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                    }
                    .foregroundStyle(showFavourites ? theme.accent : theme.textMuted)
                    .padding(.trailing, WZ.Space.space3)
                    .accessibilityLabel(String(localized: "nav.favourites"))
                }
                ZStack {
                    if showFavourites {
                        favouritesGrid
                    } else {
                        grid(results)
                    }
                    if showFavourites && favourites.urls.isEmpty {
                        Text(String(localized: "composer.noFavourites"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                            .multilineTextAlignment(.center)
                            .padding(WZ.Space.space9)
                    } else if loading && results.isEmpty {
                        ProgressView().tint(theme.accent)
                    }
                    if sending {
                        ProgressView(String(localized: "composer.sendingGif"))
                            .padding(WZ.Space.space7)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                    }
                }
                // The provider's credit line, as on the web
                Text(L10n.format("composer.poweredBy", activeProvider.title))
                    .font(.wizard(WZ.FontSize.xs, .semibold))
                    .foregroundStyle(theme.textMuted)
                    .padding(.vertical, WZ.Space.space3)
            }
            .task(id: "\(activeProvider.id)|\(search)") {
                if !search.isEmpty { try? await Task.sleep(for: .milliseconds(350)) }
                guard !Task.isCancelled else { return }
                await load()
            }
        }
    }

    /// GIPHY and KLIPY side by side; a service with no key in this build is not offered
    private var providerTabs: some View {
        HStack(spacing: WZ.Space.space2) {
            ForEach(Self.providers) { option in
                let active = option == activeProvider
                Button {
                    guard !active else { return }
                    provider = option
                    results = []
                    showFavourites = false
                } label: {
                    Text(option.title)
                        .font(.wizard(WZ.FontSize.sm, active ? .semibold : .regular))
                        .foregroundStyle(active ? theme.textPrimary : theme.textMuted)
                        .padding(.horizontal, WZ.Space.space5)
                        .frame(height: WZ.Space.space8)
                        .background(active ? theme.fill : .clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, WZ.Space.space5)
        .padding(.top, WZ.Space.space3)
    }

    private func grid(_ gifs: [GiphyGif]) -> some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: WZ.Space.space3), GridItem(.flexible(), spacing: WZ.Space.space3)], spacing: WZ.Space.space3) {
                ForEach(gifs) { gif in
                    RemoteAnimatedImage(url: gif.previewUrl)
                        .aspectRatio(CGFloat(gif.width) / CGFloat(max(gif.height, 1)), contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        // A Button around the UIKit image view misses taps, so the cell takes them
                        .allowsHitTesting(false)
                        .contentShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        .onTapGesture {
                            send(gif)
                        }
                        .accessibilityAddTraits(.isButton)
                        .overlay(alignment: .topTrailing) {
                            let isFavourite = favourites.isFavourite(gif.url)
                            Button {
                                Task { await favourites.toggle(gif.url) }
                            } label: {
                                Image(isFavourite ? "ph-star-fill" : "ph-star-regular")
                                    .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                                    .foregroundStyle(isFavourite ? theme.warningColor : theme.textOnAccent)
                                    .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                                    .background(theme.overlay, in: Circle())
                            }
                            .padding(WZ.Space.space2)
                            .accessibilityLabel(isFavourite ? String(localized: "room.removeFavourite") : String(localized: "room.addFavourite"))
                        }
                        .accessibilityLabel(gif.title)
                }
            }
            .padding(.horizontal, WZ.Space.space5)
        }
    }

    /// The starred GIFs: square tiles drawn from their URL alone, since only the URL is kept
    private var favouritesGrid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: WZ.Space.space3), GridItem(.flexible(), spacing: WZ.Space.space3)], spacing: WZ.Space.space3) {
                ForEach(favouriteGifs) { gif in
                    RemoteAnimatedImage(url: gif.previewUrl)
                        .aspectRatio(1, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        // A Button around the UIKit image view misses taps, so the cell takes them
                        .allowsHitTesting(false)
                        .contentShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        .onTapGesture {
                            send(gif)
                        }
                        .accessibilityAddTraits(.isButton)
                        .overlay(alignment: .topTrailing) {
                            Button {
                                Task { await favourites.toggle(gif.url) }
                            } label: {
                                Image("ph-star-fill")
                                    .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                                    .foregroundStyle(theme.warningColor)
                                    .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                                    .background(theme.overlay, in: Circle())
                            }
                            .padding(WZ.Space.space2)
                            .accessibilityLabel(String(localized: "room.removeFavourite"))
                        }
                        .accessibilityLabel(gif.title)
                }
            }
            .padding(.horizontal, WZ.Space.space5)
        }
    }

    private func send(_ gif: GiphyGif) {
        guard !sending else { return }
        Task {
            sending = true
            await onPick(gif)
            sending = false
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        let query = search.trimmingCharacters(in: .whitespaces)
        if activeProvider == .klipy {
            results = query.isEmpty ? await GifApi.klipyTrending() : await GifApi.klipySearch(query)
            return
        }
        let key = GifProvider.giphy.key
        guard !key.isEmpty else {
            results = []
            return
        }
        let endpoint = query.isEmpty
            ? "\(Self.api)/trending?api_key=\(key)&limit=30"
            : "\(Self.api)/search?q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&api_key=\(key)&limit=30"
        guard let url = URL(string: endpoint),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = json["data"] as? [[String: Any]] else { return }
        results = items.compactMap { item in
            guard let id = item["id"] as? String, let images = item["images"] as? [String: [String: Any]] else { return nil }
            let full = images["downsized"] ?? images["original"]
            let preview = images["fixed_width"] ?? full
            guard let url = full?["url"] as? String, let previewUrl = preview?["url"] as? String else { return nil }
            return GiphyGif(id: id, title: item["title"] as? String ?? String(localized: "composer.gif"), url: url, previewUrl: previewUrl,
                            width: Int(full?["width"] as? String ?? "") ?? 200,
                            height: Int(full?["height"] as? String ?? "") ?? 200)
        }
    }
}

struct RemoteAnimatedImage: View {
    let url: String
    @Environment(\.theme) private var theme
    @Environment(\.mediaLoader) private var mediaLoader
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image { AnimatedImageView(image: image) } else { theme.fill }
        }
        .task(id: url) {
            // A GIF favourited from a message lives on the homeserver, where only the account can fetch it
            if url.hasPrefix("mxc://") {
                let source: MediaSource = .object(["url": .string(url)])
                image = await mediaLoader?.image(for: source, thumbnailSize: nil, animated: true)
                return
            }
            guard let url = URL(string: url), let (data, _) = try? await URLSession.shared.data(from: url) else { return }
            image = AnimatedImage.image(from: data, animated: true)
        }
    }
}
