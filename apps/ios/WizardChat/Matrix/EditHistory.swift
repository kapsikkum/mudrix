import Foundation
import WizardChatCore

/// The rules of the edit-history list: newest version first, with a badge for the current text and the
/// original. The web app does the same in `EditHistoryModal.tsx`.
enum EditHistory {
    /// The core lists the oldest first; the newest version leads
    static func newestFirst(_ versions: [EventVersion]) -> [EventVersion] {
        Array(versions.reversed())
    }

    /// Badge locale keys for a row: "current" for the newest text, "original" for the message as first sent
    static func badges(_ version: EventVersion, index: Int) -> [String] {
        var keys: [String] = []
        if index == 0 { keys.append("timeline.editHistory.current") }
        if version.isOriginal { keys.append("timeline.editHistory.original") }
        return keys
    }

    /// True when there is nothing to compare: no versions, or only the original
    static func isEmpty(_ versions: [EventVersion]) -> Bool {
        versions.count <= 1
    }
}
