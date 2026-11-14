import SwiftUI
import WizardChatCore

extension CosmeticPacks {
    /// A nameplate palette as a colour
    static func paletteColor(_ palette: String?) -> Color {
        let rgb = paletteRGB(palette)
        return Color(red: rgb.red, green: rgb.green, blue: rgb.blue)
    }
}

/// A pack cosmetic's image, fetched with the session's own login
struct CosmeticImage: View {
    let url: String
    var contentMode: ContentMode = .fit

    @Environment(\.mediaLoader) private var mediaLoader
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
            } else {
                Color.clear
            }
        }
        .task(id: url) { image = await mediaLoader?.thumbnail(url, size: 320) }
    }
}

/// A pack cosmetic that plays when it is animated (GIF, APNG, WebP)
struct CosmeticAnimatedImage: View {
    let url: String

    @Environment(\.mediaLoader) private var mediaLoader
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image, image.images != nil {
                AnimatedImageView(image: image, contentMode: .scaleAspectFit)
                    .allowsHitTesting(false)
            } else if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                Color.clear
            }
        }
        .task(id: url) {
            image = await mediaLoader?.thumbnail(url, size: 320)
            if let full = await mediaLoader?.image(for: .object(["url": .string(url)]), thumbnailSize: nil, animated: true) {
                image = full
            }
        }
    }
}

/// A pack effect's one-shot intro, played once and then handing over to the loop
struct CosmeticIntroImage: View {
    let url: String
    let onFinished: () -> Void

    @Environment(\.mediaLoader) private var mediaLoader
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                AnimatedImageView(image: image, contentMode: .scaleAspectFit, loops: 1)
            } else {
                Color.clear
            }
        }
        .task(id: url) {
            guard let loaded = await mediaLoader?.image(for: .object(["url": .string(url)]),
                                                        thumbnailSize: nil, animated: true) else {
                onFinished()
                return
            }
            image = loaded
            let seconds = max(loaded.duration, 0.4)
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            onFinished()
        }
    }
}

/// The avatar decoration of a resolved cosmetic, drawn over the avatar
struct CosmeticDecoration: View {
    let value: CosmeticValue?
    let size: CGFloat

    var body: some View {
        if let url = CosmeticPacks.mediaURL(value) {
            CosmeticImage(url: url)
                .frame(width: size * 1.2, height: size * 1.2)
                .allowsHitTesting(false)
        } else if case .id(let id)? = value, let image = BuiltinCosmetics.decoration(id) {
            Image(image)
                .resizable()
                .scaledToFit()
                .frame(width: size * 1.2, height: size * 1.2)
                .allowsHitTesting(false)
        }
    }
}

/// The presence dot on an avatar's corner (online green, away amber, offline none), gated on `prefs.showPresence`
struct PresenceDot: View {
    let presence: Presence?
    var size: CGFloat = WZ.SizeAvatar.md
    var ringColor: Color? = nil

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    private var color: Color? {
        guard prefs.showPresence else { return nil }
        switch presence {
        case .online: return theme.presenceOnline
        case .unavailable: return theme.presenceAway
        case .offline, nil: return nil
        }
    }

    var body: some View {
        if let color {
            let diameter = max(8, size * 0.3)
            let inset = max(1.5, diameter * 0.14)
            Circle()
                .fill(color)
                .padding(inset)
                .frame(width: diameter, height: diameter)
                .background(ringColor ?? theme.bgPrimary, in: Circle())
                .allowsHitTesting(false)
        }
    }
}

/// The avatar of a person, with their decoration when cosmetic packs are on
struct CosmeticAvatar: View {
    let userId: String
    let name: String
    let url: String?
    var size: CGFloat = WZ.SizeAvatar.md
    var cornerRadius: CGFloat? = nil
    var presence: Presence? = nil
    var presenceRingColor: Color? = nil

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @State private var profile: ExtendedProfile?

    var body: some View {
        AvatarView(name: name, url: url, size: size, cornerRadius: cornerRadius,
                   decoration: CosmeticPacks.resolve(profile?.avatarDecoration, showPacks: prefs.showCosmeticPacks))
            .overlay(alignment: .bottomTrailing) {
                if let presence {
                    PresenceDot(presence: presence, size: size, ringColor: presenceRingColor)
                }
            }
            .task(id: "\(userId)|\(prefs.showCosmeticPacks)") {
                guard prefs.showCosmeticPacks, !userId.isEmpty, let client = session.client else { return }
                if let cached = CosmeticCache.shared.cached(userId) {
                    profile = cached
                } else {
                    profile = await CosmeticCache.shared.profile(userId, client: client)
                }
            }
    }
}

/// A nameplate's tint and art behind a name; the content alone without one
struct CosmeticNameplate<Content: View>: View {
    let value: CosmeticValue?
    @ViewBuilder let content: () -> Content

    @EnvironmentObject private var session: MatrixSession
    @State private var packPalette: String?

