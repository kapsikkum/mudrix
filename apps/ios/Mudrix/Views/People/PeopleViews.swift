import MudrixCore
import SwiftUI

@MainActor
func openRoom(_ roomId: String, notifier: MessageNotifier) {
    notifier.roomToOpen = roomId
}

struct MembersView: View {
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var members: [Member] = []
    @State private var loaded = false
    @State private var search = ""
    @State private var selected: String?
    @State private var showInvite = false
    @State private var canInvite = false
    @State private var canKick = false
    @State private var knockers: [MemberEntry] = []
    @State private var knockError: String?
    @StateObject private var roleManager = SpaceRoleManager()

    private struct Group: Identifiable {
        let id: String
        let title: LocalizedStringKey
        let members: [Member]
    }

    private var groups: [Group] {
        let filtered = search.isEmpty ? members : members.filter {
            ($0.displayName ?? "").localizedCaseInsensitiveContains(search) || $0.userId.localizedCaseInsensitiveContains(search)
        }
        let joined = filtered.filter { !$0.isInvite }
        func role(_ member: Member) -> Int {
            member.level >= 100 ? 0 : member.level >= 50 ? 1 : 2
        }
        let sorted = { (list: [Member]) in
            list.sorted { ($0.displayName ?? $0.userId).localizedCaseInsensitiveCompare($1.displayName ?? $1.userId) == .orderedAscending }
        }
        return [
            Group(id: "admins", title: "room.members.admins", members: sorted(joined.filter { role($0) == 0 })),
            Group(id: "mods", title: "room.members.moderators", members: sorted(joined.filter { role($0) == 1 })),
            Group(id: "members", title: "common.members", members: sorted(joined.filter { role($0) == 2 })),
            Group(id: "invited", title: "room.members.invited", members: sorted(filtered.filter(\.isInvite))),
        ].filter { !$0.members.isEmpty }
    }

