import SwiftUI

/// A soft highlight that sweeps across a skeleton. It is one gradient mask whose end points move
/// with a single animated value, so the skeleton shapes themselves are never re-laid out.
/// With reduced motion (system setting or the app's own) the skeleton is just dimmed and still.
private struct ShimmerModifier: ViewModifier {
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @State private var phase: CGFloat = 0

    private var reduced: Bool { prefs.reducesMotion(systemSetting: systemReduceMotion) }

    func body(content: Content) -> some View {
        if reduced {
            content.opacity(0.7)
        } else {
            content
                .mask(
                    LinearGradient(
                        colors: [.black.opacity(0.4), .black, .black.opacity(0.4)],
                        startPoint: UnitPoint(x: phase * 2 - 1, y: 0.5),
                        endPoint: UnitPoint(x: phase * 2, y: 0.5)
                    )
                )
                .onAppear {
                    withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1 }
                }
        }
    }
}

extension View {
    /// Marks a placeholder as loading with a moving highlight
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}
