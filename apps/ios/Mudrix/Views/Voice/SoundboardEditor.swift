import AVFoundation
import MudrixCore
import SwiftUI
import UniformTypeIdentifiers

/// Which board a clip belongs to
enum BoardTarget: Equatable {
    case personal
    case room(String)
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

/// Adding a clip to a board, or changing or deleting one of its clips (name, emoji, volume, file); the same as
/// Android's `SoundEditorSheet`
struct SoundEditorSheet: View {
    let target: BoardTarget
    let existing: SoundboardSound?
    @ObservedObject var soundboard: Soundboard
    let onChanged: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var picked: PickedSound?
    @State private var name: String
    @State private var emoji: String
    @State private var volume: Double
    @State private var busy = false
    @State private var error: String?
    @State private var showFiles = false
    @State private var confirmDelete = false
    @State private var player: AVAudioPlayer?

    init(target: BoardTarget, existing: SoundboardSound?, soundboard: Soundboard, onChanged: @escaping () -> Void) {
        self.target = target
        self.existing = existing
        self.soundboard = soundboard
        self.onChanged = onChanged
        _name = State(initialValue: existing?.name ?? "")
        _emoji = State(initialValue: existing?.emoji ?? "")
        _volume = State(initialValue: Double(existing?.volume ?? 1))
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
                        Button { Task { await preview() } } label: {
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
                    VStack(alignment: .leading) {
                        HStack {
                            Text(String(localized: "soundboard.panel.volume"))
                            Spacer()
                            Text(verbatim: "\(Int((volume * 100).rounded()))%").foregroundStyle(theme.textMuted)
                        }
                        Slider(value: $volume, in: 0...1)
                            .tint(theme.accent)
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

    private func preview() async {
        player?.stop()
        if let picked {
            player = try? AVAudioPlayer(data: picked.data)
            player?.volume = Float(volume)
            player?.play()
        } else if let existing {
            var clip = SoundboardFormat.clip(existing)
            clip = SoundboardClip(id: clip.id, name: clip.name, emoji: clip.emoji, builtIn: false, url: clip.url,
                                  mimetype: clip.mimetype, durationMs: clip.durationMs, volume: Float(volume))
            await soundboard.preview(clip)
        }
    }

    // MARK: Saving

    /// Reads the board fresh, applies the change, writes it back and closes
    private func save(_ action: @escaping (MudrixClient, [SoundboardSound]) async throws -> [SoundboardSound]) async {
        guard let client = session.client else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let current: [SoundboardSound]
            switch target {
            case .personal:
                current = SoundboardFormat.parseBoard(
                    await client.firstAccountData([SoundboardFormat.boardType, SoundboardFormat.legacyBoardType]))
            case .room(let roomId):
                current = await RoomSoundboards.load(client: client, roomId: roomId, force: true).board
            }
            let next = try await action(client, current)
            switch target {
            case .personal:
                try await SoundboardEdit.writePersonal(client: client, board: next)
            case .room(let roomId):
                try await SoundboardEdit.writeRoom(client: client, roomId: roomId, userId: session.userId ?? "", board: next)
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
        let chosenVolume = Float(volume)
        let sound = existing
        await save { client, board in
            guard let sound else {
                guard let file else { throw SoundboardEdit.Failure(problem: .type) }
                let made = try await SoundboardEdit.upload(client: client, data: file.data, mimetype: file.mimetype,
                                                           durationMs: file.durationMs, name: chosenName,
                                                           emoji: chosenEmoji, volume: chosenVolume)
                return try SoundboardEdit.added(board, made)
            }
            let cleaned = SoundboardEdit.cleanName(chosenName)
            var updated = SoundboardSound(id: sound.id, name: cleaned.isEmpty ? sound.name : cleaned,
                                          emoji: SoundboardEdit.cleanEmoji(chosenEmoji), url: sound.url,
                                          mimetype: sound.mimetype, durationMs: sound.durationMs, size: sound.size,
                                          volume: chosenVolume)
            if let file {
                let fresh = try await SoundboardEdit.upload(client: client, data: file.data, mimetype: file.mimetype,
                                                            durationMs: file.durationMs, name: updated.name,
                                                            emoji: updated.emoji, volume: chosenVolume)
                updated = SoundboardSound(id: updated.id, name: updated.name, emoji: updated.emoji, url: fresh.url,
                                          mimetype: fresh.mimetype, durationMs: fresh.durationMs, size: fresh.size,
                                          volume: chosenVolume)
            }
            return SoundboardEdit.replaced(board, updated)
        }
    }
}
