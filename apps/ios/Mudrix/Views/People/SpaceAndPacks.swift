import MudrixCore
import PhotosUI
import SwiftUI

struct SpaceSettingsView: View {
    let space: SpaceSummary
    @ObservedObject var roomList: RoomListModel

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name = ""
    @State private var topic = ""
    @State private var original = ("", "")
    @State private var avatarUrl: String?
    @State private var canEdit = false
    @State private var canManageRooms = false
    @State private var childIds: [String] = []
    @State private var hierarchy: [String: (name: String, avatar: String?)] = [:]
    @State private var photo: PhotosPickerItem?
    @State private var showAddRooms = false
    @State private var showCreateRoom = false
    @State private var confirmLeave = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    VStack(spacing: WZ.Space.space4) {
                        PhotosPicker(selection: $photo, matching: .images) {
                            AvatarView(name: space.name, url: avatarUrl, size: WZ.SizeAvatar.xl, cornerRadius: WZ.Radius.xl)
                                .overlay(alignment: .bottomTrailing) {
                                    if canEdit {
                                        Image(saving ? "ph-hourglass-regular" : "ph-camera-regular")
                                            .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                                            .foregroundStyle(theme.accent)
                                            .frame(width: WZ.Space.space8, height: WZ.Space.space8)
                                            .background(theme.bgTertiary, in: Circle())
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                        .disabled(!canEdit)
                        Text(name.isEmpty ? space.name : name)
                            .font(.wizard(WZ.FontSize.xxl, .bold))
                            .foregroundStyle(theme.textPrimary)
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }

                if canEdit {
                    Section(String(localized: "settings.about.title")) {
                        TextField(String(localized: "common.name"), text: $name)
                        TextField(String(localized: "room.topic"), text: $topic, axis: .vertical).lineLimit(1...4)
                        Button(String(localized: "common.save")) { Task { await save() } }
                            .disabled(saving || (name, topic) == original)
                    }
                }

                Section {
                    ForEach(childIds, id: \.self) { roomId in
                        childRow(roomId)
                            .swipeActions {
                                if canManageRooms {
                                    Button(String(localized: "common.remove"), role: .destructive) { Task { await remove(roomId) } }
                                }
                            }
                    }
                    if canManageRooms {
                        Button { showCreateRoom = true } label: { Label(String(localized: "room.create.title"), image: "ph-plus-regular") }
                        Button { showAddRooms = true } label: { Label(String(localized: "space.addExistingRooms"), image: "ph-stack-plus-regular") }
                    }
                } header: {
                    Text(String(localized: "nav.rooms"))
                } footer: {
                    if canManageRooms { Text(String(localized: "space.swipeToRemoveHint")) }
                }

                SpaceModernSettingsSections(space: space, roomList: roomList)

                Section {
                    NavigationLink { MembersView(roomId: space.id) } label: { Label(String(localized: "common.members"), image: "ph-users-regular") }
                    NavigationLink { RoomGeneralView(roomId: space.id) } label: {
                        Label(String(localized: "room.settings.general.title"), image: "ph-gear-regular")
                    }
                    NavigationLink { RolesPermissionsView(roomId: space.id) } label: {
                        Label(String(localized: "room.settings.permissions.title"), image: "ph-shield-check-regular")
                    }
                    NavigationLink { RoomPacksView(roomId: space.id) } label: {
                        Label(String(localized: "room.settings.emojis.title"), image: "ph-smiley-regular")
                    }
                    CopyButton(title: "space.copyLink", image: "ph-link-simple-regular", value: "https://matrix.to/#/\(space.id)")
                }

                Section {
                    Button(role: .destructive) { confirmLeave = true } label: {
                        Label(String(localized: "space.leave"), image: "ph-sign-out-regular").foregroundStyle(theme.danger)
                    }
                }
                if let error { Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error) }
            }
            .tint(theme.control)
            .navigationTitle(String(localized: "space.settingsTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } } }
            .confirmationDialog(L10n.format("room.info.leaveConfirm", "\(space.name)"), isPresented: $confirmLeave, titleVisibility: .visible) {
                Button(String(localized: "common.leave"), role: .destructive) {
                    Task { try? await session.client?.leave(roomId: space.id); dismiss() }
                }
            }
            .sheet(isPresented: $showAddRooms, onDismiss: { Task { await load() } }) {
                AddRoomsToSpaceSheet(space: space, roomList: roomList, existing: Set(childIds))
            }
            .sheet(isPresented: $showCreateRoom, onDismiss: { Task { await load() } }) {
                CreateRoomView(spaceId: space.id)
            }
            .onChange(of: photo) { _, item in
                guard let item else { return }
                Task { await setAvatar(item) }
            }
        }
        .task { await load() }
    }

    private func childRow(_ roomId: String) -> some View {
        let room = roomList.room(id: roomId)
        let name = room?.displayName ?? hierarchy[roomId]?.name ?? roomId
        return HStack(spacing: WZ.Space.space5) {
            AvatarView(name: name, url: room?.avatarUrl ?? hierarchy[roomId]?.avatar, size: WZ.SizeAvatar.sm)
            Text(name).lineLimit(1).foregroundStyle(theme.textPrimary)
            Spacer()
            if room == nil {
                Text(String(localized: "space.notJoined")).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
        }
    }

    private func load() async {
        guard let client = session.client else { return }
        let info = try? await client.roomDetails(roomId: space.id)
        if original == ("", "") {
            name = info?.name ?? space.name
            topic = info?.topic ?? ""
            original = (name, topic)
        }
        avatarUrl = info?.avatarUrl ?? space.avatarUrl
        canEdit = info?.permissions.changeName ?? false
        canManageRooms = await session.canSendState("m.space.child", in: space.id)
        let children = (try? await client.spaceChildren(spaceId: space.id)) ?? []
        for child in children {
            hierarchy[child.id] = (child.name, child.avatarUrl)
        }
        childIds = children.map(\.id)
            .sorted { (roomList.room(id: $0)?.displayName ?? $0).localizedCaseInsensitiveCompare(roomList.room(id: $1)?.displayName ?? $1) == .orderedAscending }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            if name != original.0 { try await session.requireClient.setRoomName(roomId: space.id, name: name) }
            if topic != original.1 { try await session.requireClient.setRoomTopic(roomId: space.id, topic: topic) }
            original = (name, topic)
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func remove(_ roomId: String) async {
        do {
            try await session.requireClient.removeFromSpace(spaceId: space.id, childId: roomId)
            childIds.removeAll { $0 == roomId }
        } catch { self.error = error.localizedDescription }
    }

    private func setAvatar(_ item: PhotosPickerItem) async {
        saving = true
        defer { saving = false; photo = nil }
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data),
              let jpeg = image.preparingThumbnail(of: CGSize(width: WZ.SizeDialog.md, height: WZ.SizeDialog.md * image.size.height / max(image.size.width, 1)))?
                .jpegData(compressionQuality: 0.85) else { return }
        do {
            try await session.requireClient.setRoomAvatar(roomId: space.id, data: jpeg, mimetype: "image/jpeg")
            try? await Task.sleep(for: .milliseconds(500))
            avatarUrl = (try? await session.client?.roomDetails(roomId: space.id))?.avatarUrl
        } catch { self.error = error.localizedDescription }
    }
}

private struct AddRoomsToSpaceSheet: View {
    let space: SpaceSummary
    @ObservedObject var roomList: RoomListModel
    let existing: Set<String>

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var selected: Set<String> = []
    @State private var busy = false
    @State private var error: String?

    private var candidates: [RoomSummary] {
        roomList.allJoinedRooms.filter { !$0.isDirect && !existing.contains($0.id) }
            .sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }

    var body: some View {
        NavigationStack {
            ThemedList {
                ForEach(candidates) { room in
                    Button {
                        if selected.contains(room.id) { selected.remove(room.id) } else { selected.insert(room.id) }
                    } label: {
                        HStack(spacing: WZ.Space.space5) {
                            AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.sm)
                            Text(room.displayName).foregroundStyle(theme.textPrimary).lineLimit(1)
                            Spacer()
                            Image(selected.contains(room.id) ? "ph-check-circle-fill" : "ph-circle-regular")
                                .foregroundStyle(theme.accent)
                        }
                    }
                }
            }
            .overlay { if candidates.isEmpty { ContentUnavailableView(String(localized: "space.noOtherRooms"), image: "ph-hash-straight-regular") } }
            .navigationTitle(String(localized: "space.addRooms"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.add")) { Task { await add() } }.disabled(selected.isEmpty || busy)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let error { Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error).padding() }
            }
            .tint(theme.control)
        }
    }

    private func add() async {
        busy = true
        defer { busy = false }
        do {
            for roomId in selected { try await session.addChild(roomId, to: space.id) }
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct RoomPacksView: View {
    let roomId: String
    static let packType = "im.ponies.room_emotes"

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var packs: [(key: String, content: [String: Any])] = []
    @State private var canEdit = false
    @State private var newPackName = ""
    @State private var showNewPack = false
    @State private var showUploadAndCreate = false
    @State private var loaded = false

    var body: some View {
        ThemedList {
            Section {
                ForEach(packs, id: \.key) { pack in
                    NavigationLink {
                        PackEditorView(roomId: roomId, stateKey: pack.key, initial: pack.content, canEdit: canEdit)
                    } label: {
                        let images = (pack.content["images"] as? [String: Any])?.count ?? 0
                        LabeledContent {
                            Text("\(images)")
                        } label: {
                            Label(Self.displayName(pack.content, key: pack.key), image: "ph-smiley-regular")
                        }
                    }
                }
                if canEdit {
                    Button { showNewPack = true } label: { Label(String(localized: "room.settings.emojis.newPack"), image: "ph-plus-regular") }
                    Button { showUploadAndCreate = true } label: {
                        Label(String(localized: "room.settings.emojis.uploadAndCreate"), image: "ph-images-regular")
                    }
                }
            } footer: {
                Text(String(localized: "room.settings.emojis.packsHint"))
            }
        }
        .overlay {
            if loaded && packs.isEmpty && !canEdit {
                ContentUnavailableView(String(localized: "room.settings.emojis.empty"), image: "ph-smiley-regular")
            }
        }
        .navigationTitle(String(localized: "room.settings.emojis.title"))
        .navigationBarTitleDisplayMode(.inline)
        .tint(theme.control)
        .task { await load() }
        .sheet(isPresented: $showUploadAndCreate) {
            NewPackFromImagesSheet(roomId: roomId, takenKeys: Set(packs.map { $0.key })) { await load() }
        }
        .alert(String(localized: "room.settings.emojis.newPack"), isPresented: $showNewPack) {
            TextField(String(localized: "common.name"), text: $newPackName)
            Button(String(localized: "common.create")) { Task { await create() } }
            Button(String(localized: "common.cancel"), role: .cancel) { newPackName = "" }
        }
    }

    static func displayName(_ content: [String: Any], key: String) -> String {
        ((content["pack"] as? [String: Any])?["display_name"] as? String) ?? (key.isEmpty ? String(localized: "room.settings.emojis.roomPack") : key)
    }

    private func load() async {
        defer { loaded = true }
        packs = await session.stateEvents(Self.packType, in: roomId)
            .filter { !$0.content.isEmpty }
            .sorted { Self.displayName($0.content, key: $0.key) < Self.displayName($1.content, key: $1.key) }
        canEdit = await session.canSendState(Self.packType, in: roomId)
    }

    private func create() async {
        let name = newPackName.trimmingCharacters(in: .whitespaces)
        newPackName = ""
        guard !name.isEmpty else { return }
        let key = name.lowercased().replacingOccurrences(of: " ", with: "_")
        let content: [String: Any] = ["pack": ["display_name": name, "usage": ["emoticon", "sticker"]], "images": [String: Any]()]
        try? await session.setStateEvent(Self.packType, key: key, content: content, in: roomId)
        await load()
    }
}

private struct PackEditorView: View {
    let roomId: String
    let stateKey: String
    let canEdit: Bool

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var content: [String: Any]
    @StateObject private var uploader = PackBatchUploader()
    /// Shortcodes of this editing session's uploads that are already in the pack
    @State private var merged: Set<String> = []
    @State private var renaming: String?
    @State private var newCode = ""
    @State private var error: String?

    init(roomId: String, stateKey: String, initial: [String: Any], canEdit: Bool) {
        self.roomId = roomId
        self.stateKey = stateKey
        self.canEdit = canEdit
        _content = State(initialValue: initial)
    }

    private var images: [(code: String, url: String)] {
        (content["images"] as? [String: [String: Any]] ?? [:])
            .compactMap { key, value in (value["url"] as? String).map { (key, $0) } }
            .sorted { $0.code < $1.code }
    }

    private var usage: Set<String> {
        Set(((content["pack"] as? [String: Any])?["usage"] as? [String]) ?? ["emoticon", "sticker"])
    }

    var body: some View {
        ThemedForm {
            sizeSection
            if canEdit {
                Section(String(localized: "room.settings.emojis.pack")) {
                    TextField(String(localized: "common.name"), text: Binding(
                        get: { ((content["pack"] as? [String: Any])?["display_name"] as? String) ?? stateKey },
                        set: { value in
                            var pack = content["pack"] as? [String: Any] ?? [:]
                            pack["display_name"] = value
                            content["pack"] = pack
                        }))
                        .onSubmit { Task { await save() } }
                    Toggle(String(localized: "room.settings.emojis.useAsEmoji"), isOn: usageBinding("emoticon"))
                    Toggle(String(localized: "room.settings.emojis.useAsStickers"), isOn: usageBinding("sticker"))
                }
            }
            Section {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: WZ.Space.space4)], spacing: WZ.Space.space5) {
                    ForEach(images, id: \.code) { image in
                        VStack(spacing: WZ.Space.space2) {
                            RoomPackThumb(url: image.url)
                            Text(":\(image.code):").font(.wizard(WZ.FontSize.xs)).foregroundStyle(theme.textMuted).lineLimit(1)
                        }
                        .contextMenu {
                            if canEdit {
                                Button { renaming = image.code; newCode = image.code } label: { Label(menu: String(localized: "common.rename"), icon: "ph-pencil-simple-regular") }
                                Button(role: .destructive) { Task { await remove(image.code) } } label: { Label(menu: String(localized: "common.remove"), icon: "ph-trash-regular", destructive: true) }
                            }
                        }
                    }
                }
                .padding(.vertical, WZ.Space.space3)
                if canEdit {
                    PackBatchControls(uploader: uploader, taken: { Set(images.map { $0.code }) }) { results in
                        await merge(results)
                    }
                }
            } header: {
                Text(L10n.format("settings.emojisStickers.imageCount", images.count))
            } footer: {
                if canEdit { Text(String(localized: "room.settings.emojis.imageActionsHint")) }
            }
            if let error { Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error) }
        }
        .tint(theme.control)
        .navigationTitle(RoomPacksView.displayName(content, key: stateKey))
        .navigationBarTitleDisplayMode(.inline)
        .alert(String(localized: "common.rename"), isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("shortcode", text: $newCode).textInputAutocapitalization(.never)
            Button(String(localized: "common.save")) { if let old = renaming { Task { await rename(old, to: newCode) } } }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        }
    }

    private func usageBinding(_ kind: String) -> Binding<Bool> {
        Binding(get: { usage.contains(kind) }, set: { on in
            var set = usage
            if on { set.insert(kind) } else { set.remove(kind) }
            guard !set.isEmpty else { return }
            var pack = content["pack"] as? [String: Any] ?? [:]
            pack["usage"] = Array(set).sorted()
            content["pack"] = pack
            Task { await save() }
        })
    }

    private func clean(_ code: String) -> String {
        code.trimmingCharacters(in: CharacterSet(charactersIn: ": ")).replacingOccurrences(of: " ", with: "_")
    }

    private var bytes: Int { PackSize.contentBytes(content) }
    private var level: PackSize.Level { PackSize.level(bytes: bytes) }

    /// The pack's size against the state event limit, with the warning and the way out
    private var sizeSection: some View {
        Section {
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                Text(L10n.format("room.settings.emojis.sizeMeter", PackSize.formatKb(bytes), PackSize.formatKb(PackSize.budgetBytes)))
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(level == .over ? theme.error : theme.textPrimary)
                ProgressView(value: PackSize.fraction(bytes: bytes))
                    .tint(level == .over ? theme.error : (level == .near ? theme.warningColor : theme.accent))
                if level == .near {
                    Text(String(localized: "room.settings.emojis.sizeWarn"))
                        .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.warningColor)
                }
                if level == .over {
                    Text(String(localized: "room.settings.emojis.sizeOver"))
                        .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .accessibilityElement(children: .combine)
            if canEdit && level == .over {
                Button { Task { await splitPack() } } label: {
                    Label(String(localized: "room.settings.emojis.splitPack"), image: "ph-stack-plus-regular")
                }
            }
        }
    }

    /// Puts the pictures a batch uploaded into the pack, once each, and saves
    private func merge(_ results: [(shortcode: String, image: UploadedPackImage)]) async {
        var all = content["images"] as? [String: Any] ?? [:]
        var added = false
        for result in results where !merged.contains(result.shortcode) && all[result.shortcode] == nil {
            all[result.shortcode] = result.image.entry(shortcode: result.shortcode)
            merged.insert(result.shortcode)
            added = true
        }
        guard added else { return }
        content["images"] = all
        await save()
    }

    /// Saves the pack as several, each within the limit: the first under this pack's key, the others under new ones
    private func splitPack() async {
        let parts = PackSize.split(content)
        guard parts.count > 1 else { return }
        do {
            let name = ((content["pack"] as? [String: Any])?["display_name"] as? String) ?? stateKey
            for (index, var part) in parts.enumerated() {
                var pack = part["pack"] as? [String: Any] ?? [:]
                pack["display_name"] = PackSize.numberedName(name, index: index, total: parts.count)
                part["pack"] = pack
                try await session.setStateEvent(RoomPacksView.packType, key: PackSize.partKey(stateKey, index: index), content: part,
                                                in: roomId)
                if index == 0 { content = part }
            }
            ImagePacks.forget(roomId: roomId)
            error = nil
            CopyToast.shared.show(L10n.plural("room.settings.emojis.splitDone", count: parts.count, parts.count))
        } catch {
            self.error = L10n.format("room.settings.emojis.splitFailed", error.localizedDescription)
        }
    }
    private func rename(_ old: String, to new: String) async {
        let code = clean(new)
        guard !code.isEmpty, code != old else { return }
        var all = content["images"] as? [String: Any] ?? [:]
        guard var image = all.removeValue(forKey: old) as? [String: Any] else { return }
        image["body"] = code
        all[code] = image
        content["images"] = all
        await save()
    }

    private func remove(_ code: String) async {
        var all = content["images"] as? [String: Any] ?? [:]
        all.removeValue(forKey: code)
        content["images"] = all
        await save()
    }

    private func save() async {
        // Too big for one state event: not sent, the size section offers to split it
        guard level != .over else {
            error = L10n.format("room.settings.emojis.sizeOver")
            return
        }
        do {
            try await session.setStateEvent(RoomPacksView.packType, key: stateKey, content: content, in: roomId)
            ImagePacks.forget(roomId: roomId)
            error = nil
        } catch {
            self.error = PackSize.isTooLarge(error)
                ? L10n.format("room.settings.emojis.serverTooLarge")
                : L10n.format("common.saveFailed", "\(error.localizedDescription)")
        }
    }
}

private struct RoomPackThumb: View {
    let url: String
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFit() } else { theme.fill }
        }
        .frame(width: WZ.Space.space11, height: WZ.Space.space11)
        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg))
        .task { image = await mediaLoader?.thumbnail(url, size: 112) }
    }
}
