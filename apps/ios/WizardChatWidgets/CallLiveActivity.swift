import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct WizardChatWidgets: WidgetBundle {
    var body: some Widget {
        CallLiveActivity()
    }
}

struct CallLiveActivity: Widget {
    private static let green = WZ.Theme.default.colors.statusSuccess
    private static let red = WZ.Theme.default.colors.statusDanger

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CallActivityAttributes.self) { context in
            LockScreenCallView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.75))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    WizardLogoShape()
                        .frame(width: WZ.Space.space8, height: WZ.Space.space8)
                        .padding(.leading, WZ.Space.space3)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    duration(context)
                        .font(.system(size: WZ.SizeIcon.sm, weight: .semibold).monospacedDigit())
                        .foregroundStyle(Self.green)
                        .frame(maxWidth: WZ.SizeAvatar.xl, alignment: .trailing)
                        .padding(.trailing, WZ.Space.space2)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.roomName)
                        .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: WZ.Space.space4) {
                        statusLine(context)
                        CallButtons(state: context.state)
                    }
                    .padding(.top, WZ.Space.space1)
                }
            } compactLeading: {
                HStack(spacing: WZ.Space.space2) {
                    WizardLogoShape().frame(width: WZ.Space.space6, height: WZ.Space.space6)
                    Text(String(localized: "app.name"))
                        .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            } compactTrailing: {
                compactStatus(context.state)
            } minimal: {
                WizardLogoShape().frame(width: WZ.Space.space6, height: WZ.Space.space6)
            }
            .keylineTint(Self.green)
        }
    }

    @ViewBuilder
    private func duration(_ context: ActivityViewContext<CallActivityAttributes>) -> some View {
        if context.state.ringing {
            Text(String(localized: "call.ringing"))
        } else {
            Text(context.attributes.startedAt, style: .timer)
        }
    }

    @ViewBuilder
    private func compactStatus(_ state: CallActivityAttributes.ContentState) -> some View {
        if state.deafened {
            Image("ph-speaker-slash-regular").foregroundStyle(Self.red)
        } else if state.micMuted {
            Image("ph-microphone-slash-regular").foregroundStyle(Self.red)
        } else if state.othersSpeaking {
            Image("ph-waveform-regular").foregroundStyle(Self.green)
        } else {
            Image("ph-phone-regular").foregroundStyle(Self.green)
        }
    }

    private func statusLine(_ context: ActivityViewContext<CallActivityAttributes>) -> some View {
        HStack(spacing: WZ.Space.space3) {
            if context.state.ringing {
                Image("ph-phone-outgoing-regular")
                Text(String(localized: "call.callingShort"))
            } else if let speaker = context.state.speakerName {
                Image("ph-waveform-regular").foregroundStyle(Self.green)
                Text(L10n.format("call.isTalking", "\(speaker)"))
            } else {
                Image("ph-users-regular")
                Text(L10n.format("call.inCallCount", context.state.participantCount))
            }
        }
        .font(.system(size: WZ.SizeIcon.xs))
        .foregroundStyle(.white.opacity(0.75))
        .lineLimit(1)
    }
}

private struct CallButtons: View {
    let state: CallActivityAttributes.ContentState
    private static let red = WZ.Theme.default.colors.statusDanger

    var body: some View {
        HStack(spacing: WZ.Space.space4) {
            Button(intent: ToggleMicIntent()) {
                Image(state.micMuted ? "ph-microphone-slash-regular" : "ph-microphone-regular")
                    .frame(maxWidth: .infinity, minHeight: WZ.Space.space9)
            }
            .tint(state.micMuted ? Self.red : .white.opacity(0.18))
            .accessibilityLabel(state.micMuted ? String(localized: "voice.unmute") : String(localized: "voice.mute"))
            Button(intent: ToggleDeafenIntent()) {
                Image(state.deafened ? "ph-speaker-slash-regular" : "ph-speaker-high-regular")
                    .frame(maxWidth: .infinity, minHeight: WZ.Space.space9)
            }
            .tint(state.deafened ? Self.red : .white.opacity(0.18))
            .accessibilityLabel(state.deafened ? String(localized: "voice.undeafen") : String(localized: "voice.deafen"))
            Button(intent: LeaveCallIntent()) {
                Image("ph-phone-x-regular")
                    .frame(maxWidth: .infinity, minHeight: WZ.Space.space9)
            }
            .tint(Self.red)
            .accessibilityLabel(String(localized: "common.leave"))
        }
        .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
        .foregroundStyle(.white)
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
    }
}

private struct LockScreenCallView: View {
    let context: ActivityViewContext<CallActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space4) {
            HStack(spacing: WZ.Space.space4) {
                WizardLogoShape().frame(width: WZ.Space.space8, height: WZ.Space.space8)
                VStack(alignment: .leading, spacing: WZ.Space.space0) {
                    Text(context.attributes.roomName)
                        .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                        .lineLimit(1)
                    Group {
                        if context.state.ringing {
                            Text(String(localized: "call.callingShort"))
                        } else if let speaker = context.state.speakerName {
                            Text(L10n.format("call.isTalking", "\(speaker)"))
                        } else {
                            Text(context.attributes.isDirect ? String(localized: "call.wizardchatCall") : L10n.format("call.wizardchatVoiceInCall", context.state.participantCount))
                        }
                    }
                    .font(.system(size: WZ.SizeIcon.xs))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
                }
                Spacer()
                if !context.state.ringing {
                    Text(context.attributes.startedAt, style: .timer)
                        .font(.system(size: WZ.SizeIcon.sm, weight: .semibold).monospacedDigit())
                        .foregroundStyle(WZ.Theme.default.colors.statusSuccess)
                        .frame(maxWidth: WZ.SizeAvatar.xl, alignment: .trailing)
                }
            }
            CallButtons(state: context.state)
        }
        .foregroundStyle(.white)
        .padding(WZ.Space.space5)
    }
}
