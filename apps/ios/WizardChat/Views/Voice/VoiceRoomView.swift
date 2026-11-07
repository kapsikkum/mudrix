import WizardChatCore
import SwiftUI

struct VoiceRoomView: View {
    let room: RoomSummary
    let onOpenChat: () -> Void

    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    private var inThisCall: Bool { calls.isInCall(roomId: room.id) }

    var body: some View {
        VStack(spacing: WZ.Space.space0) {
            if inThisCall {
                CallStageView(room: room)
                CallControls(onOpenChat: onOpenChat)
                    .padding(.horizontal, WZ.Space.space6)
                    .padding(.bottom, WZ.Space.space4)
            } else {
                lobby
            }
        }
        .background(theme.bgSecondary.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: WZ.Space.space2) {
                    Image("ph-speaker-high-fill")
                        .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                        .foregroundStyle(theme.success)
                    Text(room.displayName).font(.wizard(WZ.FontSize.lg, .semibold)).foregroundStyle(theme.textPrimary)
                    if inThisCall, calls.state == .joined, let started = calls.callStartedAt {
                        CallTimerText(startedAt: started)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: onOpenChat) { Image("ph-chat-text-regular") }
                    .accessibilityLabel(String(localized: "room.openChat"))
            }
        }
    }

    private var lobby: some View {
        ScrollView {
            VStack(spacing: WZ.Space.space6) {
                AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.xl)
                    .overlay(alignment: .bottomTrailing) {
                        Image("ph-speaker-high-fill")
                            .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                            .foregroundStyle(theme.textOnAccent)
                            .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                            .background(theme.success, in: Circle())
                            .overlay(Circle().stroke(theme.bgSecondary, lineWidth: WZ.BorderWidth.thick))
                    }
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.xxl, .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(room.callParticipants.isEmpty
                     ? String(localized: "voice.noOneIsHere")
                     : L10n.format("voice.inVoice", room.callParticipants.count))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)

                if !room.callParticipants.isEmpty {
                    VStack(spacing: WZ.Space.space0) {
                        ForEach(room.callParticipants, id: \.self) { userId in
                            ParticipantRow(roomId: room.id, userId: userId)
                                .voiceMoveMenu(roomId: room.id, userId: userId)
                        }
                    }
                    .padding(.vertical, WZ.Space.space2)
                    .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                }

                if case .failed(let message) = calls.state, calls.room?.id == room.id || calls.room == nil {
                    Text(message).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error).multilineTextAlignment(.center)
                }

                Button {
                    Task { await calls.join(room, session: session) }
                } label: {
                    Label(String(localized: "call.joinVoice"), image: "ph-phone-fill")
                }
                .buttonStyle(PrimaryButtonStyle())
                Button(action: onOpenChat) {
                    Label(String(localized: "room.openChat"), image: "ph-chat-text-regular")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .padding(WZ.Space.space8)
            .frame(maxWidth: WZ.SizeDialog.md)
            .frame(maxWidth: .infinity)
        }
    }
}

