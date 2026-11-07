import SwiftUI

/// Media settings: how media is shown in the timeline, and what is done to photos and videos before they are uploaded
struct MediaSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    /// Lengths of a typical phone clip (1080p, about 8 Mbit/s) used to show what the chosen settings do to it
    private static let exampleMinutes = [1, 5, 20]

    private static func sizeText(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }

    private static func megabytesText(_ megabytes: Int) -> String {
        sizeText(Int64(megabytes) * 1024 * 1024)
    }

    var body: some View {
        SettingsPage(title: "settings.media.title") {
            SettingsSection(title: "settings.media.viewing") {
                PickerRow(label: "settings.privacy.mediaVisibility", selection: $prefs.mediaVisibility,
                          options: [(.always, "settings.privacy.mediaVisibilityAlways"), (.private, "settings.privacy.mediaVisibilityPrivate"), (.never, "settings.privacy.mediaVisibilityNever")])
                PickerRow(label: "settings.privacy.youtubeEmbeds", note: "settings.privacy.youtubeEmbedsNote",
                          selection: $prefs.youtubeEmbeds,
                          options: [(.ask, "settings.privacy.youtubeEmbedsAsk"), (.on, "settings.privacy.youtubeEmbedsOn"), (.off, "settings.privacy.youtubeEmbedsOff")])
            }
            SettingsSection(title: "settings.media.photoUpload.title") {
                ToggleRow(label: "settings.media.photoUpload.strip", note: "settings.media.photoUpload.stripNote",
                          isOn: $prefs.photoStripMetadata)
                Picker(selection: $prefs.photoUploadSize) {
                    ForEach(PhotoUploadSize.allCases, id: \.self) { size in
                        Text(verbatim: Self.photoSizeLabel(size)).tag(size)
                    }
                } label: {
                    VStack(alignment: .leading, spacing: WZ.Space.space1) {
                        Text("settings.media.photoUpload.size")
                            .font(.wizard(WZ.FontSize.lg))
                            .foregroundStyle(theme.textPrimary)
                        Text("settings.media.photoUpload.sizeNote")
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .pickerStyle(.menu)
                .tint(theme.textMuted)
            }
            videoSection
        }
    }

    private static func photoSizeLabel(_ size: PhotoUploadSize) -> String {
        switch size {
        case .original: return String(localized: "settings.media.photoUpload.sizeOriginal")
        case .px2560: return L10n.format("settings.media.photoUpload.sizeLarge", size.rawValue)
        case .px1920: return L10n.format("settings.media.photoUpload.sizeMedium", size.rawValue)
        case .px1280: return L10n.format("settings.media.photoUpload.sizeSmall", size.rawValue)
        }
    }

    @ViewBuilder
    private var videoSection: some View {
        SettingsSection(title: "settings.media.videoUpload.title") {
            PickerRow(label: "settings.media.videoUpload.mode", note: "settings.media.videoUpload.modeNote",
                      selection: $prefs.videoUploadMode,
                      options: [(.original, "settings.media.videoUpload.modeOriginal"), (.smart, "settings.media.videoUpload.modeSmart"), (.fixed, "settings.media.videoUpload.modeFixed")])
            if prefs.videoUploadMode != .original {
                Picker(selection: $prefs.videoUploadMinSize) {
                    ForEach(VideoUploadMinSize.allCases, id: \.self) { size in
                        Text(verbatim: Self.megabytesText(size.megabytes)).tag(size)
                    }
                } label: {
                    Text("settings.media.videoUpload.minSize")
                        .font(.wizard(WZ.FontSize.lg))
                        .foregroundStyle(theme.textPrimary)
                }
                .pickerStyle(.menu)
                .tint(theme.textMuted)
                if prefs.videoUploadMode == .smart {
                    Picker(selection: $prefs.videoUploadTarget) {
                        ForEach(VideoUploadTarget.allCases, id: \.self) { target in
                            Text(verbatim: targetLabel(target)).tag(target)
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: WZ.Space.space1) {
                            Text("settings.media.videoUpload.target")
                                .font(.wizard(WZ.FontSize.lg))
                                .foregroundStyle(theme.textPrimary)
                            Text("settings.media.videoUpload.targetNote")
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(theme.textMuted)
                } else {
                    Picker(selection: $prefs.videoUploadHeight) {
                        ForEach(VideoUploadHeight.allCases, id: \.self) { height in
                            Text(verbatim: "\(height.pixels)p").tag(height)
                        }
                    } label: {
                        Text("settings.media.videoUpload.height")
                            .font(.wizard(WZ.FontSize.lg))
                            .foregroundStyle(theme.textPrimary)
                    }
                    .pickerStyle(.menu)
                    .tint(theme.textMuted)
                }
                examples
            }
        }
    }

    private func targetLabel(_ target: VideoUploadTarget) -> String {
        if let megabytes = target.megabytes { return Self.megabytesText(megabytes) }
        return L10n.format("settings.media.videoUpload.targetServer", Self.sizeText(session.uploadLimit))
    }

    /// What the settings do to a 1080p phone clip of a few lengths
    private var examples: some View {
        let uploadPrefs = prefs.videoUploadPrefs()
        let target: CompressTarget = prefs.videoUploadMode == .fixed
            ? .fixed(height: uploadPrefs.height)
            : .smart(maxBytes: VideoPlan.smartMaxBytes(uploadPrefs, session.uploadLimit))
        return VStack(alignment: .leading, spacing: WZ.Space.space1) {
            Text("settings.media.videoUpload.examples")
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(theme.textPrimary)
            ForEach(Self.exampleMinutes, id: \.self) { minutes in
                Text(verbatim: Self.exampleLine(minutes: minutes, target: target))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
        }
    }

    private static func exampleLine(minutes: Int, target: CompressTarget) -> String {
        let durationSec = Double(minutes) * 60
        let original = Int64(durationSec * 8_000_000 / 8)
        let meta = VideoMeta(durationSec: durationSec, width: 1920, height: 1080, bitrate: 8_000_000)
        if let plan = VideoPlan.planCompression(meta, target) {
            return L10n.format("settings.media.videoUpload.exampleShrunk", "\(minutes)", sizeText(original),
                               "\(plan.height)", sizeText(min(Int64(plan.estimatedBytes), original)))
        }
        return L10n.format("settings.media.videoUpload.exampleSame", "\(minutes)", sizeText(original))
    }
}
