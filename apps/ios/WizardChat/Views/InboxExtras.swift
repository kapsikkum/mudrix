import SwiftUI
import WizardChatCore

/// Rooms looked at for threads: the busiest ones, so the tab does not ask every room
private let threadRooms = 25
private let threadRows = 50

private struct InboxThread: Identifiable {
    let room: RoomSummary
    let thread: ThreadInfo

    var id: String { "\(room.id)|\(thread.rootEventId)" }
    var time: Int { thread.latestTimestamp ?? thread.timestamp }
}

private func relativeTime(_ milliseconds: Int) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .abbreviated
    return formatter.localizedString(for: Date(timeIntervalSince1970: Double(milliseconds) / 1000), relativeTo: Date())
}

private struct InboxEmptyText: View {
    let text: String
    @Environment(\.theme) private var theme

    var body: some View {
        Text(text)
            .font(.wizard(WZ.FontSize.md))
            .foregroundStyle(theme.textMuted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, WZ.Space.space10)
            .padding(.horizontal, WZ.Space.space6)
    }
}

/// Threads you took part in across the busiest rooms, from the core's `threads(roomId, mine)`
struct InboxThreadsList: View {
    @ObservedObject var roomList: RoomListModel
    /// Called with the room and the thread's root event
    let onOpen: (String, String) -> Void

    @EnvironmentObject private var session: MatrixSession
    @ObservedObject private var lastSeen = ThreadLastSeen.shared
    @Environment(\.theme) private var theme
    @State private var threads: [InboxThread]?

    /// Asked again when a room has new activity, not on every redraw
    private var activity: Int { roomList.joinedRooms.reduce(0) { $0 + ($1.lastActivity ?? 0) } }

    var body: some View {
        Group {
            if let threads {
                if threads.isEmpty {
                    InboxEmptyText(text: String(localized: "inbox.emptyThreads"))
                } else {
                    ForEach(threads) { row($0) }
                }
            } else {
                ProgressView().tint(theme.accent).frame(maxWidth: .infinity).padding(WZ.Space.space6)
            }
        }
        .task(id: activity) { await load() }
    }

    private func row(_ item: InboxThread) -> some View {
        let unread = lastSeen.isUnread(item.thread, myUserId: session.userId)
        return HStack(spacing: WZ.Space.space4) {
            AvatarView(name: item.room.displayName, url: item.room.avatarUrl, size: WZ.SizeAvatar.sm)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(item.thread.body.split(separator: "\n").first.map(String.init) ?? "")
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                Text("\(item.room.displayName) \u{00B7} \(L10n.format("timeline.threadReplies", item.thread.replies))")
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer(minLength: 4)
            if unread {
                Circle().fill(theme.accent).frame(width: WZ.Space.space4, height: WZ.Space.space4)
            }
            Text(relativeTime(item.time))
                .font(.wizard(WZ.FontSize.xs))
                .foregroundStyle(theme.textMuted)
        }
        .padding(WZ.Space.space4)
        .contentShape(Rectangle())
        .onTapGesture { onOpen(item.room.id, item.thread.rootEventId) }
    }

    private func load() async {
        guard let client = session.client else { return }
        let rooms = Array(roomList.joinedRooms
            .filter { !$0.isSpace }
            .sorted { ($0.lastActivity ?? 0) > ($1.lastActivity ?? 0) }
            .prefix(threadRooms))
        var found: [InboxThread] = []
        // Four rooms at a time
        for start in stride(from: 0, to: rooms.count, by: 4) {
            let batch = Array(rooms[start..<min(start + 4, rooms.count)])
            await withTaskGroup(of: [InboxThread].self) { group in
                for room in batch {
                    group.addTask {
                        let page = try? await client.threads(roomId: room.id, mine: true)
                        return (page?.threads ?? []).map { InboxThread(room: room, thread: $0) }
                    }
                }
                for await part in group { found += part }
            }
        }
        threads = Array(found.sorted { $0.time > $1.time }.prefix(threadRows))
    }
}

/// Messages saved from the message menu, with their first line fetched and decrypted
struct InboxSavedList: View {
    @ObservedObject var roomList: RoomListModel
    let onOpen: (String, String) -> Void

    @EnvironmentObject private var session: MatrixSession
    @ObservedObject private var saved = SavedMessages.shared
    @Environment(\.theme) private var theme
    /// Looked up so far; a message that could not be fetched is `.some(nil)`
    @State private var previews: [String: EventPreview?] = [:]

    var body: some View {
        Group {
            if saved.items.isEmpty {
                InboxEmptyText(text: String(localized: "inbox.emptySaved"))
            } else {
                ForEach(saved.items) { row($0) }
            }
        }
    }

    private func title(_ message: SavedMessage) -> String {
        guard let entry = previews[message.eventId] else { return "\u{2026}" }
        guard let preview = entry else { return String(localized: "inbox.savedUnavailable") }
        if preview.redacted { return String(localized: "timeline.messageDeleted") }
        return preview.body.split(separator: "\n").first.map(String.init) ?? ""
    }

    private func row(_ message: SavedMessage) -> some View {
        let room = roomList.room(id: message.roomId)
        let sender = previews[message.eventId].flatMap { $0 }?.sender ?? ""
        let subtitle = [room?.displayName ?? "", sender].filter { !$0.isEmpty }.joined(separator: " \u{00B7} ")
        return HStack(spacing: WZ.Space.space4) {
            AvatarView(name: room?.displayName ?? "?", url: room?.avatarUrl, size: WZ.SizeAvatar.sm)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(title(message))
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                Text(subtitle)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer(minLength: 4)
            Button {
                guard let client = session.client else { return }
                Task { _ = try? await saved.toggle(client: client, roomId: message.roomId, eventId: message.eventId) }
            } label: {
                Image("ph-bookmark-simple-fill")
                    .font(.system(size: WZ.SizeIcon.sm))
                    .foregroundStyle(theme.accent)
                    .frame(width: WZ.Space.space8, height: WZ.Space.space8)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "timeline.unsaveMessage"))
        }
        .padding(WZ.Space.space4)
        .contentShape(Rectangle())
        .onTapGesture { onOpen(message.roomId, message.eventId) }
        .task(id: message.eventId) {
            guard previews[message.eventId] == nil, let client = session.client else { return }
            previews[message.eventId] = .some(await SavedMessages.resolve(client: client, roomId: message.roomId,
                                                                          eventId: message.eventId))
        }
    }
}
