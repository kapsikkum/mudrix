import SwiftUI

/// Blurs private details (your Matrix ID, e-mail addresses, room IDs, session IPs) while streamer mode is active
private struct SensitiveModifier: ViewModifier {
    @EnvironmentObject private var prefs: AppPreferences

    func body(content: Content) -> some View {
        content
            .blur(radius: prefs.streamerModeActive ? 8 : 0)
            .accessibilityHidden(prefs.streamerModeActive)
    }
}

extension View {
    func sensitive() -> some View {
        modifier(SensitiveModifier())
    }
}

/// The eye icon beside your name while streamer mode is on; tapping it opens Settings > Privacy to change it
struct StreamerIndicatorButton: View {
    let action: () -> Void

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    var body: some View {
        if prefs.streamerModeActive {
            Button(action: action) {
                Icon("eye-slash", size: WZ.SizeIcon.md)
                    .foregroundStyle(theme.accent)
                    .frame(width: WZ.Size.touchTarget, height: WZ.Size.touchTarget)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "settings.privacy.streamer.indicator"))
            .accessibilityAddTraits(.isButton)
        }
    }
}

/// A slim bar under the status bar while streamer mode is on, for the Classic navigation, which has no user card
struct StreamerIndicatorBar: View {
    let action: () -> Void

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    var body: some View {
        if prefs.streamerModeActive {
            Button(action: action) {
                HStack(spacing: WZ.Space.space3) {
                    Icon("eye-slash", size: WZ.SizeIcon.sm)
                    Text(String(localized: "settings.privacy.streamer.indicator"))
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .lineLimit(1)
                }
                .foregroundStyle(theme.accent)
                .frame(maxWidth: .infinity, minHeight: WZ.Size.touchTarget)
                .background(theme.bgTertiary)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
        }
    }
}
