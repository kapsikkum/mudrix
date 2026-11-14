import SwiftUI

private struct MediaLoaderKey: EnvironmentKey {
    static let defaultValue: MediaLoader? = nil
}

extension EnvironmentValues {
    var mediaLoader: MediaLoader? {
        get { self[MediaLoaderKey.self] }
        set { self[MediaLoaderKey.self] = newValue }
    }
}

struct AvatarView: View {
    let name: String
    let url: String?
    var size: CGFloat = WZ.SizeAvatar.md
    var cornerRadius: CGFloat? = nil
    /// A resolved avatar decoration drawn around the picture; opt-in, so other avatars are unchanged
    var decoration: CosmeticValue? = nil

    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var image: UIImage?

    var body: some View {
        // The colour is only for the placeholder; transparent pictures show what's behind them
        let shown = image ?? url.flatMap { mediaLoader?.cachedThumbnail($0) }
        shape
            .fill(shown == nil ? fallbackColor : .clear)
            .overlay {
                if let shown {
                    Image(uiImage: shown)
                        .resizable()
                        .scaledToFill()
                } else {
                    ShadedWizardMark(color: theme.textOnAccent)
                        .frame(width: size * 0.58, height: size * 0.58)
                }
            }
            .clipShape(shape)
            .frame(width: size, height: size)
            .task(id: url) {
                guard let url, let mediaLoader else {
                    image = nil
                    return
                }
                image = await mediaLoader.thumbnail(url, size: Int(size * 3))
            }
            .overlay { CosmeticDecoration(value: decoration, size: size) }
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: cornerRadius ?? size / 2, style: .continuous)
    }

    private var fallbackColor: Color {
        let code = Double(name.unicodeScalars.first?.value ?? 63)
        let hue = (code * 137.508).truncatingRemainder(dividingBy: 360) / 360
        return Color(hue: hue, saturation: 0.75, brightness: 0.672)
    }
}

struct WizardLogo: View {
    var size: CGFloat = WZ.SizeAvatar.xl
    @EnvironmentObject private var prefs: AppPreferences

    /// Themed tones only when the themed app icon is on, so it matches the home screen icon.
    private var tones: (colors: [String], highlight: String) {
        guard prefs.themedAppIcon, !prefs.followSystemTheme else { return (MudMound.baseTones, MudMound.baseHighlight) }
        if prefs.theme == WZ.Theme.parrot.name {
            return (["#1E5128", "#34743E", "#A8201A", "#D7412F", "#E0A526", "#F5D547"], "#79C183")
        }
        if prefs.theme == WZ.Theme.hallow.name {
            return (["#111111", "#2B1F3A", "#4A2A78", "#7A4BC0", "#E65F00", "#FF9D00"], "#FFB84D")
        }
        return (MudMound.baseTones, MudMound.baseHighlight)
    }

    var body: some View {
        WizardLogoShape(colors: tones.colors.map { Color(hexString: $0) }, highlight: Color(hexString: tones.highlight))
            .frame(width: size, height: size)
            .accessibilityLabel(String(localized: "app.name"))
    }
}

/// The whole mud mound as one silhouette (every facet in one path), for single-colour uses such as CallKit's icon.
struct WizardMark: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        for facet in MudMound.facets {
            path.addPath(MudMound.path(facet.points, in: rect))
        }
        return path
    }
}

/// One tone of the mound, so a single-colour mark can keep its faceting (see `ShadedWizardMark`)
private struct WizardMarkTone: Shape {
    let tone: Int

    func path(in rect: CGRect) -> Path {
        var path = Path()
        for facet in MudMound.facets where facet.tone == tone {
            path.addPath(MudMound.path(facet.points, in: rect))
        }
        return path
    }
}

/// The mud mound in one colour, with facets shaded by tone (same opacities as the web mark)
struct ShadedWizardMark: View {
    var color: Color

