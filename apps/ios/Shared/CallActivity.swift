import ActivityKit
import AppIntents
import SwiftUI

struct CallActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var micMuted: Bool
        var deafened: Bool
        var othersSpeaking: Bool
        var speakerName: String?
        var participantCount: Int
        var ringing: Bool
    }

    var roomName: String
    var isDirect: Bool
    var startedAt: Date
}

@MainActor
enum CallActivityActions {
    static var toggleMic: (() -> Void)?
    static var toggleDeafen: (() -> Void)?
    static var leave: (() -> Void)?
}

struct ToggleMicIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "call.toggleMicIntent"
    func perform() async throws -> some IntentResult {
        await MainActor.run { CallActivityActions.toggleMic?() }
        return .result()
    }
}

struct ToggleDeafenIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "call.toggleDeafenIntent"
    func perform() async throws -> some IntentResult {
        await MainActor.run { CallActivityActions.toggleDeafen?() }
        return .result()
    }
}

struct LeaveCallIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "call.leave"
    func perform() async throws -> some IntentResult {
        await MainActor.run { CallActivityActions.leave?() }
        return .result()
    }
}

/// The Mudrix mud mound (geometry copied from apps/web/src/theme/mudMoundGeometry.ts, viewBox 0 0 400 400).
/// Lives here so the app and the widget extension draw the same artwork.
enum MudMound {
    struct Facet {
        /// 0 is the darkest tone, 5 the lightest
        let tone: Int
        let points: [CGPoint]
    }

    private static let rows: [(Int, [CGFloat])] = [
        (4, [60, 200, 130, 120, 125, 205]),
        (5, [130, 120, 210, 140, 125, 205]),
        (5, [130, 120, 210, 55, 210, 140]),
        (4, [210, 55, 280, 100, 210, 140]),
        (4, [280, 100, 285, 195, 210, 140]),
        (2, [280, 100, 340, 180, 285, 195]),
        (1, [340, 180, 365, 270, 285, 195]),
        (3, [40, 290, 60, 200, 125, 205]),
        (3, [40, 290, 125, 205, 105, 285]),
        (4, [125, 205, 210, 140, 200, 260]),
        (3, [210, 140, 285, 195, 200, 260]),
        (3, [125, 205, 200, 260, 105, 285]),
        (1, [285, 195, 300, 285, 200, 260]),
        (1, [285, 195, 365, 270, 300, 285]),
        (0, [365, 270, 330, 330, 300, 285]),
        (0, [330, 330, 180, 340, 300, 285]),
        (1, [300, 285, 180, 340, 200, 260]),
        (2, [200, 260, 180, 340, 105, 285]),
        (0, [105, 285, 180, 340, 95, 320]),
        (2, [40, 290, 105, 285, 95, 320]),
        (0, [95, 320, 180, 340, 90, 385]),
    ]

    private static func points(_ xy: [CGFloat]) -> [CGPoint] {
        [CGPoint(x: xy[0], y: xy[1]), CGPoint(x: xy[2], y: xy[3]), CGPoint(x: xy[4], y: xy[5])]
    }

    static let facets: [Facet] = MudMound.rows.map { Facet(tone: $0.0, points: MudMound.points($0.1)) }

    /// The small highlight facet, drawn last in the theme's hover tone
    static let highlight: [CGPoint] = MudMound.points([185, 92, 212, 68, 208, 108])

    /// Opacity per tone when the mark is drawn in a single colour
    static let toneOpacity: [Double] = [0.55, 0.65, 0.75, 0.85, 0.92, 1]

    /// The six logo tones (darkest to lightest) and the highlight of the base logo
    static let baseTones: [String] = ["#4A301B", "#644427", "#7A5434", "#8A6038", "#A87B50", "#CFA170"]
    static let baseHighlight = "#E2BC8E"

    /// A closed path through `points`, scaled so the 400-unit box fits `rect`
    static func path(_ points: [CGPoint], in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / 400
        var path = Path()
        path.addLines(points.map { CGPoint(x: rect.minX + $0.x * scale, y: rect.minY + $0.y * scale) })
        path.closeSubpath()
        return path
    }
}

struct WizardLogoShape: View {
    var colors: [Color] = MudMound.baseTones.map { Color(hexString: $0) }
    var highlight: Color = Color(hexString: MudMound.baseHighlight)

    var body: some View {
        Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size)
            for facet in MudMound.facets {
                let path = MudMound.path(facet.points, in: rect)
                let color = colors[facet.tone % colors.count]
                context.fill(path, with: .color(color))
                // A hairline stroke in the fill colour closes the seams between facets
                context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 1.5 * min(size.width, size.height) / 400, lineJoin: .round))
            }
            context.fill(MudMound.path(MudMound.highlight, in: rect), with: .color(highlight))
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel("Mudrix")
    }
}

extension Color {
    init(hexString: String) {
        let hex = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var value: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&value)
        self.init(red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
                  blue: Double(value & 0xFF) / 255)
    }
}
