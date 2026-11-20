import MudrixCore
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

/// The Mudrix-only sections of Settings > Voice & Video: call display and moves between voice rooms, sound
/// effects on this device. Meant to be placed inside the page by `VoiceVideoSettings`.
struct VoiceSettings: View {
    @EnvironmentObject private var prefs: AppPreferences

    var body: some View {
        SettingsSection(title: "settings.voice.callTitle") {
            ToggleRow(label: "settings.voice.showReactions", note: "settings.voice.showReactionsNote",
                      isOn: $prefs.showCallReactions)
            SettingsDivider()
            ToggleRow(label: "settings.voice.allowMoves", note: "settings.voice.allowMovesNote", isOn: $prefs.allowVoiceMoves)
        }
        soundEffects
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

}

/// Settings > Soundboard: the on-this-device switch, volume and muted people, the default (personal) pack and the
/// room packs favourited into every call
struct SoundboardSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @StateObject private var previewer = SoundPreviewPlayer()
    @State private var mine: MudrixCore.SoundPack?
    @State private var mineFailed = false
    @State private var favorites: [MudrixCore.SoundPack]?
    @State private var favoritesFailed = false
    @State private var editingDefault = false
    @State private var selecting = false

    var body: some View {
        SettingsPage(title: "settings.soundboard.title") {
            soundboard
            muted
            if session.client != nil {
                defaultPack
                favoritePacks
            }
        }
        .task { await loadMine() }
        .task { await loadFavorites() }
        .onDisappear { previewer.stop() }
        .sheet(isPresented: $editingDefault) {
            PersonalPackSheet { Task { await loadMine() } }
        }
        .sheet(isPresented: $selecting) {
            SoundPackSelectionSheet { pack, everywhere in Task { await setEverywhere(pack, everywhere) } }
        }
    }

    // MARK: This device