    var body: some View {
        ZStack {
            ForEach(0..<MudMound.toneOpacity.count, id: \.self) { tone in
                WizardMarkTone(tone: tone).fill(color.opacity(MudMound.toneOpacity[tone]))
            }
        }
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.wizard(WZ.FontSize.lg, .semibold))
            .foregroundStyle(theme.textOnAccent)
            .frame(maxWidth: .infinity, minHeight: WZ.Space.space11)
            .background(configuration.isPressed ? theme.accentHover : theme.accent, in: Capsule())
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: WZ.MotionDuration.fast), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.wizard(WZ.FontSize.lg, .medium))
            .foregroundStyle(theme.control)
            .frame(maxWidth: .infinity, minHeight: WZ.Space.space11)
            .background(configuration.isPressed ? theme.bgActive : theme.fill, in: Capsule())
            .opacity(isEnabled ? 1 : 0.4)
    }
}

struct WizardFieldStyle: ViewModifier {
    @Environment(\.theme) private var theme

    func body(content: Content) -> some View {
        content
            .font(.wizard(WZ.FontSize.lg))
            .foregroundStyle(theme.textPrimary)
            .padding(.horizontal, WZ.Space.space5)
            .frame(minHeight: WZ.Space.space11)
            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
    }
}

extension View {
    func wizardField() -> some View { modifier(WizardFieldStyle()) }

    /// Liquid Glass on iOS 26+ for floating controls (HIG: only the functional layer, sparingly);
    /// a thick material before that.
    @ViewBuilder
    func floatingGlass<S: Shape>(in shape: S) -> some View {
        if #available(iOS 26, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.thickMaterial, in: shape)
        }
    }
}

extension ToolbarContent {
    @ToolbarContentBuilder
    func glassBackgroundHidden() -> some ToolbarContent {
        if #available(iOS 26, *) {
            self.sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}

extension WizardTheme {
    var fill: Color { bgHover }
    var groupedBackground: Color { colorScheme == .dark ? bgPrimary : bgSecondary }
    var groupedRow: Color { colorScheme == .dark ? bgSecondary : bgPrimary }
}

struct ThemedForm<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @Environment(\.theme) private var theme

    var body: some View {
        Form { content().listRowBackground(theme.groupedRow) }
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
    }
}

struct ThemedList<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @Environment(\.theme) private var theme

    var body: some View {
        List { content().listRowBackground(theme.groupedRow) }
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
    }
}

struct LineDivider: View {
    let text: String
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space4) {
            line
            Text(text).layoutPriority(1)
            line
        }
    }

    private var line: some View {
        Rectangle().fill(theme.border).frame(height: WZ.Space.space0)
    }
}

struct UnreadBadge: View {
    let count: Int
    let isMention: Bool
    @Environment(\.theme) private var theme

    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.wizard(WZ.FontSize.xs, .bold))
            .foregroundStyle(theme.textOnAccent)
            .padding(.horizontal, WZ.Space.space3)
            .padding(.vertical, WZ.Space.space0)
            .frame(minWidth: WZ.Space.space6)
            .background(isMention ? theme.mention : theme.accent, in: Capsule())
    }
}

@MainActor
final class CopyToast: ObservableObject {
    static let shared = CopyToast()
    @Published private(set) var message: String?
    private var hideTask: Task<Void, Never>?

    func show(_ message: String) {
        self.message = message
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(1.6))
            guard !Task.isCancelled else { return }
            self.message = nil
        }
    }
}

@MainActor
func copyToClipboard(_ text: String, message: String = String(localized: "common.copied")) {
    UIPasteboard.general.string = text
    CopyToast.shared.show(message)
}

struct CopyToastView: View {
    @ObservedObject private var toast = CopyToast.shared
    @Environment(\.theme) private var theme

    var body: some View {
        ZStack {
            if let message = toast.message { label(message) }
        }
        .animation(.spring(duration: WZ.MotionDuration.slow), value: toast.message)
        .allowsHitTesting(false)
    }

