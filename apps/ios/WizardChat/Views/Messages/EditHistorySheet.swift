import SwiftUI
import WizardChatCore

/// "Edit history": every version of a message, newest first, with the current text and the original marked
struct EditHistorySheet: View {
    let client: WizardClient
    let roomId: String
    let eventId: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var versions: [EventVersion]?
    @State private var failure: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WZ.Space.space5) {
                    if let failure {
                        Text(L10n.format("timeline.editHistory.failed", failure))
                            .foregroundStyle(theme.textMuted)
                    } else if let versions {
                        if EditHistory.isEmpty(versions) {
                            Text(String(localized: "timeline.editHistory.empty")).foregroundStyle(theme.textMuted)
                        } else {
                            ForEach(Array(versions.enumerated()), id: \.element.eventId) { index, version in
                                row(version, index: index)
                            }
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                }
                .font(.wizard(WZ.FontSize.md))
                .padding(WZ.Space.space6)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "timeline.editHistory.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
            }
            .tint(theme.control)
        }
        .task(id: eventId) {
            do {
                versions = EditHistory.newestFirst(try await client.eventEditHistory(roomId: roomId, eventId: eventId))
            } catch {
                failure = error.localizedDescription
            }
        }
    }

    private func row(_ version: EventVersion, index: Int) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            HStack(spacing: WZ.Space.space3) {
                ForEach(EditHistory.badges(version, index: index), id: \.self) { key in
                    Text(L10n.format(key))
                        .font(.wizard(WZ.FontSize.xs, .semibold))
                        .foregroundStyle(theme.textMuted)
                        .padding(.horizontal, WZ.Space.space3)
                        .background(theme.fill, in: Capsule())
                }
                Text(Date(timeIntervalSince1970: Double(version.timestamp) / 1000).formatted(date: .abbreviated, time: .shortened))
                    .font(.wizard(WZ.FontSize.xs))
                    .foregroundStyle(theme.textMuted)
            }
            Text(version.body)
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(theme.textPrimary)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
