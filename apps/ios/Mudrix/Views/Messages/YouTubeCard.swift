import SwiftUI
import WebKit

/// What YouTube's oEmbed endpoint says about a video
private struct YouTubeInfo {
    let title: String?
    let channel: String?
    let thumbnailUrl: String?
}

@MainActor
private enum YouTubeOembed {
    private static var cache: [String: YouTubeInfo?] = [:]

    static func fetch(_ videoId: String) async -> YouTubeInfo? {
        if let cached = cache[videoId] { return cached }
        let info = await request(videoId)
        cache[videoId] = info
        return info
    }

    private static func request(_ videoId: String) async -> YouTubeInfo? {
        guard var components = URLComponents(string: "https://www.youtube.com/oembed") else { return nil }
        components.queryItems = [
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "url", value: "https://www.youtube.com/watch?v=\(videoId)"),
        ]
        guard let url = components.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        let thumbnail = json["thumbnail_url"] as? String
        return YouTubeInfo(
            title: json["title"] as? String,
            channel: json["author_name"] as? String,
            // Only YouTube's own image host is ever loaded
            thumbnailUrl: thumbnail?.hasPrefix("https://i.ytimg.com/") == true ? thumbnail : nil)
    }
}

/// A YouTube link as a card. Until the "show YouTube embeds?" question is answered only a small
/// prompt is shown. With embeds on, the title and picture come from the homeserver's link preview
/// (so YouTube does not see this device) or, without one (encrypted rooms), from YouTube's oEmbed.
/// The video itself loads from the privacy-enhanced youtube-nocookie.com only once play is tapped.
struct YouTubeCard: View {
    let url: URL
    let video: YouTubeVideo
    let loader: LinkPreviewLoader?

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.openURL) private var openURL
    @Environment(\.theme) private var theme
    @State private var preview: LinkPreviewData?
    @State private var info: YouTubeInfo?
    @State private var thumbnail: UIImage?
    @State private var playing = false

    var body: some View {
        switch prefs.youtubeEmbeds {
        case .off:
            EmptyView()
        case .ask:
            consent
        case .on:
            card
                .task(id: url) { await load() }
        }
    }

    private var consent: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(verbatim: "YouTube")
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
            Text(String(localized: "timeline.youtube.consent"))
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(theme.textPrimary)
            HStack(spacing: WZ.Space.space3) {
                Button(String(localized: "timeline.youtube.allow")) { prefs.youtubeEmbeds = .on }
                    .buttonStyle(PrimaryButtonStyle())
                Button(String(localized: "timeline.youtube.deny")) { prefs.youtubeEmbeds = .off }
                    .buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(WZ.Space.space4)
        .frame(maxWidth: WZ.Size.panel, alignment: .leading)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .padding(.top, WZ.Space.space2)
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            Text(verbatim: "YouTube")
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
            if let channel = info?.channel {
                Text(channel)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(1)
            }
            Button { openURL(url) } label: {
                Text(preview?.title ?? info?.title ?? String(localized: "timeline.youtube.video"))
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.linkColor)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
            .accessibilityHint(String(localized: "timeline.opensTheLink"))
            ZStack {
                Color.black
                if playing {
                    YouTubeEmbedPlayer(video: video)
                } else {
                    if let thumbnail {
                        Image(uiImage: thumbnail).resizable().scaledToFill()
                    }
                    Button { playing = true } label: {
                        Image("ph-play-fill")
                            .font(.system(size: WZ.SizeIcon.lg, weight: .semibold))
                            .foregroundStyle(theme.textOnAccent)
                            .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                            .background(theme.overlay, in: Circle())
                    }
                    .accessibilityLabel(String(localized: "timeline.youtube.play"))
                }
            }
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.md, style: .continuous))
        }
        .padding(WZ.Space.space4)
        .frame(maxWidth: WZ.Size.panel, alignment: .leading)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .padding(.top, WZ.Space.space2)
    }

    private func load() async {
        if let loader { preview = await loader.preview(for: url) }
        if preview?.title == nil { info = await YouTubeOembed.fetch(video.id) }
        // The homeserver's copy of the picture (never a direct third-party image), else YouTube's own host
        if let homeserverImage = preview?.imageUrl, homeserverImage.hasPrefix("mxc://") {
            thumbnail = await mediaLoader?.thumbnail(homeserverImage, size: 480)
        } else if let thumb = info?.thumbnailUrl, let remote = URL(string: thumb),
                  let (bytes, _) = try? await URLSession.shared.data(from: remote) {
            thumbnail = UIImage(data: bytes)
        }
    }
}

/// The privacy-enhanced YouTube player; it is given a referrer (an origin of ours) because it refuses to play without one
private struct YouTubeEmbedPlayer: UIViewRepresentable {
    let video: YouTubeVideo

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        let html = """
            <!doctype html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#000}</style>
            </head><body><iframe src="\(YouTubeLink.embedUrl(video))" title="YouTube"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>
            """
        view.loadHTMLString(html, baseURL: URL(string: "https://app.wizardchat.org/"))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}
}