    var body: some View {
        ThemedList {
            if canInvite {
                Button { showInvite = true } label: {
                    Label(String(localized: "room.members.invite"), image: "ph-user-plus-regular").foregroundStyle(theme.control)
                }
            }
            if !knockers.isEmpty {
                Section {
                    ForEach(knockers, id: \.userId) { knocker in
                        HStack(spacing: WZ.Space.space5) {
                            AvatarView(name: knocker.displayName ?? knocker.userId, url: knocker.avatarUrl, size: WZ.SizeAvatar.md)
                            Text(knocker.displayName ?? knocker.userId)
                                .font(.wizard(WZ.FontSize.lg, .medium))
                                .foregroundStyle(theme.textPrimary)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            if RoomModeration.answersKnock(accept: false, canInvite: canInvite, canKick: canKick) {
                                Button { Task { await answer(knocker, accept: false) } } label: {
                                    Image("ph-x-circle-regular")
                                        .font(.system(size: WZ.SizeIcon.md))
                                        .foregroundStyle(theme.danger)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(String(localized: "room.members.reject"))
                            }
                            if RoomModeration.answersKnock(accept: true, canInvite: canInvite, canKick: canKick) {
                                Button { Task { await answer(knocker, accept: true) } } label: {
                                    Image("ph-check-bold")
                                        .font(.system(size: WZ.SizeIcon.md))
                                        .foregroundStyle(theme.accent)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(String(localized: "common.accept"))
                            }
                        }
                    }
                    if let knockError {
                        Text(knockError).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                    }
                } header: {
                    Text("room.members.pending") + Text("  \(knockers.count)").foregroundStyle(theme.textMuted.opacity(0.7))
                }
            }
            ForEach(groups) { group in
                Section {
                    ForEach(group.members, id: \.userId) { member in
                        Button { selected = member.userId } label: { MemberRow(member: member) }
                            .buttonStyle(.plain)
                            .memberRolesMenu(roleManager, spaceId: roomId, member: member)
                    }
                } header: {
                    Text(group.title) + Text("  \(group.members.count)").foregroundStyle(theme.textMuted.opacity(0.7))
                }
            }
        }
        .overlay { if !loaded { ProgressView().tint(theme.accent) } }
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: String(localized: "room.settings.members.searchMembers"))
        .navigationTitle(String(localized: "common.members"))
        .navigationBarTitleDisplayMode(.inline)
        .roomRoles(for: roomId)
        .spaceRoleManager(roleManager, spaceId: roomId)
        .task { await load() }
        .sheet(item: Binding(get: { selected.map(IdentifiedString.init) }, set: { selected = $0?.id })) { item in
            UserProfileSheet(userId: item.id, roomId: roomId) { Task { await load() } }
        }
        .sheet(isPresented: $showInvite) {
            UserPickerView(mode: .invite(roomId)) { Task { await load() } }
        }
    }

    private func load() async {
        guard let client = session.client else { return }
        MemberDirectory.shared.forget(roomId: roomId)
        members = (try? await client.members(roomId: roomId)) ?? []
        let permissions = (try? await client.roomDetails(roomId: roomId))?.permissions
        canInvite = permissions?.invite ?? false
        canKick = permissions?.kick ?? false
        knockers = RoomModeration.showsKnocks(canInvite: canInvite, canKick: canKick)
            ? ((try? await client.membersInState(roomId: roomId, membership: "knock")) ?? [])
            : []
        loaded = true
    }

    private func answer(_ knocker: MemberEntry, accept: Bool) async {
        guard let client = session.client else { return }
        do {
            if accept {
                try await client.acceptKnock(roomId: roomId, userId: knocker.userId)
            } else {
                try await client.rejectKnock(roomId: roomId, userId: knocker.userId)
            }
            knockError = nil
            await load()
        } catch {
            knockError = accept ? error.localizedDescription
                : L10n.format("room.members.rejectFailed", error.localizedDescription)
        }
    }
}

struct IdentifiedString: Identifiable, Hashable { let id: String }

private struct MemberRow: View {
    let member: Member
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @Environment(\.roomRoles) private var roomRoles
    @State private var presence: Presence?
    @State private var statusMode: StatusMode?

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            CosmeticAvatar(userId: member.userId, name: member.displayName ?? member.userId,
                           url: member.avatarUrl, size: WZ.SizeAvatar.md,
                           presence: presence, presenceRingColor: theme.groupedRow,
                           dot: StatusFields.dot(presence, mode: statusMode))
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                CosmeticName(userId: member.userId) {
                    Text(member.displayName ?? member.userId)
                        .font(.wizard(WZ.FontSize.lg, .medium))
                        .foregroundStyle(roomRoles.color(of: member.userId) ?? theme.textPrimary)
                }
                if member.displayName != nil {
                    Text(member.userId).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                }
            }
            .lineLimit(1)
            Spacer()
            RoleBadge(level: member.level)
        }
        .contentShape(Rectangle())
        .task(id: "\(member.userId)|\(prefs.showPresence)") {
            guard prefs.showPresence, let client = session.client else {
                presence = nil
                statusMode = nil
                return
            }
            if let cached = PresenceCache.shared.cached(member.userId) {
                presence = cached
            } else {
                presence = await session.presence(of: member.userId)
            }
            statusMode = await StatusFields.read(client: client, userId: member.userId)
        }
    }
}

/// The member's role, tinted in its colour as on the web
struct RoleBadge: View {
    let level: Int64
    @Environment(\.theme) private var theme

    private var role: (text: LocalizedStringKey, color: Color) {
        switch level {
        case .max: ("room.members.founder", theme.roleFounder)
        case 100...: ("room.members.admin", theme.roleAdmin)
        case 50..<100: ("room.members.moderator", theme.roleModerator)
        default: ("room.members.member", theme.roleMember)
        }
    }

    var body: some View {
        Text(role.text)
            .font(.wizard(WZ.FontSize.xs, .semibold))
            .foregroundStyle(role.color)
            .padding(.horizontal, WZ.Space.space3)
            .padding(.vertical, WZ.Space.space1)
            .background(role.color.opacity(0.15), in: Capsule())
    }
}

