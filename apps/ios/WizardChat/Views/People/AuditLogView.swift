import SwiftUI
import WizardChatCore

/// The audit log of a room or space: who joined, left, was invited, removed or banned, newest first. The core's timeline
/// carries membership changes only; other changes (name, topic, permissions) are not in it yet.
struct AuditLogView: View {
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @State private var model: TimelineModel?

    var body: some View {
        Group {
            if let model {
                AuditLogList(model: model)
            } else {
                ProgressView()
            }
        }
        .navigationTitle(String(localized: "room.settings.auditLog.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: roomId) {
            guard model == nil, let client = session.client else { return }
            let made = TimelineModel(client: client, roomId: roomId)
            model = made
            await made.start()
            // Page back until there is enough to show or the room starts
            var pages = 0
            while !made.reachedStart, AuditLogList.changes(of: made).count < 30, pages < 8 {
                await made.paginateBackwards()
                try? await Task.sleep(for: .milliseconds(150))
                pages += 1
            }
        }
    }
}

private struct AuditLogList: View {
    @ObservedObject var model: TimelineModel

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @State private var loadingMore = false

    /// The membership changes of a timeline, newest first, with their text
    static func changes(of model: TimelineModel) -> [(entry: ChatEntry, text: String)] {
        model.entries.reversed().compactMap { entry in
            if case .system(let text) = entry.kind { return (entry: entry, text: text) }
            return nil
        }
    }

    var body: some View {
        let changes = Self.changes(of: model)
        List {
            Section {
                if changes.isEmpty {
                    HStack {
                        Spacer()
                        if model.reachedStart {
                            Text(String(localized: "room.settings.auditLog.empty")).foregroundStyle(theme.textMuted)
                        } else {
                            ProgressView().tint(theme.accent)
                        }
                        Spacer()
                    }
                }
                ForEach(changes, id: \.entry.id) { change in
                    HStack(alignment: .firstTextBaseline, spacing: WZ.Space.space4) {
                        Text(change.text).foregroundStyle(theme.textPrimary)
                        Spacer(minLength: WZ.Space.space3)
                        Text(verbatim: Formats.abbreviatedDateTime(change.entry.timestamp, prefs.dateFormat, prefs.timeFormat))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                if !model.reachedStart {
                    Button {
                        guard !loadingMore else { return }
                        loadingMore = true
                        Task {
                            for _ in 0..<3 { await model.paginateBackwards() }
                            loadingMore = false
                        }
                    } label: {
                        Label(String(localized: "room.settings.auditLog.loadOlder"), systemImage: "arrow.up")
                    }
                    .disabled(loadingMore || model.isPaginating)
                } else if !changes.isEmpty {
                    Text(String(localized: "room.settings.auditLog.start"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                        .frame(maxWidth: .infinity)
                }
            } header: {
                Text(String(localized: "room.settings.auditLog.note")).textCase(nil)
            }
        }
        .tint(theme.control)
    }
}
