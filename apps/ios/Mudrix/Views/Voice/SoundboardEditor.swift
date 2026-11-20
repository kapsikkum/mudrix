import AVFoundation
import MudrixCore
import SwiftUI
import UniformTypeIdentifiers

/// Which board a clip belongs to
enum BoardTarget: Equatable {
    case personal
    case room(String, String)
}

/// A clip being added or changed, to present the editor for it
struct SoundEditorRequest: Identifiable {
    let id = UUID()
    let target: BoardTarget
    let sound: SoundboardSound?
}

/// A sound file chosen and checked: its bytes (at most 512 KB), type and length
private struct PickedSound {
    let data: Data
    let mimetype: String
    let durationMs: Int64
    let fileName: String
}

/// Adding a clip to a pack, or changing or deleting one of its clips (name, emoji, file); the same as
/// Android's `SoundEditorSheet`
struct SoundEditorSheet: View {
    let target: BoardTarget
    let existing: SoundboardSound?
    let preview: (SoundboardClip) async -> Void
    let onChanged: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var picked: PickedSound?
    @State private var name: String
    @State private var emoji: String
    @State private var busy = false
    @State private var error: String?
    @State private var showFiles = false
    @State private var confirmDelete = false
    @State private var player: AVAudioPlayer?

    init(target: BoardTarget, existing: SoundboardSound?, preview: @escaping (SoundboardClip) async -> Void,
         onChanged: @escaping () -> Void) {
        self.target = target
        self.existing = existing
        self.preview = preview
        self.onChanged = onChanged
        _name = State(initialValue: existing?.name ?? "")
        _emoji = State(initialValue: existing?.emoji ?? "")
    }

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    Button { showFiles = true } label: {
                        HStack {
                            Label(picked?.fileName ?? String(localized: "soundboard.panel.chooseFile"), image: "ph-file-regular")
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            if let picked {
                                Text(verbatim: String(format: "%.1f s", Double(picked.durationMs) / 1000))
                                    .foregroundStyle(theme.textMuted)
                            }
                        }
                    }
                    if picked != nil || existing != nil {
                        Button { Task { await playPreview() } } label: {
                            Label(String(localized: "soundboard.panel.preview"), image: "ph-speaker-high-regular")
                        }
                    }
                } footer: {
                    Text(String(localized: "soundboard.panel.fileNote"))
                }
                Section {
                    TextField(String(localized: "soundboard.panel.name"), text: $name)
                        .onChange(of: name) { _, value in
                            if value.count > SoundboardFormat.maxNameLength { name = String(value.prefix(SoundboardFormat.maxNameLength)) }
                        }
                    TextField(String(localized: "soundboard.panel.emoji"), text: $emoji)
                        .onChange(of: emoji) { _, value in
                            if value.count > 16 { emoji = String(value.prefix(16)) }
                        }
                }
                if existing != nil {
                    Section {
                        Button(role: .destructive) { confirmDelete = true } label: {
                            Label(String(localized: "soundboard.panel.delete"), image: "ph-trash-regular")
                        }
                        .disabled(busy)
                    }
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .tint(theme.control)
            .navigationTitle(String(localized: existing == nil ? "soundboard.panel.addSound" : "soundboard.panel.editTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: existing == nil ? "soundboard.panel.add" : "common.save")) { Task { await submit() } }
                        .disabled(busy || (existing == nil && picked == nil))
                }
            }
            .fileImporter(isPresented: $showFiles, allowedContentTypes: [.audio]) { result in
                if case .success(let url) = result { Task { await pick(url) } }
            }
            .confirmationDialog(String(localized: "soundboard.panel.confirmDelete"), isPresented: $confirmDelete,
                                titleVisibility: .visible) {
                Button(String(localized: "soundboard.panel.delete"), role: .destructive) {
                    guard let existing else { return }
                    Task { await save { _, board in SoundboardEdit.removed(board, id: existing.id) } }
                }
            }
        }
        .onDisappear { player?.stop() }
    }

    // MARK: Choosing a file

    private func pick(_ url: URL) async {
        error = nil
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let size = Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        let type = (try? url.resourceValues(forKeys: [.contentTypeKey]).contentType)?.preferredMIMEType
        let mimetype = SoundboardEdit.mimetype(contentType: type, fileName: url.lastPathComponent)
        // Checked before the file is read, so a huge file is never loaded
        if let problem = SoundboardEdit.check(mimetype: mimetype, size: size, durationMs: 1) {
            error = L10n.format(problem.key)
            return
        }
        let seconds = (try? await AVURLAsset(url: url).load(.duration).seconds) ?? 0
        let durationMs = seconds.isFinite ? Int64((seconds * 1000).rounded()) : 0
        if let problem = SoundboardEdit.check(mimetype: mimetype, size: size, durationMs: durationMs) {
            error = L10n.format(problem.key)
            return
        }
        guard let mimetype, let data = try? Data(contentsOf: url) else {
            error = L10n.format(SoundboardEdit.Problem.decode.key)
            return
        }
        picked = PickedSound(data: data, mimetype: mimetype, durationMs: durationMs, fileName: url.lastPathComponent)
        if name.isEmpty {
            name = SoundboardEdit.cleanName(url.deletingPathExtension().lastPathComponent)
        }
    }

    private func playPreview() async {
        player?.stop()
        if let picked {
            player = try? AVAudioPlayer(data: picked.data)
            player?.play()
        } else if let existing {
            await preview(SoundboardFormat.clip(existing))
        }
    }

    // MARK: Saving

    /// Reads the pack fresh, applies the change, writes it back through the core and closes
    private func save(_ action: @escaping (MudrixClient, [SoundboardSound]) async throws -> [SoundboardSound]) async {
        guard let client = session.client else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            switch target {
            case .personal:
                let pack = try? await client.mySounds()
                let current = pack?.sounds.map(SoundboardFormat.sound) ?? []
                let next = try await action(client, current)
                try await SoundboardEdit.savePersonal(client: client, pack: pack, board: next)
            case .room(let roomId, let stateKey):
                let packs = (try? await client.roomSoundPacks(roomId: roomId))?.packs ?? []
                let pack = packs.first { $0.stateKey == stateKey } ?? packs.first
                if pack?.canEdit == false { throw SoundboardEdit.Failure(problem: .forbidden) }
                let current = pack?.sounds.map(SoundboardFormat.sound) ?? []
                let next = try await action(client, current)
                _ = try await SoundboardEdit.saveRoom(client: client, roomId: roomId,
                                                      stateKey: pack?.stateKey ?? stateKey,
                                                      name: pack?.name ?? "", attribution: pack?.attribution,
                                                      board: next)
            }
            onChanged()
            dismiss()
        } catch let failure as SoundboardEdit.Failure {
            error = L10n.format(failure.problem.key)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func submit() async {
        let file = picked
        let chosenName = name
        let chosenEmoji = emoji
        let sound = existing
        await save { client, board in
            guard let sound else {
                guard let file else { throw SoundboardEdit.Failure(problem: .type) }
                let made = try await SoundboardEdit.upload(client: client, data: file.data, mimetype: file.mimetype,
                                                           durationMs: file.durationMs, name: chosenName,
                                                           emoji: chosenEmoji)
                return try SoundboardEdit.added(board, made)
            }
            let cleaned = SoundboardEdit.cleanName(chosenName)
            var updated = SoundboardSound(id: sound.id, name: cleaned.isEmpty ? sound.name : cleaned,
                                          emoji: SoundboardEdit.cleanEmoji(chosenEmoji), url: sound.url,
                                          mimetype: sound.mimetype, durationMs: sound.durationMs, size: sound.size,
                                          volume: 1)
            if let file {
                let fresh = try await SoundboardEdit.upload(client: client, data: file.data, mimetype: file.mimetype,
                                                            durationMs: file.durationMs, name: updated.name,
                                                            emoji: updated.emoji)
                updated = SoundboardSound(id: updated.id, name: updated.name, emoji: updated.emoji, url: fresh.url,
                                          mimetype: fresh.mimetype, durationMs: fresh.durationMs, size: fresh.size,
                                          volume: 1)
            }
            return SoundboardEdit.replaced(board, updated)
        }
    }
}

