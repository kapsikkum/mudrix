import PhotosUI
import SwiftUI
import WizardChatCore

/// The centred square to keep from an image, and how big it ends up: the shorter side, capped at `max`
struct SquareCrop: Equatable {
    var x: Int
    var y: Int
    var size: Int

    static func of(width: Int, height: Int, max: Int = 256) -> SquareCrop {
        let side = min(width, height)
        return SquareCrop(x: (width - side) / 2, y: (height - side) / 2, size: min(side, max))
    }
}

/// "Your name and picture here": the own member event of this room, which the server shows instead of the
/// account's name and picture. The web app has the same section in `MemberProfileSection.tsx`.
struct RoomMemberProfileSection: View {
    let roomId: String
    let client: WizardClient
    var onError: (String) -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var profile: RoomMemberProfile?
    @State private var editing = false
    @State private var name = ""
    @State private var busy = false
    @State private var photo: PhotosPickerItem?

    var body: some View {
        Section {
            Button {
                name = profile?.displayname ?? ""
                editing = true
            } label: {
                HStack {
                    Text(String(localized: "room.settings.general.myProfile.name")).foregroundStyle(theme.textPrimary)
                    Spacer()
                    Text(profile?.displayname ?? String(localized: "room.settings.general.myProfile.namePlaceholder"))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .disabled(busy)
            PhotosPicker(selection: $photo, matching: .images) {
                Text(String(localized: "room.settings.permissions.changePicture")).foregroundStyle(theme.textPrimary)
            }
            .disabled(busy)
            if profile?.avatarUrl != nil {
                Button(String(localized: "room.settings.general.myProfile.removeAvatar")) {
                    Task { await run { try await client.setRoomMemberAvatar(roomId: roomId, data: nil, mimetype: nil) } }
                }
                .foregroundStyle(theme.textMuted)
                .disabled(busy)
            }
        } header: {
            Text(String(localized: "room.settings.general.myProfile.title"))
        } footer: {
            Text(String(localized: "room.settings.general.myProfile.note"))
        }
        .task(id: roomId) { await load() }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task { await setPhoto(item) }
        }
        .alert(String(localized: "room.settings.general.myProfile.name"), isPresented: $editing) {
            TextField(String(localized: "room.settings.general.myProfile.namePlaceholder"), text: $name)
            Button(String(localized: "common.save")) { Task { await saveName(name) } }
            if profile?.displayname != nil {
                Button(String(localized: "room.space.nickname.reset")) { Task { await saveName("") } }
            }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        }
    }

    private func load() async {
        guard let me = session.userId else { return }
        profile = try? await client.roomMemberProfile(roomId: roomId, userId: me)
    }

    private func run(_ work: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do {
            try await work()
            CopyToast.shared.show(L10n.format("room.settings.general.myProfile.saved"))
            await load()
        } catch {
            onError(L10n.format("room.settings.general.myProfile.failed", error.localizedDescription))
        }
    }

    private func saveName(_ value: String) async {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        await run { try await client.setRoomNickname(roomId: roomId, displayname: trimmed.isEmpty ? nil : trimmed) }
    }

    private func setPhoto(_ item: PhotosPickerItem) async {
        defer { photo = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data),
              let jpeg = Self.squareJpeg(image) else { return }
        await run { try await client.setRoomMemberAvatar(roomId: roomId, data: jpeg, mimetype: "image/jpeg") }
    }

    private static func squareJpeg(_ image: UIImage) -> Data? {
        let pixelWidth = Int(image.size.width * image.scale)
        let pixelHeight = Int(image.size.height * image.scale)
        let crop = SquareCrop.of(width: pixelWidth, height: pixelHeight)
        guard let cg = image.cgImage?.cropping(to: CGRect(
            x: (pixelWidth - min(pixelWidth, pixelHeight)) / 2, y: (pixelHeight - min(pixelWidth, pixelHeight)) / 2,
            width: min(pixelWidth, pixelHeight), height: min(pixelWidth, pixelHeight))) else { return nil }
        let square = UIImage(cgImage: cg)
        let target = CGSize(width: crop.size, height: crop.size)
        return square.preparingThumbnail(of: target)?.jpegData(compressionQuality: 0.88)
    }
}
