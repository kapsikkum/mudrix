import SwiftUI
import WizardChatCore

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
