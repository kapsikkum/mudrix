import WizardChatCore
import SwiftUI

struct InboxView: View {
    @ObservedObject var roomList: RoomListModel
    let onOpenRoom: (String) -> Void
    let onOpenSpace: (String) -> Void

    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    private enum Tab { case invites, mentions, threads, saved }

    @State private var tab = Tab.invites
    @State private var busyId: String?
    @State private var errorMessage: String?
    @State private var inviters: [String: String] = [:]
    @State private var inviterIds: [String: String] = [:]
    @State private var blocking: RoomSummary?
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @ObservedObject private var saved = SavedMessages.shared

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    tabs
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                if let errorMessage {
                    Text(errorMessage)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.error)
                        .listRowBackground(Color.clear)
                }
                switch tab {
                case .invites:
                    if roomList.invites.isEmpty {
                        empty(String(localized: "inbox.emptyInvites"), icon: "ph-tray-regular")
                    } else {
                        Section {
                            ForEach(roomList.invites) { invite in inviteRow(invite) }
                        }
                    }
                case .mentions:
                    if roomList.mentionRooms.isEmpty {
                        empty(String(localized: "inbox.emptyMentions"), icon: "ph-bell-regular")
                    } else {
                        Section {
                            ForEach(roomList.mentionRooms) { room in mentionRow(room) }
                        }
                        Section {
                            Button {
                                Task { await roomList.markAsRead(roomList.mentionRooms) }
                            } label: {
                                Label(String(localized: "common.markAllRead"), image: "ph-check-circle-fill")
                                    .foregroundStyle(theme.control)
                            }
                        }
                    }
                case .threads:
                    Section {
                        InboxThreadsList(roomList: roomList) { roomId, rootId in
                            notifier.threadToOpen = (roomId, rootId)
                            onOpenRoom(roomId)
                            dismiss()
                        }
                    }
                case .saved:
                    Section {
                        InboxSavedList(roomList: roomList) { roomId, eventId in
                            notifier.eventToFocus = (roomId, eventId)
                            onOpenRoom(roomId)
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "inbox.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
            .tint(theme.control)
        }
        .presentationDetents([.medium, .large])
        .alert(L10n.format("invite.declineAndBlockTitle", blockName),
               isPresented: Binding(get: { blocking != nil }, set: { if !$0 { blocking = nil } }),
               presenting: blocking) { invite in
            Button(String(localized: "invite.declineAndBlock"), role: .destructive) {
                Task { await declineAndBlock(invite) }
            }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        } message: { _ in
            Text(blockMessage)
        }
    }

    /// Equal parts, the active one raised, each with its count
    private var tabs: some View {
        HStack(spacing: WZ.Space.space1) {
            tabButton(String(localized: "inbox.tabInvites"), count: roomList.invites.count, tab: .invites)
            tabButton(String(localized: "inbox.tabMentions"), count: roomList.mentionRooms.count, tab: .mentions)
            tabButton(String(localized: "inbox.tabThreads"), count: 0, tab: .threads)
            tabButton(String(localized: "inbox.tabSaved"), count: saved.items.count, tab: .saved)
        }
        .padding(WZ.Space.space1)
        .background(theme.fill, in: Capsule())
    }

    private func tabButton(_ title: String, count: Int, tab: Tab) -> some View {
        let isActive = self.tab == tab
        return Button {
            self.tab = tab
        } label: {
            HStack(spacing: WZ.Space.space3) {
                Text(title)
                    .font(.wizard(WZ.FontSize.md, isActive ? .semibold : .regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if count > 0 {
                    Text(count > 99 ? "99+" : "\(count)")
                        .font(.wizard(WZ.FontSize.xs, .bold))
                        .foregroundStyle(theme.textOnAccent)
                        .padding(.horizontal, WZ.Space.space3)
                        .background(isActive ? theme.accent : theme.textMuted, in: Capsule())
                }
            }
            .foregroundStyle(isActive ? theme.textPrimary : theme.textMuted)
            .frame(maxWidth: .infinity)
            .frame(height: WZ.Space.space10)
            .background(isActive ? theme.bgTertiary : .clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func empty(_ text: String, icon: String) -> some View {
        VStack(spacing: WZ.Space.space4) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.xl))
                .foregroundStyle(theme.textMuted)
            Text(text)
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, WZ.Space.space10)
        .listRowBackground(Color.clear)
    }

    /// The room's avatar with the same type badge the room list shows
    private func avatar(_ room: RoomSummary) -> some View {
        AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.md)
            .overlay(alignment: .bottomTrailing) {
                if !room.isDirect {
                    Image(room.isSpace ? "ph-stack-regular" : room.isVoice ? "ph-speaker-high-regular" : "ph-hash-straight-bold")
                        .font(.system(size: WZ.SizeIcon.xs))
                        .foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Space.space7, height: WZ.Space.space7)
                        .background(theme.bgPrimary, in: Circle())
                        .overlay(Circle().stroke(theme.border, lineWidth: WZ.BorderWidth.thin))
                        .offset(x: WZ.Space.space2, y: WZ.Space.space2)
                }
            }
    }

    private func roundButton(_ icon: String, label: String, background: Color, foreground: Color,
                             action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                .foregroundStyle(foreground)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .background(background, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func inviteRow(_ invite: RoomSummary) -> some View {
        HStack(spacing: WZ.Space.space5) {
            avatar(invite)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(invite.displayName)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                if let inviter = inviters[invite.id] {
                    Text(L10n.format("inbox.invitedBy", inviter))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .lineLimit(1)
            Spacer(minLength: WZ.Space.space4)
            if inviterIds[invite.id] != nil {
                roundButton("ph-prohibit-regular", label: String(localized: "invite.declineAndBlock"),
                            background: theme.fill, foreground: theme.danger) { blocking = invite }
            }
            roundButton("ph-x-bold", label: String(localized: "common.decline"), background: theme.fill,
                        foreground: theme.textPrimary) { Task { await decline(invite) } }
            roundButton("ph-check-bold", label: String(localized: "common.accept"), background: theme.accent,
                        foreground: theme.textOnAccent) { Task { await accept(invite) } }
        }
        .task(id: invite.id) {
            if let info = try? await session.client?.inviteInfo(roomId: invite.id) {
                inviters[invite.id] = info.inviterName ?? info.inviterId
                inviterIds[invite.id] = info.inviterId
            }
        }
        .disabled(busyId == invite.id)
        .opacity(busyId == invite.id ? 0.5 : 1)
    }

    private func mentionRow(_ room: RoomSummary) -> some View {
        HStack(spacing: WZ.Space.space5) {
            avatar(room)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                Text(room.mentionCount == 1 ? String(localized: "inbox.youWereMentioned") : L10n.format("inbox.youWereMentionedTimes", room.mentionCount))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer(minLength: WZ.Space.space4)
            UnreadBadge(count: room.mentionCount, isMention: true)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            onOpenRoom(room.id)
            dismiss()
        }
        .swipeActions(edge: .trailing) {
            Button { Task { await roomList.markAsRead([room]) } } label: {
                Label(String(localized: "common.markRead"), image: "ph-envelope-open-regular")
            }
            .tint(theme.textMuted)
        }
    }

    private func accept(_ invite: RoomSummary) async {
        busyId = invite.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            try await roomList.accept(invite)
            if roomList.spaces.contains(where: { $0.id == invite.id }) { onOpenSpace(invite.id) } else { onOpenRoom(invite.id) }
            dismiss()
        } catch {
            errorMessage = L10n.format("inbox.failedToAcceptInvite", "\(error)")
        }
    }

    private func decline(_ invite: RoomSummary) async {
        busyId = invite.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            try await roomList.decline(invite)
        } catch {
            errorMessage = L10n.format("inbox.failedToDeclineInvite", "\(error)")
        }
    }

    private var blockName: String {
        guard let invite = blocking else { return "" }
        return inviters[invite.id] ?? inviterIds[invite.id] ?? invite.id
    }

    private var blockMessage: String {
        guard let invite = blocking else { return "" }
        return L10n.format("invite.declineAndBlockBody", blockName, inviterIds[invite.id] ?? "")
    }

    private func declineAndBlock(_ invite: RoomSummary) async {
        guard let inviter = inviterIds[invite.id] else { return }
        busyId = invite.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            try await roomList.decline(invite)
            try await session.ignore(inviter)
        } catch {
            errorMessage = L10n.format("invite.declineAndBlockFailed", "\(error)")
        }
    }
}