/// Plays a pack's clips outside a call (Settings and its pack editor), one at a time at the soundboard volume
@MainActor
final class SoundPreviewPlayer: ObservableObject {
    /// The url of the clip now playing
    @Published private(set) var playing: String?
    private var player: AVAudioPlayer?
    private var fetched: [String: Data] = [:]
    private var generation = 0

    func stop() {
        generation += 1
        player?.stop()
        player = nil
        playing = nil
    }

    /// Starts the clip, or stops it when it is the one playing; false when it could not be played
    @discardableResult
    func toggle(url: String, client: MudrixClient?, volume: Double) async -> Bool {
        let same = playing == url
        stop()
        guard !same else { return true }
        guard let client, !url.isEmpty else { return false }
        let token = generation
        playing = url
        let bytes: Data
        if let known = fetched[url] {
            bytes = known
        } else {
            guard let loaded = try? await client.soundboardSound(url: url) else {
                if token == generation { playing = nil }
                return false
            }
            fetched[url] = loaded
            bytes = loaded
        }
        guard token == generation else { return true }
        guard Int64(bytes.count) <= SoundboardFormat.maxSizeBytes * 3 / 2, let made = try? AVAudioPlayer(data: bytes) else {
            playing = nil
            return false
        }
        made.volume = Float(min(max(volume, 0), 100)) / 100
        guard made.play() else {
            playing = nil
            return false
        }
        player = made
        let seconds = made.duration + 0.2
        Task {
            try? await Task.sleep(for: .seconds(seconds))
            if token == generation { stop() }
        }
        return true
    }
}