struct UserProfileSheet: View {
    let userId: String
    var roomId: String?
    var onChange: (() -> Void)?
    /// Shown on your own profile, to open Settings from it
    var onOpenSettings: (() -> Void)?
    /// Presented full screen rather than as a sheet: it keeps a navigation bar with Done, a sheet closes by swipe
    var fullScreen = false

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?
    @State private var statusText: String?
    @State private var extended = ExtendedProfile()
    @State private var software: HomeserverSoftware?
    @State private var rights = RoleRights(ownLevel: 0, canEditLevels: false)
    @State private var level: Int64 = 0
    @State private var isMember = false
    @State private var canKick = false
    @State private var canBan = false
    @State private var confirm: Action?
    @State private var reason = ""
    @State private var busy = false
    @State private var error: String?
    @State private var tab: ProfileTab = .details
    @State private var mutual: MutualRooms?

    enum Action: Identifiable { case kick, ban, ignore; var id: Self { self } }

    /// The parts of a profile the sheet shows, as the web's full profile and Android's profile card split them
    enum ProfileTab: String, CaseIterable, Hashable {
        case details, activity, mutual

        var titleKey: String {
            switch self {
            case .details: return "profile.tabs.details"
            case .activity: return "profile.tabs.activity"
            case .mutual: return "profile.tabs.mutualRooms"
            }
        }
    }