    private func label(_ message: String) -> some View {
        Label(message, image: "ph-check-circle-fill")
                .font(.wizard(WZ.FontSize.md, .semibold))
                .foregroundStyle(theme.textPrimary)
                .padding(.horizontal, WZ.Space.space6)
                .padding(.vertical, WZ.Space.space4)
                .floatingGlass(in: Capsule())
                .transition(.move(edge: .top).combined(with: .opacity))
                .accessibilityAddTraits(.updatesFrequently)
                .onAppear { UIAccessibility.post(notification: .announcement, argument: message) }
    }
}

struct CopyButton: View {
    let title: LocalizedStringKey
    let image: String
    let value: String
    @State private var copied = false

    var body: some View {
        Button {
            UIPasteboard.general.string = value
            copied = true
            Task {
                try? await Task.sleep(for: .seconds(1.6))
                copied = false
            }
        } label: {
            if copied {
                Label(String(localized: "common.copied"), image: "ph-check-bold")
            } else {
                Label(title, image: image)
            }
        }
        .animation(.easeOut(duration: WZ.MotionDuration.fast), value: copied)
        .sensoryFeedback(.success, trigger: copied) { _, new in new }
    }
}

struct ConnectionBanner: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    var body: some View {
        if session.connectionLost {
            HStack(spacing: WZ.Space.space4) {
                ProgressView().controlSize(.small).tint(theme.textOnAccent)
                Text(String(localized: "common.offlineReconnecting"))
                    .font(.wizard(WZ.FontSize.md, .semibold))
            }
            .foregroundStyle(theme.textOnAccent)
            .padding(.horizontal, WZ.Space.space5)
            .padding(.vertical, WZ.Space.space4)
            .background(theme.warningColor, in: Capsule())
            .accessibilityElement(children: .combine)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

struct VerificationBanner: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var showVerify = false
    @AppStorage("verificationBannerDismissed") private var dismissed = false

    var body: some View {
        if session.encryption?.deviceVerified == false && !dismissed {
            HStack(spacing: WZ.Space.space5) {
                Image("ph-shield-warning-regular")
                    .font(.system(size: WZ.SizeIcon.lg))
                    .foregroundStyle(theme.danger)
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(String(localized: "verification.session.title"))
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(String(localized: "common.useAnotherDeviceOr"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Button { dismissed = true } label: {
                    Image("ph-x-regular").font(.system(size: WZ.SizeIcon.xs, weight: .bold)).foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "common.dismiss"))
            }
            .padding(WZ.Space.space5)
            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            .contentShape(Rectangle())
            .onTapGesture { showVerify = true }
            .accessibilityAddTraits(.isButton)
            .sheet(isPresented: $showVerify) {
                NavigationStack {
                    SessionsSettings()
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { showVerify = false } }
                        }
                }
            }
        }
    }
}

extension Label where Title == Text, Icon == Image {
    init(menu title: String, icon: String, destructive: Bool = false) {
        self.init { Text(title) } icon: { Image.menuIcon(icon, destructive: destructive) }
    }

    init(menu title: LocalizedStringKey, icon: String, destructive: Bool = false) {
        self.init { Text(title) } icon: { Image.menuIcon(icon, destructive: destructive) }
    }
}

extension Image {
    static func menuIcon(_ name: String, destructive: Bool = false) -> Image {
        guard let image = UIImage(named: name) else { return Image(name) }
        return Image(uiImage: image.withTintColor(destructive ? .systemRed : .label, renderingMode: .alwaysOriginal))
    }
}

private struct TabTitle: ViewModifier {
    let title: String
    @Environment(\.theme) private var theme

    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { Color.clear.frame(width: 0, height: 0) }
                ToolbarItem(placement: .topBarLeading) {
                    Text(title)
                        .font(.wizard(WZ.FontSize.display, .bold))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                        .fixedSize()
                        .accessibilityAddTraits(.isHeader)
                }
                .glassBackgroundHidden()
            }
    }
}

extension View {
    func tabTitle(_ title: String) -> some View { modifier(TabTitle(title: title)) }
}