/// One clip of a pack: its emoji and name, a preview button and, in the editor, edit and remove
struct PackSoundRow: View {
    let sound: MudrixCore.SoundboardSound
    let playing: Bool
    let onPlay: () -> Void
    var onEdit: (() -> Void)?
    var onRemove: (() -> Void)?
    @Environment(\.theme) private var theme

    var body: some View {
        let clip = SoundboardFormat.sound(sound)
        HStack(spacing: WZ.Space.space4) {
            Text(clip.emoji ?? "\u{1F50A}").font(.system(size: 24))
            if let onEdit {
                Button(action: onEdit) {
                    HStack(spacing: 0) {
                        Text(clip.name).lineLimit(1).foregroundStyle(theme.textPrimary)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
            } else {
                Text(clip.name).lineLimit(1)
                Spacer(minLength: 0)
            }
            Button(action: onPlay) {
                Image(playing ? "ph-stop-fill" : "ph-play-fill")
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.control)
                    .minTouchTarget()
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(String(localized: playing ? "settings.soundboard.stopPreview" : "settings.soundboard.preview"))
            if let onRemove {
                Button(action: onRemove) {
                    Image("ph-x-regular")
                        .font(.system(size: WZ.SizeIcon.md))
                        .foregroundStyle(theme.textMuted)
                        .minTouchTarget()
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(L10n.format("settings.soundboard.removeSound", clip.name))
            }
        }
    }
}

/// Settings > Soundboard > Default Pack > Edit: the personal pack's name and attribution, and its clips. A clip is
/// added, changed or removed through the in-call editor and saved at once; "Save" writes the name and attribution.
struct PersonalPackSheet: View {
    let onChanged: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var previewer = SoundPreviewPlayer()
    @State private var pack: MudrixCore.SoundPack?
    @State private var failed = false
    @State private var name = ""
    @State private var attribution = ""
    @State private var saving = false
    @State private var error: String?
    @State private var editor: SoundEditorRequest?
    @State private var removing: MudrixCore.SoundboardSound?

    private var title: String {
        let named = pack?.name ?? ""
        return named.isEmpty ? String(localized: "settings.soundboard.defaultPack") : named
    }

    var body: some View {
        NavigationStack {
            ThemedForm {
                if failed {
                    Text(String(localized: "settings.soundboard.loadFailed")).foregroundStyle(theme.textMuted)
                } else if let pack {
                    Section {
                        field("settings.soundboard.packName", placeholder: "settings.soundboard.packNamePlaceholder",
                              text: $name, limit: 64)
                        field("settings.soundboard.attribution", placeholder: "settings.soundboard.attributionPlaceholder",
                              text: $attribution, limit: 200)
                    }
                    Section {
                        if pack.sounds.isEmpty {
                            Text(String(localized: "settings.soundboard.noSounds")).foregroundStyle(theme.textMuted)
                        }
                        ForEach(pack.sounds, id: \.shortcode) { sound in
                            PackSoundRow(sound: sound, playing: previewer.playing == sound.url,
                                         onPlay: { play(sound) },
                                         onEdit: { editor = SoundEditorRequest(target: .personal, sound: SoundboardFormat.sound(sound)) },
                                         onRemove: { removing = sound })
                        }
                        Button {
                            editor = SoundEditorRequest(target: .personal, sound: nil)
                        } label: {
                            Label(String(localized: "settings.soundboard.addSounds"), image: "ph-plus-regular")
                        }
                        .disabled(pack.sounds.count >= SoundboardFormat.maxSounds)
                    } header: {
                        Text(verbatim: "\(String(localized: "settings.soundboard.sounds")) (\(pack.sounds.count))")
                    } footer: {
                        Text(String(localized: "settings.soundboard.limits"))
                    }
                } else {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .tint(theme.control)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save")) { Task { await save() } }
                        .disabled(saving || pack == nil || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .sheet(item: $editor) { request in
                SoundEditorSheet(target: request.target, existing: request.sound,
                                 preview: { clip in
                                     _ = await previewer.toggle(url: clip.url, client: session.client, volume: prefs.soundboardVolume)
                                 }) {
                    Task {
                        await reload()
                        onChanged()
                    }
                }
            }
            .confirmationDialog(String(localized: "soundboard.panel.confirmDelete"), isPresented: Binding(
                get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
                Button(String(localized: "soundboard.panel.delete"), role: .destructive) {
                    guard let sound = removing else { return }
                    Task { await remove(sound) }
                }
            }
        }
        .task { await reload(first: true) }
        .onDisappear { previewer.stop() }
    }

    private func field(_ label: LocalizedStringKey, placeholder: LocalizedStringKey, text: Binding<String>,
                       limit: Int) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space1) {
            Text(label).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            TextField(placeholder, text: text)
                .onChange(of: text.wrappedValue) { _, value in
                    if value.count > limit { text.wrappedValue = String(value.prefix(limit)) }
                }
        }
    }

    private func play(_ sound: MudrixCore.SoundboardSound) {
        Task { _ = await previewer.toggle(url: sound.url, client: session.client, volume: prefs.soundboardVolume) }
    }

    private func reload(first: Bool = false) async {
        guard let client = session.client else { return }
        do {
            let mine = try await client.mySounds()
            pack = mine
            failed = false
            if first {
                name = mine.name ?? ""
                attribution = mine.attribution ?? ""
            }
        } catch {
            if pack == nil { failed = true }
        }
    }

    private func save() async {
        guard let client = session.client else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let fresh = try await client.mySounds()
            let note = attribution.trimmingCharacters(in: .whitespacesAndNewlines)
            try await client.saveSoundPack(roomId: nil, stateKey: "", name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                                           attribution: note.isEmpty ? nil : note, sounds: fresh.sounds)
            onChanged()
            dismiss()
        } catch {
            self.error = L10n.format("common.saveFailed", error.localizedDescription)
        }
    }

    private func remove(_ sound: MudrixCore.SoundboardSound) async {
        guard let client = session.client else { return }
        error = nil
        do {
            let fresh = try await client.mySounds()
            let board = SoundboardEdit.removed(fresh.sounds.map(SoundboardFormat.sound), id: sound.shortcode)
            try await SoundboardEdit.savePersonal(client: client, pack: fresh, board: board)
            await reload()
            onChanged()
        } catch let failure as SoundboardEdit.Failure {
            error = L10n.format(failure.problem.key)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Settings > Soundboard > Favorite Packs > Select Packs: the sound packs of the person's rooms, grouped by room;
/// a ticked pack is used in every call
struct SoundPackSelectionSheet: View {
    let onToggle: (MudrixCore.SoundPack, Bool) -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var all: [MudrixCore.SoundPack]?
    @State private var failed = false

    private struct RoomGroup: Identifiable {
        let room: String
        let packs: [MudrixCore.SoundPack]
        var id: String { room }
    }

    private var groups: [RoomGroup] {
        var order: [String] = []
        var byRoom: [String: [MudrixCore.SoundPack]] = [:]
        for pack in all ?? [] {
            let key = pack.roomName ?? pack.roomId ?? ""
            if byRoom[key] == nil { order.append(key) }
            byRoom[key, default: []].append(pack)
        }
        return order.map { RoomGroup(room: $0, packs: byRoom[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            ThemedList {
                if all == nil {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if failed {
                    Text(String(localized: "settings.soundboard.loadFailed")).foregroundStyle(theme.textMuted)
                } else if groups.isEmpty {
                    Text(String(localized: "settings.soundboard.noPacksFound")).foregroundStyle(theme.textMuted)
                } else {
                    ForEach(groups) { group in
                        Section {
                            ForEach(group.packs, id: \.id) { pack in row(pack) }
                        } header: {
                            Text(group.room).foregroundStyle(theme.textMuted)
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "settings.soundboard.selectPacks"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
        }
        .tint(theme.control)
        .task { await load() }
    }

    private func row(_ pack: MudrixCore.SoundPack) -> some View {
        Button { toggle(pack) } label: {
            HStack(spacing: WZ.Space.space4) {
                Image("ph-speaker-high-regular")
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textMuted)
                Text(pack.name.flatMap { $0.isEmpty ? nil : $0 } ?? String(localized: "settings.soundboard.defaultPackName"))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: WZ.Space.space5)
                Image("ph-check-bold")
                    .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                    .foregroundStyle(theme.accent)
                    .opacity(pack.everywhere ? 1 : 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(pack.everywhere ? [.isButton, .isSelected] : .isButton)
    }

    private func toggle(_ pack: MudrixCore.SoundPack) {
        let everywhere = !pack.everywhere
        all = all?.map { current in
            guard current.id == pack.id else { return current }
            var changed = current
            changed.everywhere = everywhere
            return changed
        }
        onToggle(pack, everywhere)
    }

    private func load() async {
        guard let client = session.client else {
            failed = true
            all = []
            return
        }
        do {
            all = try await client.allSoundPacks()
        } catch {
            all = []
            failed = true
        }
    }
}
