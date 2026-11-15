import MudrixCore
import SwiftUI

/// The time since the call began, `m:ss` or `h:mm:ss`, counting up by the second
struct CallTimerText: View {
    let startedAt: Int64

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            Text(CallTimer.format(Int64(context.date.timeIntervalSince1970 * 1000) - startedAt))
                .monospacedDigit()
        }
    }
}

/// Your sounds, the room's and its spaces', and the bundled ones; a tap plays the clip for everyone in the call.
/// "Edit sounds" turns a tap on a clip you may change into opening its editor.
struct SoundboardSheet: View {
    @ObservedObject var soundboard: Soundboard
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var notice: String?
    @State private var editing = false
    @State private var canEditRoom = false
    @State private var ownRoomSounds: [SoundboardSound] = []
    @State private var spaceNames: [String: String] = [:]
    @State private var editor: SoundEditorRequest?

    private struct ClipGroup: Identifiable {
        let origin: String
        let clips: [SoundboardClip]
        var id: String { origin }
    }

    private var roomClipGroups: [ClipGroup] {
        var order: [String] = []
        var byOrigin: [String: [SoundboardClip]] = [:]
        for item in soundboard.roomClips {
            if byOrigin[item.originRoomId] == nil { order.append(item.originRoomId) }
            byOrigin[item.originRoomId, default: []].append(item.clip)
        }
        return order.map { ClipGroup(origin: $0, clips: byOrigin[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WZ.Space.space6) {
                    if let notice {
                        Text(notice)
                            .font(.wizard(WZ.FontSize.sm, .semibold))
                            .foregroundStyle(theme.danger)
                    }
                    if editing {
                        Text(String(localized: "soundboard.panel.editHint"))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                    section(String(localized: "soundboard.panel.yourSounds"), clips: soundboard.personal,
                            empty: String(localized: "soundboard.panel.emptyPersonal"),
                            addLabel: String(localized: "soundboard.panel.addToYours"),
                            onAdd: { editor = SoundEditorRequest(target: .personal, sound: nil) },
                            editable: true) { clip in
                        if let sound = soundboard.personalSounds.first(where: { $0.id == clip.id }) {
                            editor = SoundEditorRequest(target: .personal, sound: sound)
                        }
                    }
                    let groups = roomClipGroups
                    let own = groups.first { $0.origin == roomId }?.clips ?? []
                    if !own.isEmpty || canEditRoom {
                        section(String(localized: "soundboard.panel.roomSounds"), clips: own,
                                empty: String(localized: "soundboard.panel.emptyRoomManage"),
                                addLabel: canEditRoom ? String(localized: "soundboard.panel.addToRoom") : nil,
                                onAdd: { editor = SoundEditorRequest(target: .room(roomId), sound: nil) },
                                editable: canEditRoom) { clip in
                            if let sound = ownRoomSounds.first(where: { $0.id == clip.id }) {
                                editor = SoundEditorRequest(target: .room(roomId), sound: sound)
                            }
                        }
                    }
                    ForEach(groups.filter { $0.origin != roomId }) { group in
                        section(L10n.format("soundboard.panel.fromSpace", spaceNames[group.origin] ?? group.origin),
                                clips: group.clips, empty: nil)
                    }
                    section(String(localized: "soundboard.panel.defaultSounds"), clips: SoundboardFormat.builtInClips, empty: nil)
                }
                .padding(WZ.Space.space6)
            }
            .background(theme.bgSecondary.ignoresSafeArea())
            .navigationTitle(String(localized: "soundboard.panel.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: editing ? "common.done" : "soundboard.panel.editSounds")) { editing.toggle() }
                        .disabled(soundboard.personal.isEmpty && !(canEditRoom && !ownRoomSounds.isEmpty))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
            .sheet(item: $editor) { request in
                SoundEditorSheet(target: request.target, existing: request.sound, soundboard: soundboard) {
                    Task {
                        await soundboard.refreshRoomBoards(force: true)
                        await loadRoom(force: true)
                    }
                }
            }
        }
        .task { await soundboard.refreshRoomBoards() }
        .task(id: roomId) { await loadRoom(force: false) }
    }

    /// The room's own board and whether this person may change it, and the names of the spaces whose clips are listed
    private func loadRoom(force: Bool) async {
        guard let client = session.client else { return }
        let own = await RoomSoundboards.load(client: client, roomId: roomId, force: force)
        ownRoomSounds = own.board
        canEditRoom = session.userId.map {
            SoundboardEdit.canManage(own, userId: $0, type: SoundboardFormat.boardType)
        } ?? false
        for origin in Set(soundboard.roomClips.map(\.originRoomId)) where origin != roomId && spaceNames[origin] == nil {
            spaceNames[origin] = (try? await client.roomDetails(roomId: origin))?.name
        }
    }

    private func section(_ title: String, clips: [SoundboardClip], empty: String?, addLabel: String? = nil,
                         onAdd: (() -> Void)? = nil, editable: Bool = false,
                         onEdit: ((SoundboardClip) -> Void)? = nil) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            HStack {
                Text(title).font(.wizard(WZ.FontSize.sm, .semibold)).foregroundStyle(theme.textMuted)
                Spacer(minLength: 0)
                if let addLabel, let onAdd {
                    Button(action: onAdd) {
                        Image("ph-plus-circle-regular")
                            .font(.system(size: WZ.SizeIcon.lg))
                            .foregroundStyle(theme.accent)
                            .minTouchTarget()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(addLabel)
                }
            }
            if clips.isEmpty, let empty {
                Text(empty).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textMuted)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: WZ.Space.space3)], spacing: WZ.Space.space3) {
                    ForEach(clips) { clip in tile(clip, editing: editing && editable, onEdit: onEdit) }
                }
            }
        }
    }

    private func tile(_ clip: SoundboardClip, editing: Bool, onEdit: ((SoundboardClip) -> Void)?) -> some View {
        Button {
            if editing, let onEdit { onEdit(clip) } else { Task { await press(clip) } }
        } label: {
            VStack(spacing: WZ.Space.space2) {
                Text(clip.emoji ?? "\u{1F50A}").font(.system(size: 28))
                Text(clip.name)
                    .font(.wizard(WZ.FontSize.sm, .medium))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, WZ.Space.space4)
            .padding(.horizontal, WZ.Space.space2)
            .background(editing ? theme.accent.opacity(0.18) : theme.fill,
                        in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.format(editing ? "soundboard.panel.editClip" : "soundboard.panel.playClip", clip.name))
    }

    private func press(_ clip: SoundboardClip) async {
        switch await soundboard.press(clip) {
        case .ok: notice = nil
        case .cooldown: break
        case .disabled: notice = String(localized: "soundboard.play.disabled")
        case .notInCall: notice = String(localized: "soundboard.play.notInCall")
        case .rateLimited: notice = String(localized: "soundboard.play.rateLimited")
        case .error: notice = String(localized: "soundboard.play.error")
        case .roomDisabled: notice = String(localized: "soundboard.play.roomDisabled")
        case .forbidden: notice = String(localized: "soundboard.play.forbidden")
        }
    }
}