struct CallControls: View {
    var onOpenChat: (() -> Void)?
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space3) {
            control(calls.micMuted ? "ph-microphone-slash-regular" : "ph-microphone-regular", active: calls.micMuted,
                    label: calls.micMuted ? "voice.unmute" : "voice.mute") { calls.toggleMic() }
            control(calls.deafened ? "ph-speaker-slash-regular" : "ph-speaker-high-fill", active: calls.deafened,
                    label: calls.deafened ? "voice.undeafen" : "voice.deafen") { calls.toggleDeafen() }
            control(calls.cameraOn ? "ph-video-camera-fill" : "ph-video-camera-slash-regular", active: false, highlighted: calls.cameraOn,
                    label: calls.cameraOn ? "voice.turnCameraOff" : "voice.turnCameraOn") { calls.toggleCamera() }
            Menu {
                ControlGroup {
                    ForEach(CallReaction.all.prefix(6)) { reaction in
                        Button(reaction.emoji) { calls.sendReaction(reaction) }
                    }
                }
                .controlGroupStyle(.palette)
                Button { calls.toggleHand() } label: {
                    calls.handRaised ? Label(menu: String(localized: "call.lowerHand"), icon: "ph-hand-regular")
                        : Label(menu: String(localized: "call.raiseHand"), icon: "ph-hand-regular")
                }
                Button { calls.toggleScreenShare() } label: {
                    calls.screenSharing ? Label(menu: String(localized: "voice.stopSharingScreen"), icon: "ph-monitor-regular")
                        : Label(menu: String(localized: "voice.shareScreen"), icon: "ph-monitor-arrow-up-regular")
                }
                if let watch = calls.watch {
                    if watch.state != nil {
                        Button(role: .destructive) { watch.stop() } label: {
                            Label(menu: String(localized: "voice.stopWatchingTogether"), icon: "ph-stop-fill", destructive: true)
                        }
                        .tint(theme.danger)
                    } else {
                        Button { showWatchSheet = true } label: {
                            Label(menu: String(localized: "voice.watchTogetherBeta"), icon: "ph-youtube-logo-fill")
                        }
                    }
                }
                if prefs.soundboardEnabled {
                    Button { showSoundboard = true } label: {
                        Label(menu: String(localized: "soundboard.panel.open"), icon: "ph-waveform-regular")
                    }
                }
                if let onOpenChat {
                    Divider()
                    Button(action: onOpenChat) { Label(menu: String(localized: "room.openChat"), icon: "ph-chat-text-regular") }
                }
            } label: {
                Image(calls.handRaised ? "ph-hand-regular" : "ph-dots-three-bold")
                    .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                    .foregroundStyle(moreHighlighted ? theme.textOnAccent : theme.textPrimary)
                    .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                    .background(moreHighlighted ? theme.accent : theme.fill, in: Circle())
            }
            .menuOrder(.fixed)
            // Menu icons in the text colour instead of the accent, like the message menu.
            .tint(theme.textPrimary)
            .accessibilityLabel(String(localized: "voice.moreReactionsRaiseHand"))
            Button {
                calls.leave()
            } label: {
                Image("ph-phone-x-regular")
                    .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                    .foregroundStyle(theme.textOnAccent)
                    .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                    .background(theme.danger, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "common.leave"))
        }
        .padding(WZ.Space.space4)
        .floatingGlass(in: Capsule())
        .sensoryFeedback(.impact(weight: .light), trigger: calls.micMuted)
        .sensoryFeedback(.impact(weight: .light), trigger: calls.deafened)
        .sensoryFeedback(.impact(weight: .light), trigger: calls.handRaised)
        .sheet(isPresented: $showWatchSheet) {
            if let watch = calls.watch { WatchTogetherStartSheet(watch: watch) }
        }
        .sheet(isPresented: $showSoundboard) {
            SoundboardSheet(soundboard: calls.soundboard)
                .presentationDetents([.medium, .large])
        }
    }

    @State private var showWatchSheet = false
    @State private var showSoundboard = false

    private var moreHighlighted: Bool { calls.handRaised || calls.screenSharing }

    private func control(_ icon: String, active: Bool, highlighted: Bool = false, label: LocalizedStringKey,
                         action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                .foregroundStyle(active || highlighted ? theme.textOnAccent : theme.textPrimary)
                .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                .background(active ? theme.danger : highlighted ? theme.accent : theme.fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct CallBar: View {
    let onOpen: () -> Void
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme

    var body: some View {
        if let room = calls.room, calls.isInCall {
            HStack(spacing: WZ.Space.space4) {
                Button(action: onOpen) {
                    HStack(spacing: WZ.Space.space4) {
                        Image("ph-speaker-high-fill")
                            .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                            .foregroundStyle(theme.textOnAccent)
                            .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                            .background(theme.success, in: Circle())
                        VStack(alignment: .leading, spacing: WZ.Space.space0) {
                            Text(room.displayName).font(.wizard(WZ.FontSize.md, .semibold)).foregroundStyle(theme.textPrimary)
                            HStack(spacing: WZ.Space.space2) {
                                Text(calls.state == .joined ? String(localized: "voice.statusConnected") : String(localized: "voice.statusConnecting"))
                                if calls.state == .joined, let started = calls.callStartedAt {
                                    Text("\u{00B7}")
                                    CallTimerText(startedAt: started)
                                }
                            }
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(calls.state == .joined ? theme.success : theme.textMuted)
                        }
                        .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "voice.returnToCall"))
                barButton(calls.micMuted ? "ph-microphone-slash-regular" : "ph-microphone-regular", active: calls.micMuted,
                          label: calls.micMuted ? "voice.unmute" : "voice.mute") { calls.toggleMic() }
                barButton(calls.deafened ? "ph-speaker-slash-regular" : "ph-speaker-high-fill", active: calls.deafened,
                          label: calls.deafened ? "voice.undeafen" : "voice.deafen") { calls.toggleDeafen() }
                Button { calls.leave() } label: {
                    Image("ph-phone-x-regular")
                        .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                        .foregroundStyle(theme.textOnAccent)
                        .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                        .background(theme.danger, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "common.leave"))
            }
            .padding(.leading, WZ.Space.space4)
            .padding(.trailing, WZ.Space.space3)
            .frame(height: WZ.Space.space11)
            .floatingGlass(in: Capsule())
        }
    }

    private func barButton(_ icon: String, active: Bool, label: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                .foregroundStyle(active ? theme.textOnAccent : theme.textPrimary)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .background(active ? theme.danger : theme.fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct ParticipantRow: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userId: String
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            AvatarView(name: name ?? userId, url: avatarUrl, size: WZ.SizeAvatar.md)
            Text(name ?? userId)
                .font(.wizard(WZ.FontSize.lg, .medium))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
            Spacer()
            Image("ph-waveform-regular").foregroundStyle(theme.success)
        }
        .padding(.horizontal, WZ.Space.space5)
        .padding(.vertical, WZ.Space.space4)
        .task(id: userId) {
            let profile = await session.memberProfile(userId, in: roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
    }
}

struct ParticipantStack: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userIds: [String]
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: -WZ.Space.space3) {
            ForEach(userIds.prefix(5), id: \.self) { userId in
                MiniAvatar(roomId: roomId, userId: userId)
                    .overlay(Circle().stroke(theme.bgPrimary, lineWidth: WZ.BorderWidth.thick))
            }
            if userIds.count > 5 {
                Text("+\(userIds.count - 5)")
                    .font(.wizard(WZ.FontSize.xs, .bold))
                    .foregroundStyle(theme.textMuted)
                    .padding(.leading, WZ.Space.space4)
            }
        }
    }
}

private struct MiniAvatar: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userId: String
    @State private var name: String?
    @State private var url: String?

    var body: some View {
        AvatarView(name: name ?? userId, url: url, size: WZ.SizeAvatar.xs)
            .task(id: userId) {
                let profile = await session.memberProfile(userId, in: roomId)
                name = profile.name
                url = profile.avatarUrl
            }
    }
}
