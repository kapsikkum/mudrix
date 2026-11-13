import SwiftUI
import WizardChatCore

/// Settings > Cosmetics: the show-packs switch, the built-in set and the packs the account is subscribed to
struct CosmeticSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    @State private var profile = ExtendedProfile()
    @State private var packs: [CosmeticPack] = []
    @State private var loading = true
    @State private var supported = true
    @State private var pickingPacks = false
    @State private var error: String?

    var body: some View {
        SettingsPage(title: "settings.cosmetics.title") {
            SettingsSection(note: "settings.cosmetics.note") {
                ToggleRow(label: "settings.cosmetics.showPacks",
                          note: "settings.cosmetics.showPacksDescription",
                          isOn: $prefs.showCosmeticPacks)
                if !prefs.showCosmeticPacks {
                    Text(String(localized: "settings.cosmetics.packsOff"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
                if !supported {
                    Text(String(localized: "settings.account.extendedProfileUnsupported"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
            }

            ForEach(CosmeticKind.allCases) { kind in
                SettingsSection(title: LocalizedStringKey(kind.titleKey)) {
                    grid(title: String(localized: "profile.cosmetics.builtin")) {
                        tile(label: String(localized: "profile.decoration.none"), selected: current(kind) == nil) {
                            Task { await choose(kind, value: nil) }
                        } art: {
                            Image("ph-x-regular")
                                .font(.system(size: WZ.SizeIcon.lg))
                                .foregroundStyle(.secondary)
                        }
                        ForEach(builtins(for: kind), id: \.self) { id in
                            tile(label: CosmeticPacks.label(of: id, kind: kind),
                                 selected: CosmeticPacks.storedId(current(kind)) == id) {
                                Task { await choose(kind, value: .string(id)) }
                            } art: {
                                CosmeticBuiltinPreview(id: id, kind: kind)
                            }
                        }
                    }
                    if prefs.showCosmeticPacks {
                        if loading {
                            ProgressView().tint(theme.accent)
                        }
                        ForEach(Array(packs.enumerated()), id: \.offset) { _, pack in
                            let items = CosmeticPacks.items(of: pack, kind: kind)
                            if !items.isEmpty {
                                packGrid(pack, items: items)
                            }
                        }
                    }
                }
            }

            SettingsSection(note: "settings.cosmetics.hint") {
                if prefs.showCosmeticPacks {
                    Button { pickingPacks = true } label: {
                        Label(String(localized: "settings.emojisStickers.selectPacks"), image: "ph-star-regular")
                            .font(.wizard(WZ.FontSize.md, .semibold))
                            .foregroundStyle(theme.control)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
                if let error { StatusText(text: error) }
            }
        }
        .task(id: prefs.showCosmeticPacks) { await load() }
        .sheet(isPresented: $pickingPacks, onDismiss: { Task { await load() } }) {
            CosmeticPacksSheet()
        }
    }

    @ViewBuilder
    private func packGrid(_ pack: CosmeticPack, items: [CosmeticPackItem]) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(pack.roomId == nil ? String(localized: "profile.cosmetics.myUploads") : pack.displayName)
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
            grid {
                ForEach(items, id: \.shortcode) { item in
                    tile(label: item.name, selected: CosmeticPacks.storedId(current(item.kind)) == item.url) {
                        Task { await choose(item.kind, item: item) }
                    } art: {
                        CosmeticItemPreview(item: item)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func grid<Content: View>(title: String? = nil, @ViewBuilder content: () -> Content) -> some View {
        if let title {
            Text(title)
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: WZ.Space.space4)], spacing: WZ.Space.space4) {
            content()
        }
    }

    private func tile<Art: View>(label: String, selected: Bool, action: @escaping () -> Void,
                                 @ViewBuilder art: () -> Art) -> some View {
        Button(action: action) {
            VStack(spacing: WZ.Space.space2) {
                art()
                    .frame(width: 48, height: 48)
                    .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WZ.Radius.md, style: .continuous))
                Text(label)
                    .font(.wizard(WZ.FontSize.xs))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(1)
            }
            .padding(WZ.Space.space3)
            .frame(maxWidth: .infinity)
            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous)
                    .strokeBorder(selected ? theme.accent : .clear, lineWidth: WZ.BorderWidth.thick)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    private func builtins(for kind: CosmeticKind) -> [String] {
        switch kind {
        case .decoration: return CosmeticPacks.decorationIds
        case .effect: return CosmeticPacks.effectIds
        case .nameplate: return CosmeticPacks.nameplateIds
        case .profileFrame: return CosmeticPacks.frameIds
        }
    }

    private func current(_ kind: CosmeticKind) -> CosmeticValue? {
        switch kind {
        case .decoration: return profile.avatarDecoration
        case .effect: return profile.profileEffect
        case .nameplate: return profile.nameplate
        case .profileFrame: return profile.profileFrame
        }
    }

    private func keys(_ kind: CosmeticKind) -> [String] {
        switch kind {
        case .decoration: return ProfileFields.decorationKeys
        case .effect: return ProfileFields.effectKeys
        case .nameplate: return ProfileFields.nameplateKeys
        case .profileFrame: return ProfileFields.frameKeys
        }
    }

    private func parse(_ kind: CosmeticKind, _ value: JSONValue?) -> CosmeticValue? {
        switch kind {
        case .decoration: return CosmeticPacks.parseDecoration(value)
        case .effect: return CosmeticPacks.parseEffect(value)
        case .nameplate: return CosmeticPacks.parseNameplate(value)
        case .profileFrame: return CosmeticPacks.parseFrame(value)
        }
    }

    private func choose(_ kind: CosmeticKind, item: CosmeticPackItem) async {
        await choose(kind, value: CosmeticPacks.profileValue(of: item))
    }

    private func choose(_ kind: CosmeticKind, value: JSONValue?) async {
        guard supported else { return }
        error = nil
        do {
            try await session.writeProfileField(keys(kind), value)
            let parsed = parse(kind, value)
            switch kind {
            case .decoration: profile.avatarDecoration = parsed
            case .effect: profile.profileEffect = parsed
            case .nameplate: profile.nameplate = parsed
            case .profileFrame: profile.profileFrame = parsed
            }
            if let userId = session.userId { CosmeticCache.shared.forget(userId) }
        } catch {
            self.error = L10n.format("common.saveFailed", error.localizedDescription)
        }
    }

    private func load() async {
        error = nil
        loading = true
        if let userId = session.userId, let client = session.client {
            supported = ((try? await client.supportsExtendedProfiles()) ?? true)
            if let fields = try? await client.profileFields(userId: userId) {
                profile = ProfileFields.parse(fields)
            }
        }
        if prefs.showCosmeticPacks {
            packs = await CosmeticPackLibrary.subscribedPacks(session: session)
        } else {
            packs = []
        }
        loading = false
    }
}

/// One tile of a cosmetic kind
private struct CosmeticBuiltinPreview: View {
    let id: String
    let kind: CosmeticKind

    var body: some View {
        if kind == .nameplate {
            NameplateStrip(palette: CosmeticPacks.nameplatePalette(.id(id)), url: nil)
        } else {
            Image("ph-sparkle-regular")
                .font(.system(size: WZ.SizeIcon.lg))
                .foregroundStyle(.secondary)
        }
    }
}

/// The preview of one pack item, by its kind
private struct CosmeticItemPreview: View {
    let item: CosmeticPackItem

    var body: some View {
        switch item.kind {
        case .nameplate:
            NameplateStrip(palette: item.palette, url: item.url)
        case .profileFrame:
            if let centre = item.pieces.first(where: { $0.pos == "center" }) ?? item.pieces.first {
                CosmeticImage(url: centre.url)
            } else {
                CosmeticImage(url: item.url)
            }
        default:
            CosmeticImage(url: item.url)
        }
    }
}

/// A small nameplate: its art under its palette tint
private struct NameplateStrip: View {
    let palette: String?
    let url: String?

    var body: some View {
        let color = CosmeticPacks.paletteColor(palette)
        RoundedRectangle(cornerRadius: WZ.Radius.sm, style: .continuous)
            .fill(LinearGradient(colors: [color.opacity(0.25), color.opacity(0.75)], startPoint: .leading,
                                 endPoint: .trailing))
            .overlay {
                if let url { CosmeticImage(url: url, contentMode: .fill).clipped() }
            }
    }
}

/// Picks which cosmetic packs of the joined rooms the account is subscribed to
private struct CosmeticPacksSheet: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    @State private var packs: [CosmeticPack] = []
    @State private var subscribed: Set<CosmeticPackRef> = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if loading {
                    ProgressView().tint(theme.accent).frame(maxWidth: .infinity)
                } else if packs.isEmpty {
                    Text(String(localized: "settings.cosmetics.empty")).foregroundStyle(theme.textMuted)
                }
                ForEach(Array(packs.enumerated()), id: \.offset) { _, pack in
                    if let roomId = pack.roomId {
                        let ref = CosmeticPackRef(roomId: roomId, stateKey: pack.stateKey)
                        Button { Task { await toggle(ref) } } label: {
                            HStack(spacing: WZ.Space.space4) {
                                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                                    Text(pack.displayName).font(.wizard(WZ.FontSize.md, .medium))
                                        .foregroundStyle(theme.textPrimary)
                                    Text(L10n.format("room.settings.cosmetics.items", pack.items.count))
                                        .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                                }
                                Spacer()
                                Image(subscribed.contains(ref) ? "ph-check-circle-fill" : "ph-circle-regular")
                                    .foregroundStyle(subscribed.contains(ref) ? theme.accent : theme.textMuted)
                            }
                        }
                        .listRowBackground(theme.groupedRow)
                    }
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                        .listRowBackground(theme.groupedRow)
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
            .navigationTitle(String(localized: "settings.emojisStickers.selectPacks"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        loading = true
        packs = await CosmeticPackLibrary.availablePacks(session: session)
        subscribed = Set(CosmeticPacks.subscribedRefs(await CosmeticPackLibrary.subscriptions(session: session)))
        loading = false
    }

    private func toggle(_ ref: CosmeticPackRef) async {
        let on = !subscribed.contains(ref)
        do {
            try await CosmeticPackLibrary.setSubscribed(on, ref: ref, session: session)
            if on { subscribed.insert(ref) } else { subscribed.remove(ref) }
            error = nil
        } catch {
            self.error = L10n.format("common.saveFailed", error.localizedDescription)
        }
    }
}
