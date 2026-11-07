import WizardChatCore
import PhotosUI
import SwiftUI

struct RoomInfoView: View {
    let room: RoomSummary
    let client: WizardClient
    var onJump: ((String) -> Void)?

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name = ""
    @State private var topic = ""
    @State private var avatarUrl: String?
    @State private var memberCount = 0
    @State private var encrypted = false
    @State private var isFavourite = false
    @State private var alias: String?
    @State private var canEditName = false
    @State private var canEditTopic = false
    @State private var canEditAvatar = false
    @State private var canInvite = false
    @State private var canPin = false
    @State private var canManageWidgets = false
    @State private var bridges: [RoomBridge] = []
    @State private var pinnedCount = 0
    @State private var showInvite = false
    @State private var confirmLeave = false
    @State private var photo: PhotosPickerItem?
    @State private var saving = false
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: WZ.Space.space4) {
                        avatar
                        Text(name.isEmpty ? room.displayName : name)
                            .font(.wizard(WZ.FontSize.xxl, .bold))
                            .foregroundStyle(theme.textPrimary)
                            .multilineTextAlignment(.center)
                        if let alias { Text(alias).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textMuted) }
                        Label(encrypted ? String(localized: "room.encryptedLabel") : String(localized: "room.notEncrypted"),
                              image: encrypted ? "ph-lock-regular" : "ph-lock-open-regular")
                            .font(.wizard(WZ.FontSize.sm, .medium))
                            .foregroundStyle(encrypted ? theme.success : theme.textMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }

                if canEditName || canEditTopic {
                    Section(String(localized: "settings.about.title")) {
                        if canEditName { TextField(String(localized: "dialogs.name"), text: $name) }
                        if canEditTopic { TextField(String(localized: "room.topic"), text: $topic, axis: .vertical).lineLimit(1...4) }
                        Button(String(localized: "common.save")) { Task { await save() } }
                            .disabled(saving || !hasChanges)
                    }
                } else if !topic.isEmpty {
                    Section(String(localized: "room.topic")) { Text(topic).foregroundStyle(theme.textPrimary) }
                }

                Section {
                    NavigationLink {
                        MembersView(roomId: room.id)
                    } label: {
                        LabeledContent { Text("\(memberCount)") } label: { Label(String(localized: "common.members"), image: "ph-users-regular") }
                    }
                    if let onJump {
                        NavigationLink {
                            RoomSearchView(room: room, client: client, onJump: onJump)
                        } label: {
                            Label(String(localized: "search.title"), image: "ph-magnifying-glass-regular")
                        }
                    }
                    NavigationLink {
                        RoomMediaView(room: room, client: client)
                    } label: {
                        Label(String(localized: "timeline.mediaLinksAndDocs"), image: "ph-images-regular")
                    }
                    NavigationLink {
                        PinnedMessagesView(room: room, client: client, canPin: canPin)
                    } label: {
                        LabeledContent { Text("\(pinnedCount)") } label: { Label(String(localized: "room.header.pinnedMessages"), image: "ph-push-pin-regular") }
                    }
                    if !room.isDirect {
                        NavigationLink {
                            RolesPermissionsView(roomId: room.id)
                        } label: {
                            Label(String(localized: "room.settings.permissions.title"), image: "ph-shield-check-regular")
                        }
                        NavigationLink {
                            AuditLogView(roomId: room.id)
                        } label: {
                            Label(String(localized: "room.settings.auditLog.title"), image: "ph-clipboard-text-regular")
                        }
                        NavigationLink {
                            RoomPacksView(roomId: room.id)
                        } label: {
                            Label(String(localized: "room.settings.emojis.title"), image: "ph-smiley-regular")
                        }
                        NavigationLink {
                            RoomWidgetsView(roomId: room.id, client: client, canManage: canManageWidgets)
                        } label: {
                            Label(String(localized: "widgets.title"), image: "ph-puzzle-piece-regular")
                        }
                        if !bridges.isEmpty {
                            NavigationLink {
                                RoomBridgesView(roomId: room.id, bridges: bridges)
                            } label: {
                                LabeledContent { Text("\(bridges.count)") } label: {
                                    Label(String(localized: "room.settings.bridges.title"), image: "ph-plugs-connected-regular")
                                }
                            }
                        }
                    }
                    if canInvite {
                        Button { showInvite = true } label: { Label(String(localized: "room.invitePeople"), image: "ph-user-plus-regular") }
                    }
                    CopyButton(title: "room.copyRoomLink", image: "ph-link-simple-regular",
                               value: "https://matrix.to/#/\(alias ?? room.id)")
                    Toggle(isOn: Binding(get: { isFavourite }, set: { value in
                        isFavourite = value
                        Task { try? await client.setFavourite(roomId: room.id, favourite: value) }
                    })) {
                        Label(String(localized: "room.favourite"), image: "ph-star-regular")
                    }
                }

                Section {
                    Button(role: .destructive) { confirmLeave = true } label: {
                        Label(room.isDirect ? String(localized: "room.leaveConversation") : String(localized: "room.leaveRoom"),
                              image: "ph-sign-out-regular")
                            .foregroundStyle(theme.danger)
                    }
                }

                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .tint(theme.control)
            .navigationTitle(room.isDirect ? String(localized: "room.conversation") : String(localized: "room.roomInfo"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
            }
            .confirmationDialog(L10n.format("room.leaveNamed2", "\(room.displayName)"), isPresented: $confirmLeave, titleVisibility: .visible) {
                Button(String(localized: "common.leave"), role: .destructive) {
                    Task {
                        try? await client.leave(roomId: room.id)
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showInvite) {
                UserPickerView(mode: .invite(room.id)) { Task { await load() } }
            }
            .onChange(of: photo) { _, item in
                guard let item else { return }
                Task { await setAvatar(item) }
            }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var avatar: some View {
        let picture = AvatarView(name: room.displayName, url: avatarUrl, size: WZ.SizeAvatar.xl)
        if canEditAvatar {
            PhotosPicker(selection: $photo, matching: .images) {
                picture.overlay(alignment: .bottomTrailing) {
                    Image(saving ? "ph-hourglass-regular" : "ph-camera-regular")
                        .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                        .foregroundStyle(theme.textOnAccent)
                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                        .background(theme.accent, in: Circle())
                        .overlay(Circle().stroke(theme.bgSecondary, lineWidth: WZ.BorderWidth.thick))
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "room.changeRoomPicture"))
        } else {
            picture
        }
    }

    @State private var originalName = ""
    @State private var originalTopic = ""
    private var hasChanges: Bool { name != originalName || topic != originalTopic }

    private func load() async {
        let info = try? await client.roomDetails(roomId: room.id)
        if !loaded {
            name = info?.name ?? room.name ?? ""
            topic = info?.topic ?? ""
            originalName = name
            originalTopic = topic
            loaded = true
        }
        avatarUrl = info?.avatarUrl ?? room.avatarUrl
        alias = info?.canonicalAlias
        pinnedCount = info?.pinnedEventIds.count ?? 0
        isFavourite = info?.isFavourite ?? room.isFavourite
        memberCount = info?.memberCount ?? room.memberCount
        encrypted = info?.isEncrypted ?? room.isEncrypted
        if let permissions = info?.permissions {
            canEditName = permissions.changeName
            canEditTopic = permissions.changeTopic
            canEditAvatar = permissions.changeAvatar
            canInvite = permissions.invite
            canPin = permissions.pin
            canManageWidgets = permissions.manageWidgets
        }
        bridges = await RoomBridge.load(client: client, roomId: room.id)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            if name != originalName { try await client.setRoomName(roomId: room.id, name: name) }
            if topic != originalTopic { try await client.setRoomTopic(roomId: room.id, topic: topic) }
            originalName = name
            originalTopic = topic
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setAvatar(_ item: PhotosPickerItem) async {
        saving = true
        defer { saving = false; photo = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data),
              let jpeg = image.preparingThumbnail(of: CGSize(width: WZ.SizeDialog.md, height: WZ.SizeDialog.md * image.size.height / max(image.size.width, 1)))?
                .jpegData(compressionQuality: 0.85) else { return }
        do {
            try await client.setRoomAvatar(roomId: room.id, data: jpeg, mimetype: "image/jpeg")
            try? await Task.sleep(for: .milliseconds(500))
            avatarUrl = (try? await client.roomDetails(roomId: room.id))?.avatarUrl
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct CreateRoomView: View {
    var spaceId: String?

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name = ""
    @State private var topic = ""
    @State private var isVoice = false
    @State private var isPublic = false
    @State private var encrypted = true
    @State private var alias = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: "dialogs.name"), text: $name)
                    TextField(String(localized: "dialogs.topic"), text: $topic, axis: .vertical).lineLimit(1...3)
                }
                Section {
                    Picker(String(localized: "room.type"), selection: $isVoice) {
                        Label(String(localized: "room.text"), image: "ph-hash-straight-regular").tag(false)
                        Label(String(localized: "room.voice"), image: "ph-speaker-high-fill").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                Section {
                    Toggle(String(localized: "room.settings.security.accessPublic"), isOn: $isPublic)
                    if isPublic {
                        HStack(spacing: WZ.Space.space1) {
                            Text("#").foregroundStyle(theme.textMuted)
                            TextField("address", text: $alias)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            Text(":\(server)").foregroundStyle(theme.textMuted).lineLimit(1)
                        }
                    } else {
                        Toggle(String(localized: "room.create.e2ee"), isOn: $encrypted)
                    }
                } footer: {
                    Text(isPublic
                         ? String(localized: "room.anyoneCanFindAnd")
                         : String(localized: "room.onlyPeopleWhoAre"))
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .tint(theme.control)
            .navigationTitle(spaceId == nil ? String(localized: "rooms.newRoom") : String(localized: "room.newRoomInSpace"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button(String(localized: "common.create")) { Task { await create() } }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
    }

    private var server: String { String((session.userId ?? "").split(separator: ":", maxSplits: 1).last ?? "") }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let roomId = try await session.createRoom(
                name: name.trimmingCharacters(in: .whitespaces),
                topic: topic.isEmpty ? nil : topic,
                isPublic: isPublic, encrypted: encrypted, isVoice: isVoice,
                alias: alias.isEmpty ? nil : alias, spaceId: spaceId)
            dismiss()
            openRoom(roomId, notifier: notifier)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
