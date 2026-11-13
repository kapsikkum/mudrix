import PhotosUI
import SwiftUI
import WizardChatCore

/// The own profile banner: shows it, picks a new one to position in a 3:1 frame, or removes it
struct BannerSection: View {
    var onError: (String) -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.mediaLoader) private var mediaLoader
    @State private var photo: PhotosPickerItem?
    @State private var pending: UIImage?
    @State private var cropping = false
    @State private var focus = 0.5
    @State private var hasBanner: Bool?
    @State private var bannerImage: UIImage?
    @State private var busy = false
    @State private var reload = 0

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space4) {
            Text(String(localized: "settings.account.banner"))
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
            if let bannerImage {
                Image(uiImage: bannerImage)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .aspectRatio(CGFloat(BannerCrop.aspect), contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous).fill(theme.fill)
                    if hasBanner == false {
                        Text(String(localized: "settings.account.noBanner"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                .aspectRatio(CGFloat(BannerCrop.aspect), contentMode: .fit)
            }
            Text(String(localized: "settings.account.bannerHint"))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
            HStack(spacing: WZ.Space.space5) {
                PhotosPicker(selection: $photo, matching: .images) {
                    Text(String(localized: hasBanner == true ? "settings.account.changeBanner" : "settings.account.uploadBanner"))
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.control)
                }
                .disabled(busy)
                if hasBanner == true {
                    Button(String(localized: "profile.removeBanner"), role: .destructive) {
                        Task { await remove() }
                    }
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.error)
                    .disabled(busy)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.vertical, WZ.Space.space3)
        .task(id: reload) { await load() }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                defer { photo = nil }
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = UIImage(data: data) else { return }
                focus = 0.5
                pending = image
                cropping = true
            }
        }
        .sheet(isPresented: $cropping) {
            if let pending {
                BannerCropSheet(image: pending, focus: $focus, busy: busy,
                                onApply: { Task { await upload(pending) } },
                                onCancel: { cropping = false })
            }
        }
    }

    private func load() async {
        guard let me = session.userId, let client = session.client else { return }
        let url = (try? await client.banner(userId: me)) ?? nil
        hasBanner = url != nil
        bannerImage = url.flatMap { mediaLoader?.cachedThumbnail($0) }
        if let url, bannerImage == nil {
            bannerImage = await mediaLoader?.thumbnail(url, size: 720)
        }
    }

    private func upload(_ image: UIImage) async {
        guard let data = Self.bannerJpeg(image, focus: focus) else { return }
        busy = true
        defer { busy = false }
        do {
            try await session.requireClient.setBanner(data: data, mimetype: "image/jpeg")
            cropping = false
            focus = 0.5
            pending = nil
            reload += 1
        } catch {
            onError(L10n.format("profile.bannerSaveFailed", error.localizedDescription))
        }
    }

    private func remove() async {
        busy = true
        defer { busy = false }
        do {
            try await session.requireClient.setBanner(data: nil, mimetype: nil)
            reload += 1
        } catch {
            onError(L10n.format("profile.bannerRemoveFailed", error.localizedDescription))
        }
    }

    /// The picked picture cut to the 3:1 strip at `focus`, at most 1200 pixels wide
    private static func bannerJpeg(_ image: UIImage, focus: Double) -> Data? {
        let pixelWidth = Int(image.size.width * image.scale)
        let pixelHeight = Int(image.size.height * image.scale)
        let rect = BannerCrop.rect(width: pixelWidth, height: pixelHeight, focus: focus)
        guard rect.width > 0, rect.height > 0,
              let cg = image.cgImage?.cropping(to: CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height))
        else { return nil }
        let cropped = UIImage(cgImage: cg)
        let target = cropped.size.width > 1200
            ? CGSize(width: 1200, height: CGFloat((1200 / BannerCrop.aspect).rounded()))
            : cropped.size
        return cropped.preparingThumbnail(of: target)?.jpegData(compressionQuality: 0.85)
    }
}

/// A 3:1 preview of a picked picture, with a slider for the part of it kept
private struct BannerCropSheet: View {
    let image: UIImage
    @Binding var focus: Double
    var busy: Bool
    var onApply: () -> Void
    var onCancel: () -> Void

    @Environment(\.theme) private var theme

    private var aspect: CGFloat { CGFloat(BannerCrop.aspect) }

    private var imageAspect: CGFloat {
        image.size.width / max(image.size.height, 1)
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: WZ.Space.space5) {
                GeometryReader { proxy in
                    let frame = proxy.size
                    let wide = imageAspect > aspect
                    let scaled = wide
                        ? CGSize(width: frame.height * imageAspect, height: frame.height)
                        : CGSize(width: frame.width, height: frame.width / imageAspect)
                    Image(uiImage: image)
                        .resizable()
                        .frame(width: scaled.width, height: scaled.height)
                        .offset(x: wide ? -(scaled.width - frame.width) * CGFloat(focus) : 0,
                                y: wide ? 0 : -(scaled.height - frame.height) * CGFloat(focus))
                }
                .aspectRatio(aspect, contentMode: .fit)
                .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                if imageAspect != aspect {
                    VStack(alignment: .leading, spacing: WZ.Space.space4) {
                        Text(String(localized: "settings.account.bannerPosition"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                        Slider(value: $focus, in: 0...1)
                            .tint(theme.accent)
                    }
                }
                HStack(spacing: WZ.Space.space4) {
                    Button(String(localized: "common.cancel")) { onCancel() }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(busy)
                    Button(String(localized: "common.apply")) { onApply() }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(busy)
                }
                Spacer(minLength: 0)
            }
            .padding(WZ.Space.space6)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "settings.account.banner"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { onCancel() }
                }
            }
            .tint(theme.control)
        }
        .presentationDetents([.medium, .large])
    }
}
