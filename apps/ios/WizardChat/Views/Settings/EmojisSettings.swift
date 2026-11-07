import PhotosUI
import SwiftUI

struct EmojisSettings: View {
    static let userPackType = "im.ponies.user_emotes"
    static let emoteRoomsTypes = ["im.ponies.emote_rooms", "m.image_pack.rooms"]

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    @State private var pack: [String: Any] = [:]
    @State private var favorites: [(roomId: String, stateKey: String, name: String?)] = []
    @State private var photo: PhotosPickerItem?
    @State private var pendingImage: (url: String, mime: String)?
    @State private var shortcode = ""
    @State private var showSelectPacks = false
    @State private var error: String?

    private var images: [(shortcode: String, url: String)] {
        (pack["images"] as? [String: [String: Any]] ?? [:])
            .compactMap { key, value in (value["url"] as? String).map { (key, $0) } }
            .sorted { $0.shortcode < $1.shortcode }
    }

    var body: some View {
        SettingsPage(title: "room.settings.emojis.title") {
            SettingsSection(title: "settings.emojisStickers.defaultPack", note: "settings.emojisStickers.defaultPackNote") {
                VStack(alignment: .leading, spacing: WZ.Space.space5) {
                    Text(L10n.format("settings.emojisStickers.imageCount", images.count))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: WZ.Space.space4)], spacing: WZ.Space.space4) {
                        ForEach(images, id: \.shortcode) { image in
                            VStack(spacing: WZ.Space.space2) {
                                PackImageThumb(url: image.url)
                                Text(":\(image.shortcode):")
                                    .font(.wizard(WZ.FontSize.xs))
                                    .foregroundStyle(theme.textMuted)
                                    .lineLimit(1)
                            }
                            .contextMenu {
                                Button(role: .destructive) {
                                    Task { await removeImage(image.shortcode) }
                                } label: { Label(menu: String(localized: "common.remove"), icon: "ph-trash-regular", destructive: true) }
                            }
                        }
                        PhotosPicker(selection: $photo, matching: .images) {
                            VStack(spacing: WZ.Space.space2) {
                                Image("ph-plus-regular")
                                    .font(.system(size: WZ.SizeIcon.md))
                                    .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                                    .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WizardTheme.radiusMd))
                                Text(String(localized: "settings.emojisStickers.upload")).font(.wizard(WZ.FontSize.xs))
                            }
                            .foregroundStyle(theme.textMuted)
                        }
                    }
                    if pendingImage != nil {
                        HStack(spacing: WZ.Space.space4) {
                            TextField("", text: $shortcode, prompt: Text("shortcode").foregroundColor(theme.textMuted))
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .wizardField()
                            Button(String(localized: "common.save")) { Task { await addImage() } }
                                .buttonStyle(PrimaryButtonStyle())
                                .frame(width: WZ.SizeAvatar.xl)
                                .disabled(shortcode.trimmingCharacters(in: CharacterSet(charactersIn: ": ")).isEmpty)
                        }
                    }
                    Text(String(localized: "settings.emojisStickers.imageActionsHint"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
            }

            SettingsSection(title: "settings.emojisStickers.favoritePacks",
                            note: "settings.emojisStickers.favoritePacksNote") {
                if favorites.isEmpty {
                    Text(String(localized: "settings.emojisStickers.noFavoritePacks"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
                ForEach(Array(favorites.enumerated()), id: \.offset) { index, favorite in
                    if index > 0 { SettingsDivider() }
                    HStack {
                        VStack(alignment: .leading, spacing: WZ.Space.space1) {
                            Text(favorite.name ?? (favorite.stateKey.isEmpty ? roomName(favorite.roomId) : favorite.stateKey))
                                .font(.wizard(WZ.FontSize.md, .medium))
                                .foregroundStyle(theme.textPrimary)
                            Text(roomName(favorite.roomId))
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                        .lineLimit(1)
                        Spacer()
                        Button {
                            Task { await setFavorite(favorite.roomId, favorite.stateKey, false) }
                        } label: {
                            Image("ph-star-fill")
                        }
                        .foregroundStyle(theme.accent)
                        .accessibilityLabel(String(localized: "settings.emojisStickers.removeFavorite"))
                    }
                }
                SettingsDivider()
                Button {
                    showSelectPacks = true
                } label: {
                    Label(String(localized: "settings.emojisStickers.selectPacks"), image: "ph-plus-regular")
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.control)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
            if let error { StatusText(text: error) }
        }
        .task { await reload() }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task { await upload(item) }
        }
        .sheet(isPresented: $showSelectPacks, onDismiss: { Task { await reload() } }) {
            SelectPacksSheet(isFavorite: { roomId, key in
                favorites.contains { $0.roomId == roomId && $0.stateKey == key }
            }, setFavorite: setFavorite)
        }
    }

    private func roomName(_ roomId: String) -> String {
        session.roomList?.room(id: roomId)?.name ?? roomId
    }

    private func reload() async {
        pack = await session.accountDataJSON(Self.userPackType) ?? [:]
        var result: [(String, String)] = []
        for type in Self.emoteRoomsTypes {
            let rooms = (await session.accountDataJSON(type))?["rooms"] as? [String: [String: Any]] ?? [:]
            for (roomId, keys) in rooms {
                for key in keys.keys where !result.contains(where: { $0.0 == roomId && $0.1 == key }) {
                    result.append((roomId, key))
                }
            }
        }
        var named: [(roomId: String, stateKey: String, name: String?)] = []
        for (roomId, key) in result {
            named.append((roomId: roomId, stateKey: key, name: await packName(roomId, key)))
        }
        favorites = named
    }

    private func packName(_ roomId: String, _ stateKey: String) async -> String? {
        for type in ["im.ponies.room_emotes", "m.room.image_pack"] {
            let content = await session.stateEvents(type, in: roomId).first { $0.key == stateKey }?.content
            if let name = (content?["pack"] as? [String: Any])?["display_name"] as? String, !name.isEmpty { return name }
        }
        return nil
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { photo = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else { return }
            let isGif = data.starts(with: [0x47, 0x49, 0x46])
            let payload = isGif ? data : (image.pngData() ?? data)
            let mime = isGif ? "image/gif" : "image/png"
            let url = try await session.uploadMedia(payload, mimeType: mime)
            pendingImage = (url, mime)
            shortcode = ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func addImage() async {
        guard let pendingImage else { return }
        let code = shortcode.trimmingCharacters(in: CharacterSet(charactersIn: ": "))
            .replacingOccurrences(of: " ", with: "_")
        var content = pack
        var images = content["images"] as? [String: Any] ?? [:]
        images[code] = ["url": pendingImage.url, "body": code, "info": ["mimetype": pendingImage.mime]]
        content["images"] = images
        if content["pack"] == nil { content["pack"] = ["usage": ["emoticon", "sticker"]] }
        await save(content)
        self.pendingImage = nil
    }

    private func removeImage(_ code: String) async {
        var content = pack
        var images = content["images"] as? [String: Any] ?? [:]
        images.removeValue(forKey: code)
        content["images"] = images
        await save(content)
    }

    private func save(_ content: [String: Any]) async {
        do {
            try await session.setAccountDataJSON(Self.userPackType, content)
            pack = content
        } catch {
            self.error = L10n.format("common.saveFailed", "\(error.localizedDescription)")
        }
    }

    private func setFavorite(_ roomId: String, _ stateKey: String, _ on: Bool) async {
        do {
            for type in Self.emoteRoomsTypes {
                var content = await session.accountDataJSON(type) ?? [:]
                var rooms = content["rooms"] as? [String: [String: Any]] ?? [:]
                var keys = rooms[roomId] ?? [:]
                if on { keys[stateKey] = [String: Any]() } else { keys.removeValue(forKey: stateKey) }
                rooms[roomId] = keys.isEmpty ? nil : keys
                content["rooms"] = rooms
                try await session.setAccountDataJSON(type, content)
            }
            await reload()
        } catch {
            self.error = L10n.format("common.saveFailed", "\(error.localizedDescription)")
        }
    }
}

private struct PackImageThumb: View {
    let url: String
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                theme.bgTertiary
            }
        }
        .frame(width: WZ.Space.space11, height: WZ.Space.space11)
        .clipShape(RoundedRectangle(cornerRadius: WizardTheme.radiusSm))
        .task(id: url) { image = await mediaLoader?.thumbnail(url, size: 168) }
    }
}

private struct SelectPacksSheet: View {
    let isFavorite: (String, String) -> Bool
    let setFavorite: (String, String, Bool) async -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var packs: [(roomId: String, roomName: String, stateKey: String, name: String, count: Int)] = []
    @State private var loading = true
    @State private var selected: Set<String> = []

    var body: some View {
        NavigationStack {
            List {
                if loading {
                    ProgressView().tint(theme.accent).frame(maxWidth: .infinity)
                } else if packs.isEmpty {
                    Text(String(localized: "settings.emojisStickers.noPacksFound")).foregroundStyle(theme.textMuted)
                }
                ForEach(Array(packs.enumerated()), id: \.offset) { _, pack in
                    let id = pack.roomId + "|" + pack.stateKey
                    Button {
                        let on = !selected.contains(id)
                        if on { selected.insert(id) } else { selected.remove(id) }
                        Task { await setFavorite(pack.roomId, pack.stateKey, on) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                                Text(pack.name).font(.wizard(WZ.FontSize.md, .medium)).foregroundStyle(theme.textPrimary)
                                Text("\(pack.roomName) · \(pack.count == 1 ? "1 image" : "\(pack.count) images")")
                                    .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                            }
                            Spacer()
                            Image(selected.contains(id) ? "ph-star-fill" : "ph-star-regular")
                                .foregroundStyle(selected.contains(id) ? theme.accent : theme.textMuted)
                        }
                    }
                    .listRowBackground(theme.bgPrimary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "settings.emojisStickers.selectPacks"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } } }
        }
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        guard let rooms = session.roomList?.allJoinedRooms else { return }
        var found: [(String, String, String, String, Int)] = []
        for room in rooms {
            for type in ["im.ponies.room_emotes", "m.room.image_pack"] {
                for (key, content) in await session.stateEvents(type, in: room.id) {
                    let images = (content["images"] as? [String: Any])?.count ?? 0
                    guard images > 0, !found.contains(where: { $0.0 == room.id && $0.2 == key }) else { continue }
                    let name = (content["pack"] as? [String: Any])?["display_name"] as? String ?? (key.isEmpty ? room.displayName : key)
                    found.append((room.id, room.displayName, key, name, images))
                    if isFavorite(room.id, key) { selected.insert(room.id + "|" + key) }
                }
            }
        }
        packs = found.map { (roomId: $0.0, roomName: $0.1, stateKey: $0.2, name: $0.3, count: $0.4) }
    }
}
