import SwiftUI
import WizardChatCore

struct ThreadListView: View {
    let room: RoomSummary
    let client: WizardClient
    let onOpen: (String) -> Void

    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var mine = false
    @State private var threads: [ThreadInfo] = []
    @State private var next: String?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Picker("", selection: $mine) {
                    Text(String(localized: "timeline.threadsAll")).tag(false)
                    Text(String(localized: "timeline.threadsMy")).tag(true)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

                if let error {
                    StatusText(text: error).listRowBackground(Color.clear)
                } else if threads.isEmpty && !loading {
                    Text(String(localized: mine ? "timeline.threadListEmptyMy" : "timeline.threadListEmpty"))
                        .font(.wizard(WZ.FontSize.md))
                        .foregroundStyle(theme.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, WZ.Space.space8)
                        .listRowBackground(Color.clear)
                }
                ForEach(threads, id: \.rootEventId) { thread in
                    Button { onOpen(thread.rootEventId) } label: {
                        ThreadRow(thread: thread, roomId: room.id)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(theme.groupedRow)
                    .onAppear {
                        if thread.rootEventId == threads.last?.rootEventId, next != nil { Task { await load(more: true) } }
                    }
                }
                if loading {
                    ProgressView().tint(theme.accent)
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
            .navigationTitle(String(localized: "timeline.threads"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
            .tint(theme.control)
        }
        .task(id: mine) { await load(more: false) }
    }

    private func load(more: Bool) async {
        if !more {
            threads = []
            next = nil
        }
        loading = true
        error = nil
        defer { loading = false }
        do {
            let page = try await client.threads(roomId: room.id, mine: mine, from: more ? next : nil)
            threads += page.threads.filter { new in !threads.contains { $0.rootEventId == new.rootEventId } }
            next = page.next
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct ThreadRow: View {
    let thread: ThreadInfo
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?
    @State private var latestName: String?

    var body: some View {
        HStack(alignment: .top, spacing: WZ.Space.space5) {
            AvatarView(name: name ?? thread.sender, url: avatarUrl, size: WZ.SizeAvatar.sm)
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                HStack(spacing: WZ.Space.space3) {
                    Text(name ?? thread.sender)
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: WZ.Space.space0)
                    Text(Self.date(thread.latestTimestamp ?? thread.timestamp), format: .relative(presentation: .named))
                        .font(.wizard(WZ.FontSize.xs))
                        .foregroundStyle(theme.textMuted)
                }
                Text(thread.body)
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(2)
                HStack(spacing: WZ.Space.space2) {
                    Text(L10n.format("timeline.threadReplies", thread.replies))
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(theme.accent)
                    if let latest = thread.latestBody?.split(separator: "\n").first {
                        Text(latestName.map { "\($0): \(latest)" } ?? String(latest))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(.vertical, WZ.Space.space2)
        .contentShape(Rectangle())
        .task(id: thread.rootEventId) {
            let profile = await session.memberProfile(thread.sender, in: roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
            if let latest = thread.latestSender {
                latestName = await session.memberProfile(latest, in: roomId).name
            }
        }
    }

    private static func date(_ milliseconds: Int) -> Date {
        Date(timeIntervalSince1970: Double(milliseconds) / 1000)
    }
}
