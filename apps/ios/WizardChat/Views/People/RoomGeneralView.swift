import SwiftUI
import WizardChatCore

/// The admin settings of a room: who may join, who may read its history, the spaces it is in and the upgrade (Android's `ui/people/RoomGeneral.kt`).
struct RoomGeneralView: View {
    let roomId: String
    /// Gets the new room after an upgrade, so the caller can open it
    var onUpgraded: ((String) -> Void)?

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var settings: RoomSettings?
    @State private var parents: [String] = []
    @State private var spaces: [SpaceSummary] = []
    @State private var manageable: Set<String> = []
    @State private var confirmUpgrade = false
    @State private var busy = false
    @State private var error: String?

    private var addableSpaces: [SpaceSummary] {
        spaces.filter { $0.id != roomId && !parents.contains($0.id) && manageable.contains($0.id) }
    }

    var body: some View {
        ThemedForm {
            if let settings {
                securitySection(settings)
                spacesSection
                upgradeSection(settings)
            } else {
                Section { ProgressView().tint(theme.accent) }
            }
            if let error {
                Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
            }
        }
        .tint(theme.control)
        .navigationTitle(String(localized: "room.settings.general.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .confirmationDialog(String(localized: "room.upgrade.title"), isPresented: $confirmUpgrade, titleVisibility: .visible) {
            Button(String(localized: "room.upgrade.title"), role: .destructive) {
                Task { await upgrade() }
            }
        } message: {
            Text(String(localized: "room.upgrade.confirm"))
        }
        .overlay(alignment: .top) { CopyToastView().padding(.top, WZ.Space.space2) }
    }

    private func accessBinding(_ settings: RoomSettings) -> Binding<RoomAccess> {
        Binding<RoomAccess>(get: { RoomAccess.of(settings.joinRule) },
                            set: { option in Task { await setAccess(option, settings: settings) } })
    }

    private func historyBinding(_ settings: RoomSettings) -> Binding<RoomHistory> {
        Binding<RoomHistory>(get: { RoomHistory(rawValue: settings.historyVisibility) ?? .shared },
                             set: { value in Task { await setHistory(value, settings: settings) } })
    }

    private var historyOptions: [(RoomHistory, LocalizedStringKey)] {
        RoomHistory.allCases.map { option in (option, LocalizedStringKey(option.labelKey)) }
    }

    @ViewBuilder
    private func securitySection(_ settings: RoomSettings) -> some View {
        Section {
            if can("m.room.join_rules", settings) {
                PickerRow<RoomAccess>(label: "room.settings.security.access",
                                      selection: accessBinding(settings),
                                      options: accessOptions(settings))
            }
            if can("m.room.history_visibility", settings) {
                PickerRow<RoomHistory>(label: "room.settings.security.messageHistory",
                                       note: "room.settings.security.historyNote",
                                       selection: historyBinding(settings),
                                       options: historyOptions)
            }
        } header: {
            Text(String(localized: "room.settings.security.title"))
        }
    }

    @ViewBuilder
    private func upgradeSection(_ settings: RoomSettings) -> some View {
        if can("m.room.tombstone", settings) {
            Section {
                Button { confirmUpgrade = true } label: {
                    Label(String(localized: "room.upgrade.title"), image: "ph-arrow-circle-up-regular")
                }
                .disabled(busy)
            } header: {
                Text(String(localized: "room.upgrade.title"))
            } footer: {
                Text(L10n.format("room.upgrade.currentVersion", settings.roomVersion))
            }
        }
    }

    /// Whether the person may send one kind of state event
    private func can(_ type: String, _ settings: RoomSettings) -> Bool {
        SpaceModern.canSendState(settings.powerLevels.object, creators: Set(settings.creators),
                                 userId: session.userId ?? "", type: type)
    }

    private func accessOptions(_ settings: RoomSettings) -> [(RoomAccess, LocalizedStringKey)] {
        let current = RoomAccess.of(settings.joinRule)
        return RoomAccess.allCases
            .filter { $0 != .spaceMembers || !parents.isEmpty || current == .spaceMembers }
            .map { ($0, LocalizedStringKey($0.labelKey(rule: settings.joinRule))) }
    }

    private func spaceName(_ spaceId: String) -> String {
        spaces.first(where: { $0.id == spaceId })?.name ?? spaceId
    }

    @ViewBuilder
    private var spacesSection: some View {
        Section {
            ForEach(parents, id: \.self) { spaceId in
                HStack(spacing: WZ.Space.space5) {
                    Label(spaceName(spaceId), image: "ph-stack-regular")
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if manageable.contains(spaceId) {
                        Button {
                            Task { await remove(from: spaceId) }
                        } label: {
                            Image("ph-x-regular")
                                .font(.system(size: WZ.SizeIcon.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "space.removeRoom"))
                    }
                }
            }
            if !addableSpaces.isEmpty {
                Menu {
                    ForEach(addableSpaces) { space in
                        Button(space.name) { Task { await addToSpace(space) } }
                    }
                } label: {
                    Label(String(localized: "room.settings.spaces.addLabel"), image: "ph-plus-regular")
                }
                .disabled(busy)
            }
        } header: {
            Text(String(localized: "room.settings.spaces.title"))
        } footer: {
            Text(parents.isEmpty ? String(localized: "room.settings.spaces.none") : "")
        }
    }

    private func load() async {
        settings = try? await session.requireClient.roomSettings(roomId: roomId)
        let list = session.roomList
        spaces = list?.spaces ?? []
        parents = (list?.graph ?? [])
            .filter { node in node.children.contains { $0.roomId == roomId } }
            .map(\.spaceId)
        var allowed = Set<String>()
        for space in spaces {
            if await session.canSendState("m.space.child", in: space.id) { allowed.insert(space.id) }
        }
        manageable = allowed
    }

    private func setAccess(_ option: RoomAccess, settings: RoomSettings) async {
        guard let rule = option.rule(current: RoomAccess.of(settings.joinRule)) else { return }
        await save("common.saveFailed") {
            try await session.requireClient.setJoinRule(roomId: roomId, rule: rule,
                                                        allowedSpaces: option == .spaceMembers ? Array(parents.prefix(1)) : [])
        }
    }

    private func setHistory(_ value: RoomHistory, settings: RoomSettings) async {
        guard value.rawValue != settings.historyVisibility else { return }
        await save("common.saveFailed") {
            try await session.requireClient.setHistoryVisibility(roomId: roomId, visibility: value.rawValue)
        }
    }

    private func addToSpace(_ space: SpaceSummary) async {
        busy = true
        defer { busy = false }
        do {
            try await session.requireClient.addToSpace(spaceId: space.id, childId: roomId, suggested: false)
            if !parents.contains(space.id) { parents.append(space.id) }
            error = nil
            session.roomList?.refreshGraph()
        } catch {
            self.error = L10n.format("space.addExistingRoomFailed", error.localizedDescription)
        }
    }

    private func remove(from spaceId: String) async {
        busy = true
        defer { busy = false }
        do {
            try await session.requireClient.removeFromSpace(spaceId: spaceId, childId: roomId)
            parents.removeAll { $0 == spaceId }
            error = nil
            session.roomList?.refreshGraph()
        } catch {
            self.error = L10n.format("space.removeFailed", error.localizedDescription)
        }
    }

    /// Saves a settings change and reads the room back, as Android's screen does
    private func save(_ failedKey: String, _ work: @escaping () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do {
            try await work()
            error = nil
            settings = try? await session.requireClient.roomSettings(roomId: roomId)
        } catch {
            self.error = L10n.format(failedKey, error.localizedDescription)
        }
    }

    /// Moves the room to the server's default version, bringing people and spaces over
    private func upgrade() async {
        guard let settings else { return }
        busy = true
        defer { busy = false }
        do {
            let client = try session.requireClient
            let version = try await client.serverCapabilities().defaultRoomVersion
            let newRoom = try await client.upgradeRoom(roomId: roomId, version: version)
            if RoomUpgrade.invitesMembers(joinRule: settings.joinRule) {
                let members = (try? await client.members(roomId: roomId)) ?? []
                for member in members where !member.isInvite && member.userId != session.userId {
                    try? await client.invite(roomId: newRoom, userId: member.userId)
                }
            }
            for space in parents {
                try? await client.addToSpace(spaceId: space, childId: newRoom, suggested: false)
            }
            session.roomList?.refreshGraph()
            if let onUpgraded {
                onUpgraded(newRoom)
            } else {
                dismiss()
            }
        } catch {
            self.error = L10n.format("room.upgrade.failed", error.localizedDescription)
        }
    }
}
