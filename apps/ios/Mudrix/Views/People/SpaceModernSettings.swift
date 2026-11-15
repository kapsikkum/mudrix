import PhotosUI
import SwiftUI
import MudrixCore

/// What the Modern room list adds to a space's settings: style, auto-join and a banner colour (set by whoever can send that
/// state), and the links to the Channels, Roles and Audit log screens. Meant to sit inside the settings `Form`.
struct SpaceModernSettingsSections: View {
    let space: SpaceSummary
    @ObservedObject var roomList: RoomListModel

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @ObservedObject private var states = MudrixRoomStates.shared
    @StateObject private var manager = SpaceRoleManager()
    @State private var error: String?
    @State private var photo: PhotosPickerItem?
    @State private var uploadingBanner = false

    private var state: MudrixRoomState? { states.state(space.id) }
    private var style: RoomListStyle { SpaceModern.style(of: state) }
    private var autoJoin: Bool { SpaceModern.explicitAutoJoin(of: state) ?? (style == .modern) }
    private var banner: SpaceModern.Banner? { SpaceModern.banner(of: state) }

    var body: some View {
        Section {
            ForEach([RoomListStyle.matrix, RoomListStyle.modern], id: \.rawValue) { option in
                Button {
                    write(MudrixTypes.spaceListStyle, .object(["style": .string(option.rawValue)]))
                } label: {
                    HStack {
                        Text(option == .modern
                             ? String(localized: "settings.appearance.roomListStyleModern")
                             : String(localized: "settings.appearance.roomListStyleMatrix"))
                            .foregroundStyle(theme.textPrimary)
                        Spacer()
                        if style == option { Image(systemName: "checkmark").foregroundStyle(theme.accent) }
                    }
                    .contentShape(Rectangle())
                }
                .disabled(!manager.canSend(MudrixTypes.spaceListStyle))
            }
            if style == .modern {
                Toggle(String(localized: "room.settings.general.autoJoin"), isOn: Binding(
                    get: { autoJoin },
                    set: { write(MudrixTypes.spaceAutoJoin, .object(["enabled": .bool($0)])) }
                ))
                .disabled(!manager.canSend(MudrixTypes.spaceAutoJoin))
            }
        } header: {
            Text(String(localized: "settings.appearance.roomListStyle"))
                .task(id: space.id) { await manager.load(spaceId: space.id, session: session) }
                .onChange(of: states.revision) { _, _ in manager.rebuild(graph: session.roomList?.graph ?? []) }
        } footer: {
            Text(style == .modern ? String(localized: "room.settings.general.autoJoinNote") : String(localized: "settings.appearance.roomListStyleNote"))
        }

        if style == .modern {
            Section(String(localized: "room.space.banner.title")) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: WZ.Space.space3) {
                        ForEach(SpaceModern.bannerPresets, id: \.id) { preset in
                            Button {
                                write(MudrixTypes.spaceBanner, .object(["color": .string(preset.id)]))
                            } label: {
                                Circle()
                                    .fill(LinearGradient(colors: [Color(hex: preset.from), Color(hex: preset.to)],
                                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                                    .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                                    .overlay(Circle().stroke(banner?.color == preset.id ? theme.accent : theme.border,
                                                             lineWidth: banner?.color == preset.id ? WZ.BorderWidth.thick : WZ.BorderWidth.thin))
                            }
                            .buttonStyle(.plain)
                            .disabled(!manager.canSend(MudrixTypes.spaceBanner))
                        }
                    }
                    .padding(.vertical, WZ.Space.space2)
                }
                if manager.canSend(MudrixTypes.spaceBanner) {
                PhotosPicker(selection: $photo, matching: .images) {
                    Label(String(localized: "room.space.banner.upload"), image: "ph-images-regular")
                }
                .disabled(uploadingBanner)
                .onChange(of: photo) { _, item in
                    guard let item else { return }
                    Task { await uploadBanner(item) }
                }
            }
            if banner != nil, manager.canSend(MudrixTypes.spaceBanner) {
                    Button(role: .destructive) {
                        write(MudrixTypes.spaceBanner, .object([:]))
                    } label: {
                        Label(String(localized: "room.space.banner.remove"), image: "ph-trash-regular").foregroundStyle(theme.danger)
                    }
                }
            }

        }

        Section {
            if style == .modern {
                NavigationLink {
                    SpaceChannelsView(spaceId: space.id, roomList: roomList)
                } label: {
                    Label(String(localized: "room.settings.channels.title"), image: "ph-list-bullets-regular")
                }
                if manager.management.modern {
                    NavigationLink {
                        SpaceRolesView(spaceId: space.id)
                    } label: {
                        Label(String(localized: "room.settings.roles.title"), image: "ph-star-regular")
                    }
                }
            }
            if manager.canSend("m.space.child") {
                NavigationLink {
                    AuditLogView(roomId: space.id)
                } label: {
                    Label(String(localized: "room.settings.auditLog.title"), image: "ph-clipboard-text-regular")
                }
            }
        }
        if let error {
            Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
        }
    }

    /// Uploads a picture as the space's banner, as the web does: its url in the banner state, shown over the colour
    private func uploadBanner(_ item: PhotosPickerItem) async {
        defer { photo = nil }
        guard let client = session.client,
              let data = try? await item.loadTransferable(type: Data.self),
              let jpeg = SpaceModern.bannerJpeg(from: data) else { return }
        uploadingBanner = true
        defer { uploadingBanner = false }
        do {
            let url = try await client.uploadMedia(data: jpeg, mimetype: "image/jpeg")
            try await MudrixRoomStates.shared.set(client: client, roomId: space.id, type: MudrixTypes.spaceBanner,
                                                  content: .object(["url": .string(url)]))
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func write(_ type: String, _ content: JSONValue) {
        guard let client = session.client else { return }
        let spaceId = space.id
        Task {
            do {
                try await MudrixRoomStates.shared.set(client: client, roomId: spaceId, type: type, content: content)
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

extension SpaceModern {
    /// The widest a space banner is kept; wider pictures are scaled down before they go up
    static let bannerMaxWidth: CGFloat = 1600

    /// A picture as a JPEG for the banner, at most annerMaxWidth wide; nil when the bytes are not a picture
    static func bannerJpeg(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let scale = min(1, bannerMaxWidth / max(image.size.width, 1))
        guard scale < 1 else { return image.jpegData(compressionQuality: 0.85) }
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).jpegData(withCompressionQuality: 0.85) { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
