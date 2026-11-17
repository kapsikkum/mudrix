import MudrixCore
import SwiftUI

/// Settings > Activity: what is shared about what you play, and what is on your profile right now, the Android
/// `ui/settings/ActivitySettings.kt`. iOS cannot watch other apps' playback (no media-session API for apps), so the
/// switch turns sharing off rather than on: switching it off takes a published activity back off the profile, and
/// the row below shows what your account publishes at the moment.
struct ActivitySettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var current: [ProfileActivity] = []
    @State private var busy = false
    @State private var saved = false

    private var sharing: Binding<Bool> {
        Binding(get: { prefs.shareActivity }, set: { value in
            prefs.shareActivity = value
            guard !value else { return }
            Task { await stopSharing() }
        })
    }

    var body: some View {
        SettingsPage(title: "settings.activity.title") {
            SettingsSection {
                ToggleRow(label: "settings.activity.share",
                          note: "settings.activity.shareNote",
                          isOn: sharing)
                    .disabled(busy)
            }
            SettingsSection(title: "settings.activity.detected") {
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    if let activity = current.first {
                        Text(headline(activity))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        if activity.type != "playing", !activity.details.isEmpty {
                            Text(ProfileActivityText.text("profile.activity.listeningBy",
                                                           [activity.name, activity.details]))
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                    } else {
                        Text(String(localized: "settings.activity.nothing"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                .padding(.vertical, WZ.Space.space1)
            }
            if saved {
                SettingsSection {
                    Text(String(localized: "profile.notesSaved"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
            }
        }
        .task { await load() }
    }

    /// "Right now: playing …" or "Right now: listening to …", the two keys of the settings page
    private func headline(_ activity: ProfileActivity) -> String {
        activity.type == "playing"
            ? L10n.format("settings.activity.nowPlaying", activity.name)
            : L10n.format("settings.activity.nowListening", activity.name)
    }

    private func load() async {
        guard let client = session.client, let me = session.userId,
              let fields = try? await client.profileFields(userId: me) else {
            current = []
            return
        }
        current = ProfileFields.live(ProfileFields.parse(fields).activities)
    }

    /// Takes your published activity off the profile, under every name the field has been written as
    private func stopSharing() async {
        busy = true
        defer { busy = false }
        try? await session.writeProfileField(ProfileFields.activityKeys, nil)
        await load()
        saved = true
        try? await Task.sleep(for: .seconds(1.6))
        saved = false
    }
}
