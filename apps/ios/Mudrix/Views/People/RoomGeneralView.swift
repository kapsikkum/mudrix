import SwiftUI
import MudrixCore

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
    @State private var newAlias = ""
    @State private var soundboardSettings: RoomSoundboards.Settings?

    private var addableSpaces: [SpaceSummary] {
        spaces.filter { $0.id != roomId && !parents.contains($0.id) && manageable.contains($0.id) }
    }

    var body: some View {
        ThemedForm {
            if let settings {
                securitySection(settings)
                addressesSection(settings)
                soundboardSection(settings)
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
            Toggle(isOn: publishedBinding(settings)) {
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(String(localized: "mobile.publish.title", defaultValue: "Publish to the room directory"))
                    Text(String(localized: "mobile.publish.note", defaultValue: "Anyone can find this room in your homeserver's public directory."))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .disabled(busy)
        } header: {
            Text(String(localized: "room.settings.security.title"))
        }
    }

    private func publishedBinding(_ settings: RoomSettings) -> Binding<Bool> {
        Binding(get: { settings.published },
                set: { value in
                    guard !busy else { return }
                    Task { await save("common.saveFailed") {
                        try await session.requireClient.setPublished(roomId: roomId, published: value)
                    } }
                })
    }

    /// The room's addresses: the main one, the others with make-main and remove, and a field to add one. Adding
    /// also lists it as an alternative address, as the web does.
    @ViewBuilder
    private func addressesSection(_ settings: RoomSettings) -> some View {
        let canonical = settings.canonicalAlias.flatMap { $0.isEmpty ? nil : $0 }
        let others = RoomAddresses.others(canonical: canonical, alt: settings.altAliases, local: settings.localAliases)
        let canEdit = can("m.room.canonical_alias", settings)
        Section {
            if canonical == nil && others.isEmpty {
                Text(String(localized: "room.settings.addresses.noAddresses"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
            }
            if let canonical {
                HStack {
                    Text(verbatim: canonical).font(.system(size: WZ.SizeIcon.sm, design: .monospaced)).lineLimit(1)
                    Spacer(minLength: 0)
                    Text(String(localized: "room.settings.addresses.mainAddress"))
                        .font(.wizard(WZ.FontSize.xs, .semibold))
                        .foregroundStyle(theme.accent)
                }
            }
            ForEach(others, id: \.self) { alias in
                HStack(spacing: WZ.Space.space5) {
                    Text(verbatim: alias).font(.system(size: WZ.SizeIcon.sm, design: .monospaced)).lineLimit(1)
                    Spacer(minLength: 0)
                    if canEdit {
                        Button {
                            let next = RoomAddresses.afterSetMain(canonical: canonical, alt: settings.altAliases, alias: alias)
                            Task { await save("common.saveFailed") {
                                try await session.requireClient.setCanonicalAlias(roomId: roomId, alias: next.main, altAliases: next.alt)
                            } }
                        } label: {
                            Image("ph-check-bold").font(.system(size: WZ.SizeIcon.sm)).minTouchTarget()
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "room.settings.addresses.mainAddress"))
                        Button {
                            Task { await removeAddress(alias, canonical: canonical, settings: settings) }
                        } label: {
                            Image("ph-x-regular").font(.system(size: WZ.SizeIcon.sm)).foregroundStyle(theme.danger).minTouchTarget()
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "common.remove"))
                    }
                }
            }
            if canEdit {
                TextField(String(localized: "room.settings.addresses.addressPlaceholder"), text: $newAlias)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Button { Task { await addAddress(canonical: canonical, settings: settings) } } label: {
                    Label(String(localized: "room.settings.addresses.addAddress"), image: "ph-plus-regular")
                }
                .disabled(busy || newAlias.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        } header: {
            Text(String(localized: "room.settings.addresses.title"))
        }
    }

    private func addAddress(canonical: String?, settings: RoomSettings) async {
        let alias = newAlias.trimmingCharacters(in: .whitespaces)
        guard RoomAddresses.isValid(alias) else {
            error = L10n.format("room.settings.addresses.invalidFormat")
            return
        }
        busy = true
        defer { busy = false }
        do {
            let client = try session.requireClient
            try await client.addRoomAlias(roomId: roomId, alias: alias)
            if alias != canonical && !settings.altAliases.contains(alias) {
                try await client.setCanonicalAlias(
                    roomId: roomId, alias: canonical,
                    altAliases: RoomAddresses.altAfterAdd(canonical: canonical, alt: settings.altAliases, alias: alias))
            }
            newAlias = ""
            error = nil
            self.settings = try? await client.roomSettings(roomId: roomId)
        } catch {
            self.error = error.localizedDescription.localizedCaseInsensitiveContains("already in use")
                ? L10n.format("room.settings.addresses.aliasInUse")
                : L10n.format("room.settings.addresses.invalidFormat")
        }
    }

    private func removeAddress(_ alias: String, canonical: String?, settings: RoomSettings) async {
        await save("common.saveFailed") {
            let client = try session.requireClient
            try await client.removeRoomAlias(alias: alias)
            if alias == canonical || settings.altAliases.contains(alias) {
                let next = RoomAddresses.afterRemove(canonical: canonical, alt: settings.altAliases, alias: alias)
                try await client.setCanonicalAlias(roomId: roomId, alias: next.main, altAliases: next.alt)
            }
        }
    }
    /// The call soundboard in this room or space: on or off, and who may play (the web's soundboard settings)
    @ViewBuilder
    private func soundboardSection(_ settings: RoomSettings) -> some View {
        if can(RoomSoundboards.settingsType, settings), let board = soundboardSettings {
            Section {
                Toggle(isOn: Binding(get: { board.enabled },
                                     set: { value in Task { await saveSoundboard(enabled: value, level: board.minPowerLevel) } })) {
                    VStack(alignment: .leading, spacing: WZ.Space.space1) {
                        Text(String(localized: "soundboard.room.enabled"))
                        Text(String(localized: "soundboard.room.enabledNote"))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                .disabled(busy)
                if board.enabled {
                    PickerRow<Double>(label: "soundboard.room.whoCanPlay", note: "soundboard.room.whoCanPlayNote",
                                      selection: Binding(
                                        get: { board.minPowerLevel >= SoundboardEdit.moderatorLevel ? SoundboardEdit.moderatorLevel : 0 },
                                        set: { level in Task { await saveSoundboard(enabled: true, level: level) } }),
                                      options: [(0, "soundboard.room.everyone"), (SoundboardEdit.moderatorLevel, "soundboard.room.moderators")])
                }
            } header: {
                Text(String(localized: "soundboard.room.title"))
            }
        }
    }

    private func saveSoundboard(enabled: Bool, level: Double) async {
        await save("common.saveFailed") {
            try await SoundboardEdit.writeRoomSettings(client: session.requireClient, roomId: roomId, enabled: enabled,
                                                       minPowerLevel: level)
            soundboardSettings = RoomSoundboards.Settings(enabled: enabled, minPowerLevel: level)
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
        if let client = session.client {
            let stored = await RoomSoundboards.load(client: client, roomId: roomId, force: true).settings
            soundboardSettings = stored ?? RoomSoundboards.Settings(enabled: true, minPowerLevel: 0)
        }
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
