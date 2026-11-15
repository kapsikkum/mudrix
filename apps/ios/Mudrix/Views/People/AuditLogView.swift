import MudrixCore
import SwiftUI

/// The audit log of a room or space: who joined, left, was invited, removed or banned, and who changed the name,
/// the topic, the join rules, the permissions, the rooms of a space or the roles; newest first. The lines come from
/// the timeline's membership and state changes plus the room's role state, as the web and Android build them.
struct AuditLogView: View {
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @State private var model: TimelineModel?
    @State private var roleEvents: [StateEventView] = []

    var body: some View {
        Group {
            if let model {
                AuditLogList(model: model, roleEvents: roleEvents)
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
            await loadRoles(client)
            // Page back until there is enough to show or the room starts
            var pages = 0
            while !made.reachedStart, made.auditChanges.count < 30, pages < 8 {
                await made.paginateBackwards()
                try? await Task.sleep(for: .milliseconds(150))
                pages += 1
            }
        }
    }

    /// The space's roles and each person's roles, which only the state events carry
    private func loadRoles(_ client: MudrixClient) async {
        let types = MudrixTypes.typeAndLegacy(MudrixTypes.spaceRoles)
            + MudrixTypes.typeAndLegacy(MudrixTypes.spaceMemberRoles)
        roleEvents = (try? await client.stateEventsWithSender(roomId: roomId, eventTypes: types)) ?? []
    }
}

private struct AuditLogList: View {
    @ObservedObject var model: TimelineModel
    let roleEvents: [StateEventView]

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @State private var loadingMore = false
    @State private var filter: AuditEntry.Category?

    private var entries: [AuditEntry] {
        AuditLog.entries(changes: model.auditChanges, roleEvents: roleEvents)
    }

    private var shown: [AuditEntry] {
        guard let filter else { return entries }
        return entries.filter { $0.category == filter }
    }

    var body: some View {
        let rows = shown
        List {
            Section {
                filterRow
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                if rows.isEmpty {
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
                ForEach(rows) { entry in
                    VStack(alignment: .leading, spacing: WZ.Space.space1) {
                        Text(AuditLog.line(entry))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(verbatim: Formats.abbreviatedDateTime(date(entry.at), prefs.dateFormat, prefs.timeFormat))
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
                } else if !rows.isEmpty {
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

    /// All / Members / Permissions / Settings / Rooms / Roles, as the web's filter
    private var filterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: WZ.Space.space2) {
                chip(String(localized: "room.settings.auditLog.category.all"), active: filter == nil) { filter = nil }
                ForEach(AuditEntry.Category.allCases) { category in
                    chip(String(localized: String.LocalizationValue(category.titleKey)), active: filter == category) {
                        filter = filter == category ? nil : category
                    }
                }
            }
            .padding(.horizontal, WZ.Space.space6)
            .padding(.vertical, WZ.Space.space3)
        }
    }

    private func chip(_ text: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.wizard(WZ.FontSize.sm, active ? .semibold : .regular))
                .foregroundStyle(active ? theme.textOnAccent : theme.textMuted)
                .padding(.horizontal, WZ.Space.space4)
                .frame(height: WZ.Space.space8)
                .background(active ? theme.accent : theme.fill, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
    }

    private func date(_ milliseconds: Int) -> Date {
        Date(timeIntervalSince1970: Double(milliseconds) / 1000)
    }
}
