import SwiftUI

/// Microphone processing, applied to the next call. A section of Settings > Voice & Video
/// (`VoiceVideoSettings` lays it out, there is no separate page).
struct VoiceProcessingSection: View {
    @EnvironmentObject private var prefs: AppPreferences

    var body: some View {
        SettingsSection(title: "settings.voice.inputTitle", note: "settings.voice.processingNote") {
            ToggleRow(label: "settings.voice.noiseSuppression", note: "settings.voice.noiseSuppressionNote",
                      isOn: $prefs.noiseSuppression)
            ToggleRow(label: "settings.voice.echoCancellation", note: "settings.voice.echoCancellationNote",
                      isOn: $prefs.echoCancellation)
            ToggleRow(label: "settings.voice.autoGainControl", note: "settings.voice.autoGainControlNote",
                      isOn: $prefs.autoGainControl)
        }
    }
}

/// The Mudrix-only sections of Settings > Voice & Video: sound effects, moves between voice rooms and the
/// soundboard on this device. Meant to be placed inside the page by `VoiceVideoSettings`.
struct VoiceSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    var body: some View {
        soundEffects
        SettingsSection {
            ToggleRow(label: "settings.voice.allowMoves", note: "settings.voice.allowMovesNote", isOn: $prefs.allowVoiceMoves)
        }
        soundboard
    }

    // MARK: Sound effects

    private var mainPack: SoundPack { SoundPacks.named(prefs.notificationSoundPack) }

    private func packLabel(_ pack: SoundPack) -> String {
        "\(pack.name) (\(L10n.format("settings.voice.packGroup.\(pack.category)")))"
    }

    /// The packs the picker lists, in the order of their groups, plus `extra` when it is not one of them
    private func packOptions(including extra: String? = nil) -> [(String, LocalizedStringKey)] {
        var packs = SoundPacks.playable
        if let extra, !packs.contains(where: { $0.id == extra }), let found = SoundPacks.all.first(where: { $0.id == extra }) {
            packs.append(found)
        }
        var options: [(String, LocalizedStringKey)] = []
        for category in SoundPacks.categories {
            for pack in packs where pack.category == category {
                options.append((pack.id, LocalizedStringKey(packLabel(pack))))
            }
        }
        return options
    }

    /// Same as the pack, off, or any pack; a pack that lacks a sound plays the fallback for it, so every pack can be picked
    private func overrideOptions(_ chosen: String) -> [(String, LocalizedStringKey)] {
        var options: [(String, LocalizedStringKey)] = [
            ("", LocalizedStringKey(L10n.format("settings.voice.soundSame", mainPack.name))),
            (SoundPacks.off, "settings.voice.soundOff"),
        ]
        let extra = chosen.isEmpty || chosen == SoundPacks.off ? nil : chosen
        options.append(contentsOf: packOptions(including: extra))
        return options
    }

    private func overrideSelection(_ kind: SoundKind) -> String {
        guard let chosen = prefs.soundOverrides[kind.id] else { return "" }
        if chosen == SoundPacks.off || SoundPacks.all.contains(where: { $0.id == chosen }) { return chosen }
        return ""
    }

    private func setOverride(_ kind: SoundKind, _ value: String) {
        var overrides = prefs.soundOverrides
        if value.isEmpty { overrides.removeValue(forKey: kind.id) } else { overrides[kind.id] = value }
        prefs.soundOverrides = overrides
        if value != SoundPacks.off { Sounds.preview(kind, pack: value.isEmpty ? mainPack.id : value) }
    }

    private var soundEffects: some View {
        SettingsSection(title: "settings.voice.soundsTitle", note: "settings.voice.soundsNote") {
            PickerRow(
                label: "settings.voice.soundPack",
                selection: Binding(
                    get: { mainPack.id },
                    set: { id in
                        prefs.notificationSoundPack = id
                        Sounds.preview(.message, pack: id)
                    }),
                options: packOptions(including: mainPack.id))
            VolumeRow(label: "settings.voice.soundVolume", volume: prefs.notificationSoundVolume,
                      onCommit: { prefs.notificationSoundVolume = $0 },
                      onPreview: { Sounds.preview(.message, pack: mainPack.id) })
            ForEach(SoundKind.pickable, id: \.id) { kind in
                let chosen = overrideSelection(kind)
                PickerRow(
                    label: LocalizedStringKey(kind.labelKey),
                    selection: Binding(get: { chosen }, set: { setOverride(kind, $0) }),
                    options: overrideOptions(chosen))
            }
            if !prefs.soundOverrides.isEmpty {
                Button(String(localized: "settings.voice.resetSounds")) { prefs.soundOverrides = [:] }
                    .buttonStyle(SecondaryButtonStyle())
            }
        }
    }

    // MARK: Soundboard

    private var soundboard: some View {
        SettingsSection(title: "settings.voice.soundboardTitle") {
            ToggleRow(label: "settings.voice.soundboardEnable", note: "settings.voice.soundboardEnableNote",
                      isOn: $prefs.soundboardEnabled)
            VolumeRow(label: "settings.voice.soundboardVolume", volume: prefs.soundboardVolume,
                      onCommit: { prefs.soundboardVolume = $0 }, onPreview: nil)
            if prefs.soundboardMutedUsers.isEmpty {
                Text(String(localized: "settings.voice.soundboardMutedNone"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            } else {
                ForEach(prefs.soundboardMutedUsers.sorted(), id: \.self) { userId in
                    HStack {
                        Text(userId).lineLimit(1).truncationMode(.middle)
                        Spacer()
                        Button(String(localized: "settings.voice.soundboardUnmute")) {
                            prefs.soundboardMutedUsers.removeAll { $0 == userId }
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
        }
    }
}

/// A 0-100 slider that keeps its own value while it is dragged and saves it when the finger lifts
private struct VolumeRow: View {
    let label: LocalizedStringKey
    let onCommit: (Double) -> Void
    let onPreview: (() -> Void)?
    @State private var value: Double
    @Environment(\.theme) private var theme

    init(label: LocalizedStringKey, volume: Double, onCommit: @escaping (Double) -> Void, onPreview: (() -> Void)?) {
        self.label = label
        self.onCommit = onCommit
        self.onPreview = onPreview
        _value = State(initialValue: volume)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            HStack {
                Text(label).font(.wizard(WZ.FontSize.lg)).foregroundStyle(theme.textPrimary)
                Spacer()
                Text("\(Int(value))%").font(.wizard(WZ.FontSize.sm, .medium)).foregroundStyle(theme.textMuted)
            }
            Slider(value: $value, in: 0...100, step: 1) { editing in
                guard !editing else { return }
                onCommit(value)
                onPreview?()
            }
            .tint(theme.accent)
        }
    }
}