    var body: some View {
        if let value {
            let palette = CosmeticPacks.paletteColor(CosmeticPacks.nameplatePalette(value) ?? packPalette)
            content()
                .padding(.horizontal, WZ.Space.space3)
                .padding(.vertical, WZ.Space.space1)
                .background {
                    ZStack {
                        LinearGradient(colors: [palette.opacity(0.2), palette.opacity(0.55)], startPoint: .leading,
                                       endPoint: .trailing)
                        if let url = CosmeticPacks.mediaURL(value) {
                            CosmeticImage(url: url, contentMode: .fill)
                        } else if let image = builtinArt(value) {
                            Image(image).resizable().scaledToFill()
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.sm, style: .continuous))
                .task(id: "\(value.url)|\(CosmeticPacks.nameplatePalette(value) ?? "")") {
                    packPalette = nil
                    guard CosmeticPacks.nameplatePalette(value) == nil,
                          let url = CosmeticPacks.mediaURL(value) else { return }
                    packPalette = await CosmeticPackLibrary.nameplatePalette(for: url, session: session)
                }
        } else {
            content()
        }
    }

    private func builtinArt(_ value: CosmeticValue) -> String? {
        guard case .id(let id) = value else { return nil }
        return BuiltinCosmetics.nameplate(id)?.image
    }
}

/// A person's name with their nameplate, loaded once per person
struct CosmeticName<Content: View>: View {
    let userId: String
    @ViewBuilder let content: () -> Content

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @State private var nameplate: CosmeticValue?

    var body: some View {
        CosmeticNameplate(value: CosmeticPacks.resolve(nameplate, showPacks: prefs.showCosmeticPacks), content: content)
            .task(id: "\(userId)|\(prefs.showCosmeticPacks)") {
                guard prefs.showCosmeticPacks, !userId.isEmpty, let client = session.client else { return }
                if let cached = CosmeticCache.shared.cached(userId) {
                    nameplate = cached.nameplate
                } else {
                    nameplate = await CosmeticCache.shared.profile(userId, client: client)?.nameplate
                }
            }
    }
}

/// A profile frame's pieces for one layer, placed around the avatar by position
struct CosmeticFramePieces: View {
    let value: CosmeticValue?
    let layer: String
    let size: CGFloat

    private var pieces: [CosmeticFramePiece] {
        switch value {
        case .frame(let url, let pieces)?:
            if !pieces.isEmpty { return pieces.filter { ($0.layer ?? "front") == layer } }
            guard !url.isEmpty, layer == "front" else { return [] }
            return [CosmeticFramePiece(url: url, pos: "center", layer: "front")]
        case .id(let url)? where url.hasPrefix("mxc://"):
            return layer == "front" ? [CosmeticFramePiece(url: url, pos: "center", layer: "front")] : []
        default: return []
        }
    }

    private var builtinPieces: [BuiltinFrameArt] {
        guard case .id(let id)? = value, !id.hasPrefix("mxc://") else { return [] }
        return BuiltinCosmetics.frame(id).filter { $0.layer == layer }
    }

    var body: some View {
        if !pieces.isEmpty {
            ZStack {
                ForEach(Array(pieces.enumerated()), id: \.offset) { _, piece in
                    CosmeticImage(url: piece.url)
                        .frame(width: size, height: piece.pos == "center" ? size : max(1, size * 0.45))
                        .offset(y: piece.pos == "top" ? -size * 0.3 : piece.pos == "bottom" ? size * 0.3 : 0)
                }
            }
            .frame(width: size, height: size)
            .allowsHitTesting(false)
        } else if !builtinPieces.isEmpty {
            BuiltinFrameArtLayer(pieces: builtinPieces, size: size)
        }
    }
}

/// A person's profile effect, looping over their profile card
struct CosmeticEffect: View {
    let value: CosmeticValue?

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion

    @State private var intro: String?
    @State private var introDone = false
    @State private var introResolved = false

    private var reducedMotion: Bool { prefs.reducesMotion(systemSetting: systemReduceMotion) }

    var body: some View {
        Group {
            if reducedMotion {
                EmptyView()
            } else if let url = CosmeticPacks.mediaURL(value) {
                if !introResolved {
                    Color.clear
                } else if let intro, !introDone {
                    CosmeticIntroImage(url: intro) { introDone = true }
                } else {
                    CosmeticAnimatedImage(url: url)
                }
            } else if case .id(let id)? = value, BuiltinEffectArt.draws(id) {
                BuiltinProfileEffect(id: id)
            }
        }
        .allowsHitTesting(false)
        .task(id: "\(value?.url ?? "")|\(reducedMotion)") {
            intro = nil
            introDone = false
            introResolved = reducedMotion || CosmeticPacks.mediaURL(value) == nil
            guard !reducedMotion, let url = CosmeticPacks.mediaURL(value) else { return }
            intro = await CosmeticPackLibrary.effectIntro(for: url, session: session)
            introResolved = true
        }
    }
}