    /// The Details / Activity / Mutual Rooms strip under the header
    private var profileTabs: some View {
        HStack(spacing: WZ.Space.space1) {
            ForEach(ProfileTab.allCases, id: \.self) { option in tabButton(option) }
        }
        .padding(WZ.Space.space1)
        .background(theme.fill, in: Capsule())
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: WZ.Space.space2, leading: WZ.Space.space6,
                                  bottom: WZ.Space.space3, trailing: WZ.Space.space6))
    }

    /// One tab; the Mutual Rooms one carries the same count as the header line (rooms plus spaces)
    private func tabButton(_ option: ProfileTab) -> some View {
        let isActive = tab == option
        let count = option == .mutual ? (mutual?.total ?? 0) : 0
        return Button {
            tab = option
        } label: {
            HStack(spacing: WZ.Space.space3) {
                Text(String(localized: String.LocalizationValue(option.titleKey)))
                    .font(.wizard(WZ.FontSize.sm, isActive ? .semibold : .regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if count > 0 {
                    Text(count > 99 ? "99+" : "\(count)")
                        .font(.wizard(WZ.FontSize.xs, .bold))
                        .foregroundStyle(theme.textOnAccent)
                        .padding(.horizontal, WZ.Space.space3)
                        .background(isActive ? theme.accent : theme.textMuted, in: Capsule())
                }
            }
            .foregroundStyle(isActive ? theme.textPrimary : theme.textMuted)
            .frame(maxWidth: .infinity)
            .frame(height: WZ.Space.space10)
            .background(isActive ? theme.bgTertiary : .clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    /// The line under the name: how many rooms and spaces are shared, or that there are none; nothing while unknown
    private var mutualLine: String? {
        guard let mutual else { return nil }
        return mutual.isEmpty
            ? String(localized: "profile.mutualEmpty")
            : L10n.plural("profile.mutualRooms", count: mutual.total, mutual.total)
    }

    private func pillLabel(_ title: String) -> some View {
        Text(title)
            .font(.wizard(WZ.FontSize.md, .semibold))
            .foregroundStyle(theme.textPrimary)
            .frame(maxWidth: .infinity)
            .frame(height: WZ.Space.space10)
            .background(theme.bgTertiary, in: Capsule())
            .contentShape(Capsule())
    }

    /// The "..." button over the banner: copying the ID and the link, then the moderation actions
    private var profileMenu: some View {
        Menu {
            Button { UIPasteboard.general.string = userId } label: {
                Label(menu: String(localized: "profile.copyId"), icon: "ph-copy-regular")
            }
            Button { UIPasteboard.general.string = "https://matrix.to/#/\(userId)" } label: {
                Label(menu: String(localized: "common.copyLink"), icon: "ph-link-simple-regular")
            }
            if !isMe {
                Divider()
                if canKick {
                    Button(role: .destructive) { confirm = .kick } label: {
                        Label(menu: String(localized: "profile.kick"), icon: "ph-user-minus-regular", destructive: true)
                    }
                }
                if canBan {
                    Button(role: .destructive) { confirm = .ban } label: {
                        Label(menu: String(localized: "room.members.ban"), icon: "ph-prohibit-regular", destructive: true)
                    }
                }
                Button(role: .destructive) { confirm = .ignore } label: {
                    Label(menu: String(localized: "profile.ignoreUser"), icon: "ph-eye-slash-regular", destructive: true)
                }
            }
        } label: {
            Image("ph-dots-three-bold")
                .foregroundStyle(theme.textPrimary)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .background(theme.bgPrimary.opacity(0.6), in: Circle())
                .contentShape(Circle())
        }
        .accessibilityLabel(String(localized: "common.more"))
    }

    /// Name, handle, role, status, mutual rooms and the main buttons, on the plain sheet surface under the banner
    private var identity: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(name ?? userId)
                .font(.wizard(WZ.FontSize.xxl, .bold))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(2)
            HStack(spacing: WZ.Space.space3) {
                Text(userId)
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                    .lineLimit(1)
                    .textSelection(.enabled)
                if isMember { RoleBadge(level: level) }
            }
            if let statusText {
                Text(statusText)
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textSecondary)
            }
            ProfileBadges(isMudrixUser: extended.isMudrixUser, software: software)
            if let mutualLine {
                Button { tab = .mutual } label: {
                    Text(mutualLine)
                        .font(.wizard(WZ.FontSize.md, .medium))
                        .foregroundStyle(theme.accent)
                }
                .buttonStyle(.plain)
            }
            if !isMe {
                Button { Task { await message() } } label: { pillLabel(String(localized: "profile.message")) }
                    .buttonStyle(.plain)
                    .disabled(busy)
            }
            if isMe, let onOpenSettings {
                Button(action: onOpenSettings) { pillLabel(String(localized: "common.settings")) }
                    .buttonStyle(.plain)
            }
            ProfileAboutView(profile: extended)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, WZ.Space.space6)
        .padding(.top, WZ.Space.space3)
        .padding(.bottom, WZ.Space.space4)
    }

    private var isMe: Bool { userId == session.userId }

    var body: some View {
        NavigationStack {
            ThemedList {
                Section {
                    VStack(spacing: 0) {
                        ProfileBannerHeader(
                            userId: userId, name: name ?? userId, avatarUrl: avatarUrl, accent: extended.accent,
                            decoration: CosmeticPacks.resolve(extended.avatarDecoration, showPacks: prefs.showCosmeticPacks),
                            profileFrame: CosmeticPacks.resolve(extended.profileFrame, showPacks: prefs.showCosmeticPacks),
                            effect: CosmeticPacks.resolve(extended.profileEffect, showPacks: prefs.showCosmeticPacks)
                        ) { profileMenu }
                        identity
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
                profileTabs
                switch tab {
                case .details:
                    if !isMe { ProfileNoteSection(userId: userId) }
                    if !isMe { ProfileVerificationSection(userId: userId) }
                    if let roomId, isMember, rights.canChange(targetLevel: level, isSelf: isMe) {
                        Section {
                            RoleMenu(roomId: roomId, userId: userId, currentLevel: level, rights: rights) {
                                Task { await load(); onChange?() }
                            }
                        }
                    }
                case .activity:
                    ProfileActivityCards(profile: extended)
                case .mutual:
                    if !isMe {
                        MutualRoomsSection(
                            mutual: mutual,
                            onOpenRoom: { roomId in
                                dismiss()
                                openRoom(roomId, notifier: notifier)
                            },
                            onOpenSpace: { spaceId in
                                dismiss()
                                notifier.spaceToOpen = spaceId
                            })
                    }
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .contentMargins(.top, 0, for: .scrollContent)
            .tint(theme.control)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(fullScreen ? .visible : .hidden, for: .navigationBar)
            .toolbar {
                if fullScreen {
                    ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
                }
            }
            .alert(alertTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }),
                   presenting: confirm) { action in
                if action != .ignore { TextField(String(localized: "common.reasonOptional"), text: $reason) }
                Button(actionTitle(action), role: .destructive) { Task { await perform(action) } }
                Button(String(localized: "common.cancel"), role: .cancel) {}
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task { await load() }
        .task(id: userId) { await loadMutual() }
        .task(id: "\(userId)|\(prefs.showHomeserverSoftware)") { await loadSoftware() }
    }

    private func loadMutual() async {
        mutual = nil
        guard !isMe, let client = session.client else { return }
        mutual = await MutualRoomsLookup.load(client: client, userId: userId)
    }

    private func loadSoftware() async {
        software = nil
        let server = ProfileFields.serverName(of: userId)
        guard prefs.showHomeserverSoftware, !server.isEmpty, let client = session.client else { return }
        software = (try? await client.homeserverSoftware(serverName: server)) ?? nil
    }

    private var alertTitle: String {
        let who = name ?? userId
        switch confirm {
        case .kick: return L10n.format("room.members.removeConfirm", "\(who)")
        case .ban: return L10n.format("room.members.banConfirm", "\(who)")
        case .ignore: return L10n.format("room.members.ignoreConfirm", "\(who)")
        case nil: return ""
        }
    }

    private func actionTitle(_ action: Action) -> LocalizedStringKey {
        switch action {
        case .kick: return "common.remove"
        case .ban: return "room.members.ban"
        case .ignore: return "profile.ignoreUser"
        }
    }

    private func load() async {
        if let roomId, let client = session.client,
           let member = (try? await client.members(roomId: roomId))?.first(where: { $0.userId == userId }) {
            name = member.displayName
            avatarUrl = member.avatarUrl
            level = member.level
            isMember = true
            rights = await RoleRights.load(client: client, roomId: roomId)
            if !isMe, let permissions = (try? await client.roomDetails(roomId: roomId))?.permissions {
                canKick = permissions.kick && level < rights.ownLevel
                canBan = permissions.ban && level < rights.ownLevel
            }
        }
        // The whole profile in one request; a server without extended profiles just has nothing extra
        if let client = session.client, let fields = try? await client.profileFields(userId: userId) {
            extended = ProfileFields.parse(fields)
        }
        if let profile = await session.profile(of: userId) {
            name = name ?? profile.displayName
            avatarUrl = avatarUrl ?? profile.avatarUrl
            let expired = profile.customStatus?.expiresAt.map { Double($0) / 1000 < Date.now.timeIntervalSince1970 } ?? false
            statusText = expired ? nil : profile.customStatus?.text
        }
    }

    private func message() async {
        busy = true
        defer { busy = false }
        do {
            let roomId = try await session.startDirectMessage(with: userId)
            dismiss()
            openRoom(roomId, notifier: notifier)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func perform(_ action: Action) async {
        let reason = reason.isEmpty ? nil : reason
        self.reason = ""
        do {
            switch action {
            case .kick: if let roomId { try await session.requireClient.kick(roomId: roomId, userId: userId, reason: reason) }
            case .ban: if let roomId { try await session.requireClient.ban(roomId: roomId, userId: userId, reason: reason) }
            case .ignore: try await session.ignore(userId)
            }
            onChange?()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct UserPickerView: View {
    enum Mode {
        case invite(String)
        case directMessage
        case select(title: String, exclude: [String], onSelect: ([UserResult]) -> Void)
    }

    let mode: Mode
    var onDone: (() -> Void)?

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var query = ""
    @State private var results: [UserResult] = []
    @State private var selected: [UserResult] = []
    @State private var searching = false
    @State private var busy = false
    @State private var error: String?

    private var isInvite: Bool {
        switch mode {
        case .invite, .select: true
        case .directMessage: false
        }
    }

    private var excluded: Set<String> {
        if case .select(_, let exclude, _) = mode { return Set(exclude) }
        return []
    }

    private var title: String {
        switch mode {
        case .invite: String(localized: "room.members.invite")
        case .directMessage: String(localized: "common.newDm")
        case .select(let title, _, _): title
        }
    }

    private var typedId: UserResult? {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("@"), trimmed.contains(":"), !results.contains(where: { $0.userId == trimmed })
        else { return nil }
        return UserResult(userId: trimmed, displayName: nil, avatarUrl: nil)
    }

    var body: some View {
        NavigationStack {
            ThemedList {
                if !selected.isEmpty {
                    Section {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: WZ.Space.space4) {
                                ForEach(selected, id: \.userId) { user in
                                    Button { toggle(user) } label: {
                                        HStack(spacing: WZ.Space.space3) {
                                            AvatarView(name: user.displayName ?? user.userId, url: user.avatarUrl, size: WZ.SizeAvatar.xs)
                                            Text(user.displayName ?? user.userId).font(.wizard(WZ.FontSize.md, .medium))
                                            Image("ph-x-regular").font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                                        }
                                        .foregroundStyle(theme.textPrimary)
                                        .padding(.leading, WZ.Space.space2).padding(.trailing, WZ.Space.space4).padding(.vertical, WZ.Space.space2)
                                        .background(theme.fill, in: Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                Section {
                    ForEach((([typedId].compactMap { $0 }) + results).filter { !excluded.contains($0.userId) }, id: \.userId) { user in
                        Button { pick(user) } label: {
                            HStack(spacing: WZ.Space.space5) {
                                AvatarView(name: user.displayName ?? user.userId, url: user.avatarUrl, size: WZ.SizeAvatar.md)
                                VStack(alignment: .leading, spacing: WZ.Space.space0) {
                                    Text(user.displayName ?? user.userId)
                                        .font(.wizard(WZ.FontSize.lg, .medium)).foregroundStyle(theme.textPrimary)
                                    if user.displayName != nil {
                                        Text(user.userId).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                                    }
                                }
                                .lineLimit(1)
                                Spacer()
                                if isInvite {
                                    Image(selected.contains { $0.userId == user.userId }
                                          ? "ph-check-circle-fill" : "ph-circle-regular")
                                        .foregroundStyle(theme.accent)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(busy)
                    }
                } footer: {
                    if query.isEmpty {
                        Text(String(localized: "room.members.searchHint"))
                    } else if results.isEmpty && typedId == nil && !searching {
                        Text(String(localized: "room.members.noOneFound"))
                    }
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: String(localized: "room.members.searchPlaceholder"))
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .task(id: query) {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                searching = true
                results = await session.searchUsers(query).filter { $0.userId != session.userId }
                searching = false
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
                if case .select(_, _, let onSelect) = mode {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.add")) {
                            onSelect(selected)
                            dismiss()
                        }
                        .disabled(selected.isEmpty)
                    }
                } else if isInvite {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.invite")) { Task { await invite() } }
                            .disabled(selected.isEmpty || busy)
                    }
                }
            }
            .tint(theme.control)
        }
    }

    private func toggle(_ user: UserResult) {
        if let index = selected.firstIndex(where: { $0.userId == user.userId }) {
            selected.remove(at: index)
        } else {
            selected.append(user)
        }
    }

    private func pick(_ user: UserResult) {
        if isInvite { toggle(user); return }
        Task {
            busy = true
            defer { busy = false }
            do {
                let roomId = try await session.startDirectMessage(with: user.userId)
                dismiss()
                openRoom(roomId, notifier: notifier)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func invite() async {
        guard case .invite(let roomId) = mode, let client = session.client else { return }
        busy = true
        defer { busy = false }
        var failed: [String] = []
        for user in selected {
            do { try await client.invite(roomId: roomId, userId: user.userId) } catch { failed.append(user.userId) }
        }
        onDone?()
        if failed.isEmpty {
            dismiss()
        } else {
            error = L10n.format("invite.inviteFailed", failed.joined(separator: ", "))
            selected.removeAll { !failed.contains($0.userId) }
        }
    }
}
