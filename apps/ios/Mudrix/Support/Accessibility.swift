import SwiftUI
import UIKit

extension View {
    /// Makes the tappable area at least 44pt each way (`WZ.Size.touchTarget`) without changing what is drawn:
    /// put it after the background, so a 32pt circle stays 32pt and its padding takes the taps
    func minTouchTarget() -> some View {
        frame(minWidth: WZ.Size.touchTarget, minHeight: WZ.Size.touchTarget)
            .contentShape(Rectangle())
    }
}

/// What VoiceOver says when something changes on screen without being focused (the web's live regions)
enum Announcer {
    /// Whether a new line of the open room is worth saying out loud: someone else's, and not a re-draw of
    /// what is already there
    static func shouldAnnounce(isOwn: Bool, isNewestChanged: Bool, voiceOverRunning: Bool) -> Bool {
        voiceOverRunning && isNewestChanged && !isOwn
    }

    /// `Name: text`, with the text cut to a sentence-sized length so a long message does not hold the speech up
    static func messageLine(sender: String, text: String, limit: Int = 140) -> String {
        let flat = text.split(whereSeparator: \.isNewline).joined(separator: " ")
        let cut = flat.count > limit ? String(flat.prefix(limit)) + "…" : flat
        return "\(sender): \(cut)"
    }

    @MainActor
    static func say(_ text: String) {
        guard UIAccessibility.isVoiceOverRunning else { return }
        UIAccessibility.post(notification: .announcement, argument: text)
    }
}
