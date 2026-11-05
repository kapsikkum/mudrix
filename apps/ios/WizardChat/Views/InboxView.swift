import WizardChatCore
import SwiftUI

struct InboxView: View {
    @ObservedObject var roomList: RoomListModel
    let onOpenRoom: (String) -> Void
    let onOpenSpace: (String) -> Void

    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    private enum Tab { case invites, mentions }

    @State private var tab = Tab.invites
    @State private var busyId: String?
    @State private var errorMessage: String?
    @State private var inviters: [String: String] = [:]
    @EnvironmentObject private var session: MatrixSession

    var body: some View {
        NavigationStack {
            VStack(spacing: WZ.Space.space0) {
                HStack(spacing: WZ.Space.space2) {
                    tabButton(String(localized: "inbox.tabInvites"), count: roomList.invites.count, tab: .invites)
                    tabButton(String(localized: "inbox.tabMentions"), count: roomList.mentionRooms.count, tab: .mentions)
                    Spacer()
                }
                .padding(.horizontal, WZ.Space.space5)
                .padding(.vertical, WZ.Space.space4)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(theme.border).frame(height: WZ.Space.space0)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.error)
                        .padding(WZ.Space.space5)
                }

                ScrollView {
                    LazyVStack(spacing: WZ.Space.space1) {
                        switch tab {
                        case .invites:
                            if roomList.invites.isEmpty { empty(String(localized: "inbox.emptyInvites")) }
                            ForEach(roomList.invites) { invite in inviteRow(invite) }
                        case .mentions:
                            if roomList.mentionRooms.isEmpty { empty(String(localized: "inbox.emptyMentions")) }
                            ForEach(roomList.mentionRooms) { room in mentionRow(room) }
                        }
                    }
                    .padding(WZ.Space.space3)
                }
            }
            .background(theme.bgSecondary)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(theme.bgPrimary, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Label(String(localized: "inbox.title"), image: "ph-tray-regular")
                        .labelStyle(.titleAndIcon)
                        .font(.wizard(WZ.FontSize.lg, .bold))
                        .foregroundStyle(theme.textPrimary)
                }
                if tab == .mentions && !roomList.mentionRooms.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            Task { await roomList.markAsRead(roomList.mentionRooms) }
                        } label: {
                            Image("ph-check-circle-fill")
                        }
                        .accessibilityLabel(String(localized: "common.markAllRead"))
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
            .tint(theme.control)
        }
        .presentationDetents([.medium, .large])
    }

    private func tabButton(_ title: String, count: Int, tab: Tab) -> some View {
        let isActive = self.tab == tab
        return Button {
            self.tab = tab
        } label: {
            HStack(spacing: WZ.Space.space3) {
                Text(title)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                if count > 0 {
                    Text(count > 99 ? "99+" : "\(count)")
                        .font(.wizard(WZ.FontSize.xs, .bold))
                        .foregroundStyle(isActive ? theme.textOnAccent : theme.textMuted)
                        .padding(.horizontal, WZ.Space.space3)
                        .padding(.vertical, WZ.Space.space0)
                        .background(isActive ? theme.accent : theme.bgTertiary, in: Capsule())
                }
            }
            .foregroundStyle(isActive ? theme.textPrimary : theme.textMuted)
            .padding(.horizontal, WZ.Space.space4)
            .frame(height: WZ.Space.space9)
            .background(isActive ? theme.bgActive : .clear,
                        in: RoundedRectangle(cornerRadius: WizardTheme.radiusSm))
        }
        .buttonStyle(.plain)
    }

    private func empty(_ text: String) -> some View {
        Text(text)
            .font(.wizard(WZ.FontSize.md))
            .foregroundStyle(theme.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, WZ.Space.space10)
    }

    private func inviteRow(_ invite: RoomSummary) -> some View {
        let inviterName = inviters[invite.id] ?? "someone"
        return HStack(spacing: WZ.Space.space4) {
            AvatarView(name: invite.displayName, url: invite.avatarUrl, size: WZ.SizeAvatar.sm)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                HStack(spacing: WZ.Space.space2) {
                    if invite.isDirect {
                        Text("@").foregroundStyle(theme.textMuted)
                    } else {
                        Image("ph-hash-straight-regular")
                            .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                            .foregroundStyle(theme.textMuted)
                    }
                    Text(invite.displayName)
                        .foregroundStyle(theme.textPrimary)
                }
                .font(.wizard(WZ.FontSize.md, .semibold))
                Text(L10n.format("inbox.invitedByName", "\(inviterName)"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer(minLength: 4)
            Button(String(localized: "common.accept")) { Task { await accept(invite) } }
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textOnAccent)
                .padding(.horizontal, WZ.Space.space4)
                .frame(height: WZ.Space.space8)
                .background(theme.accent, in: RoundedRectangle(cornerRadius: WizardTheme.radiusSm))
            Button(String(localized: "common.decline")) { Task { await decline(invite) } }
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textPrimary)
                .padding(.horizontal, WZ.Space.space4)
                .frame(height: WZ.Space.space8)
                .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WizardTheme.radiusSm))
        }
        .buttonStyle(.plain)
        .task(id: invite.id) {
            if let info = try? await session.client?.inviteInfo(roomId: invite.id) {
                inviters[invite.id] = info.inviterName ?? info.inviterId
            }
        }
        .disabled(busyId == invite.id)
        .opacity(busyId == invite.id ? 0.5 : 1)
        .padding(WZ.Space.space4)
    }

    private func mentionRow(_ room: RoomSummary) -> some View {
        HStack(spacing: WZ.Space.space4) {
            AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.sm)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                Text(room.mentionCount == 1 ? String(localized: "inbox.youWereMentioned") : L10n.format("inbox.youWereMentionedTimes", room.mentionCount))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer(minLength: 4)
            UnreadBadge(count: room.mentionCount, isMention: true)
            Button {
                Task { await roomList.markAsRead([room]) }
            } label: {
                Image("ph-check-bold")
                    .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .frame(width: WZ.Space.space8, height: WZ.Space.space8)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "common.markRead"))
        }
        .padding(WZ.Space.space4)
        .contentShape(Rectangle())
        .onTapGesture {
            onOpenRoom(room.id)
            dismiss()
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
}
