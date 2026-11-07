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
