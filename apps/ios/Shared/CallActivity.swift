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

struct WizardLogoShape: View {
    var colors: [Color] = ["#6A329F", "#784CC8", "#6A329F", "#784CC8", "#5E3079", "#885EE7"].map { Color(hexString: $0) }

    private static let polygons: [[CGPoint]] = [
        [(0, 280), (100, 320), (200, 270), (100, 230)],
        [(100, 320), (300, 320), (200, 270)],
        [(400, 280), (300, 320), (200, 270), (300, 230)],
        [(100, 230), (200, 270), (230, 80), (200, 70)],
        [(200, 270), (300, 230), (260, 75), (230, 80)],
        [(200, 70), (230, 80), (260, 75), (300, 0)],
    ].map { $0.map { CGPoint(x: $0.0, y: $0.1 + 40) } }

    var body: some View {
        Canvas { context, size in
            let scale = min(size.width, size.height) / 400
            for (index, points) in Self.polygons.enumerated() {
                var path = Path()
                path.addLines(points.map { CGPoint(x: $0.x * scale, y: $0.y * scale) })
                path.closeSubpath()
                context.fill(path, with: .color(colors[index % colors.count]))
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel("WizardChat")
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
