import SwiftUI
import WizardChatCore

/// The banner on top of a Modern space: an uploaded picture or one of the gradient presets
struct SpaceBannerView: View {
    let banner: SpaceModern.Banner
    let name: String

    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var image: UIImage?

    private var colors: [Color] {
        guard let preset = SpaceModern.bannerPresets.first(where: { $0.id == banner.color }) else {
            return [theme.accent, theme.accent.opacity(0.6)]
        }
        return [Color(hex: preset.from), Color(hex: preset.to)]
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            }
            LinearGradient(colors: [.clear, .black.opacity(0.45)], startPoint: .center, endPoint: .bottom)
            Text(name)
                .font(.wizard(WZ.FontSize.lg, .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .padding(WZ.Space.space5)
        }
        .frame(height: 112)
        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(name)
        .task(id: banner.url) {
            guard let url = banner.url, let mediaLoader else {
                image = nil
                return
            }
            image = mediaLoader.cachedThumbnail(url)
            if image == nil { image = await mediaLoader.thumbnail(url, size: 720) }
        }
    }
}

/// One category of a Modern space: its header (the sub-space's name, none for the space's own rooms) and its rows
struct ModernCategory: Identifiable {
    let id: String
    let title: String?
    let rooms: [RoomSummary]
}

extension RoomListModel {
    /// The categories of a Modern space as the list draws them: text channels first, voice channels below, empty
    /// categories kept. `isVoice` also counts rooms flagged as voice channels in their state.
    func modernCategories(of spaceId: String, search: String, isVoice: (RoomSummary) -> Bool) -> [ModernCategory] {
        var byId: [String: RoomSummary] = [:]
        for room in rooms(for: .space(spaceId)) { byId[room.id] = room }
        let query = search.trimmingCharacters(in: .whitespaces)
        return SpaceModern.categories(in: graph, of: spaceId).enumerated().compactMap { index, category in
            var rooms = category.roomIds.compactMap { byId[$0] }
            if !query.isEmpty { rooms = rooms.filter { $0.displayName.localizedCaseInsensitiveContains(query) } }
            rooms = SpaceModern.arrange(rooms, isVoice: isVoice)
            let title = category.spaceId.map { space(id: $0)?.name ?? String(localized: "explore.typeSpace") }
            if title == nil, rooms.isEmpty { return nil }
            if !query.isEmpty, rooms.isEmpty { return nil }
            return ModernCategory(id: "\(index)-\(category.spaceId ?? "root")", title: title, rooms: rooms)
        }
    }
}
