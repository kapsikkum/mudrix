import SwiftUI
import WizardChatCore

struct CallTile: View {
    let call: CallHistoryView
    let roomId: String

    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    private static let visibleAvatars = 3

    private var title: String {
        switch call.outcome {
        case .ongoing: String(localized: "call.event.ongoing")
        case .ended: String(localized: "call.event.ended")
        case .missed: String(localized: "call.event.missed")
        case .declined: String(localized: "call.event.declined")
        case .unanswered: String(localized: "call.event.unanswered")
        }
    }

    private var tint: Color {
        switch call.outcome {
        case .ongoing: theme.success
        case .missed, .declined, .unanswered: theme.danger
        case .ended: theme.textMuted
        }
    }

    private var icon: String {
        switch call.outcome {
        case .ongoing: call.video ? "ph-video-camera-regular" : "ph-phone-regular"
        case _ where call.video: "ph-video-camera-slash-regular"
        case .ended: "ph-phone-disconnect-regular"
        default: "ph-phone-x-regular"
        }
    }

    private var canJoin: Bool { call.outcome == .ongoing && !calls.isInCall(roomId: roomId) }

    var body: some View {
        HStack(spacing: WZ.Space.space4) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: WZ.Space.space8, height: WZ.Space.space8)
                .background(theme.bgTertiary, in: Circle())
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(title)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textPrimary)
                HStack(spacing: WZ.Space.space2) {
                    Text(call.video ? String(localized: "timeline.videoCall") : String(localized: "timeline.voiceCall"))
                    duration
                }
                .font(.wizard(WZ.FontSize.xs))
                .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            avatars
            if canJoin {
                Button(String(localized: "common.join"), action: join)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .tint(theme.success)
            }
        }
        .padding(.horizontal, WZ.Space.space5)
        .padding(.vertical, WZ.Space.space3)
        .background(theme.fill, in: Capsule())
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var duration: some View {
        if !call.partial {
            let start = Date(timeIntervalSince1970: TimeInterval(call.startedAt) / 1000)
            switch call.outcome {
            case .ongoing:
                Text(verbatim: "·")
                Text(start, style: .timer).monospacedDigit()
            case .ended:
                if let endedAt = call.endedAt {
                    let seconds = max(0, TimeInterval(endedAt - call.startedAt) / 1000)
                    Text(verbatim: "·")
                    Text(Duration.seconds(seconds).formatted(.time(pattern: seconds >= 3600 ? .hourMinuteSecond : .minuteSecond)))
                        .monospacedDigit()
                }
            default:
                EmptyView()
            }
        }
    }

    @ViewBuilder
    private var avatars: some View {
        let shown = call.participants.prefix(Self.visibleAvatars)
        if !shown.isEmpty {
            HStack(spacing: -WZ.Space.space3) {
                ForEach(shown, id: \.userId) { person in
                    AvatarView(name: person.displayName ?? person.userId, url: person.avatarUrl, size: WZ.SizeAvatar.xs)
                        .overlay(Circle().stroke(theme.bgSecondary, lineWidth: WZ.BorderWidth.thick))
                }
                if call.participants.count > Self.visibleAvatars {
                    Text("+\(call.participants.count - Self.visibleAvatars)")
                        .font(.wizard(WZ.FontSize.xs, .bold))
                        .foregroundStyle(theme.textMuted)
                        .padding(.leading, WZ.Space.space4)
                }
            }
        }
    }

    private func join() {
        guard let room = session.roomList?.room(id: roomId) else { return }
        calls.showCallScreen = !room.isVoice
        Task { await calls.join(room, session: session, intent: "audio") }
    }
}