    private var soundboard: some View {
        SettingsSection(title: "settings.voice.soundboardTitle") {
            ToggleRow(label: "settings.voice.soundboardEnable", note: "settings.voice.soundboardEnableNote",
                      isOn: $prefs.soundboardEnabled)
            VolumeRow(label: "settings.voice.soundboardVolume", volume: prefs.soundboardVolume,
                      onCommit: { prefs.soundboardVolume = $0 }, onPreview: nil)
                .disabled(!prefs.soundboardEnabled)
            Button { Task { await playTestClip() } } label: {
                Label(String(localized: "settings.voice.soundboardPreview"), image: "ph-play-fill")
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(!prefs.soundboardEnabled || session.client == nil)
        }
    }

    private var muted: some View {
        SettingsSection(title: "settings.voice.soundboardMuted",
                        note: prefs.soundboardMutedUsers.isEmpty ? nil : "settings.voice.soundboardMutedNote") {
            if prefs.soundboardMutedUsers.isEmpty {
                Text(String(localized: "settings.voice.soundboardMutedNone"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            } else {
                ForEach(prefs.soundboardMutedUsers.sorted(), id: \.self) { userId in
                    MutedUserRow(userId: userId) { prefs.soundboardMutedUsers.removeAll { $0 == userId } }
                }
            }
        }
    }

    /// The standard sound at the configured volume (the first of the core's built-in pack, as the web page plays)
    private func playTestClip() async {
        guard let client = session.client else { return }
        let packs = (try? await client.soundboardPacks(roomId: nil)) ?? []
        guard let sample = packs.first(where: { $0.source == .builtIn })?.sounds.first,
              await previewer.toggle(url: sample.url, client: client, volume: prefs.soundboardVolume) else {
            CopyToast.shared.show(String(localized: "soundboard.play.error"))
            return
        }
    }

    // MARK: Default pack

    private var defaultPack: some View {
        SettingsSection(title: "settings.soundboard.defaultPack", note: "settings.soundboard.defaultPackNote") {
            if mineFailed {
                Text(String(localized: "settings.soundboard.loadFailed"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            } else if let mine {
                let name = mine.name.flatMap { $0.isEmpty ? nil : $0 } ?? String(localized: "settings.soundboard.defaultPackName")
                let count = L10n.plural("settings.soundboard.soundCount", count: mine.sounds.count, mine.sounds.count)
                let note = mine.attribution.flatMap { $0.isEmpty ? nil : $0 }
                PackCard(emoji: mine.sounds.first?.emoji, title: name, meta: note.map { "\($0) Â· \(count)" } ?? count) {
                    Button { editingDefault = true } label: {
                        Label(String(localized: "common.edit"), image: "ph-pencil-simple-regular")
                            .font(.wizard(WZ.FontSize.md, .medium))
                    }
                    .buttonStyle(.borderless)
                }
                ForEach(mine.sounds, id: \.shortcode) { sound in
                    PackSoundRow(sound: sound, playing: previewer.playing == sound.url) {
                        Task { _ = await previewer.toggle(url: sound.url, client: session.client, volume: prefs.soundboardVolume) }
                    }
                }
            } else {
                HStack { Spacer(); ProgressView(); Spacer() }
            }
        }
    }

    private func loadMine() async {
        guard let client = session.client else { return }
        do {
            mine = try await client.mySounds()
            mineFailed = false
        } catch {
            if mine == nil { mineFailed = true }
        }
    }

    // MARK: Favorite packs

    private var favoritePacks: some View {
        SettingsSection(title: "settings.soundboard.favoritePacks", note: "settings.soundboard.favoritePacksNote") {
            if favoritesFailed {
                Text(String(localized: "settings.soundboard.loadFailed"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            } else if let favorites {
                if favorites.isEmpty {
                    Text(String(localized: "settings.soundboard.noFavoritePacks"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
                ForEach(favorites, id: \.id) { pack in
                    let name = pack.name ?? ""
                    let count = L10n.plural("settings.soundboard.soundCount", count: pack.sounds.count, pack.sounds.count)
                    PackCard(emoji: nil, title: name, meta: "\(pack.roomName ?? pack.roomId ?? "") Â· \(count)") {
                        Button { Task { await setEverywhere(pack, false) } } label: {
                            Image("ph-x-regular")
                                .font(.system(size: WZ.SizeIcon.md))
                                .foregroundStyle(theme.textMuted)
                                .minTouchTarget()
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(L10n.format("settings.soundboard.removeFavorite", name))
                    }
                }
            } else {
                HStack { Spacer(); ProgressView(); Spacer() }
            }
            Button { selecting = true } label: { Text(String(localized: "settings.soundboard.selectPacks")) }
                .buttonStyle(SecondaryButtonStyle())
        }
    }

    private func loadFavorites() async {
        guard let client = session.client else { return }
        do {
            favorites = try await client.favoriteSoundPacks()
            favoritesFailed = false
        } catch {
            favorites = []
            favoritesFailed = true
        }
    }

    /// Adds or drops a pack at once and puts the list back when the core refuses
    private func setEverywhere(_ pack: MudrixCore.SoundPack, _ everywhere: Bool) async {
        guard let client = session.client, let roomId = pack.roomId, !roomId.isEmpty,
              let stateKey = pack.stateKey, !stateKey.isEmpty else { return }
        let before = favorites ?? []
        var added = pack
        added.everywhere = true
        favorites = before.filter { $0.id != pack.id } + (everywhere ? [added] : [])
        favoritesFailed = false
        do {
            try await client.setSoundPackEverywhere(roomId: roomId, stateKey: stateKey, everywhere: everywhere)
        } catch {
            favorites = before
            CopyToast.shared.show(L10n.format("common.saveFailed", error.localizedDescription))
        }
    }
}

/// A pack in the list: a tile with its first clip's emoji, a title and a line under it, and a control at the end
private struct PackCard<Trailing: View>: View {
    let emoji: String?
    let title: String
    let meta: String
    @ViewBuilder let trailing: () -> Trailing
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            Group {
                if let emoji, !emoji.isEmpty {
                    Text(emoji).font(.system(size: 22))
                } else {
                    Image("ph-speaker-high-regular")
                        .font(.system(size: WZ.SizeIcon.md))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .frame(width: 40, height: 40)
            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                Text(title).font(.wizard(WZ.FontSize.lg, .medium)).foregroundStyle(theme.textPrimary).lineLimit(1)
                Text(meta).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted).lineLimit(2)
            }
            Spacer(minLength: WZ.Space.space3)
            trailing()
        }
    }
}

/// A muted person: their display name when the profile can be read, else their user id
private struct MutedUserRow: View {
    let userId: String
    let onUnmute: () -> Void
    @EnvironmentObject private var session: MatrixSession
    @State private var name: String?

    var body: some View {
        HStack {
            Text(name ?? userId).lineLimit(1).truncationMode(.middle)
            Spacer()
            Button(String(localized: "settings.voice.soundboardUnmute"), action: onUnmute)
                .buttonStyle(.borderless)
        }
        .task(id: userId) {
            if let found = await session.profile(of: userId)?.displayName, !found.isEmpty { name = found }
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
