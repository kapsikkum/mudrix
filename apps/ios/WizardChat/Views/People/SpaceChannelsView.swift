import SwiftUI
import WizardChatCore

enum SpaceChannelOrder {
    /// Writes the `order` the children of `spaceId` need to read as `orderedIds`: a four digit number per place, and only
    /// where a child's own order differs (so a list that is already right writes nothing)
    static func save(client: WizardClient, node: SpaceNode?, spaceId: String, orderedIds: [String]) async throws {
        for (index, childId) in orderedIds.enumerated() {
            let order = String(format: "%04d", (index + 1) * 10)
            if node?.children.first(where: { $0.roomId == childId })?.order == order { continue }
            // A link without `via` is a removed child
            let content = try await client.stateEvent(roomId: spaceId, eventType: "m.space.child", stateKey: childId)
            guard let object = content?.object, object["via"] != nil else { continue }
            try await client.updateSpaceChild(spaceId: spaceId, childId: childId, suggested: nil, order: order, clearOrder: false)
        }
    }
}

/// The Channels screen of a Modern space: move channels up and down inside a category or into another one, and move
/// categories among their siblings. Moving a channel adds it to the new category before taking it out of the old one, so a
/// failure never loses it.
struct SpaceChannelsView: View {
    let spaceId: String
    @ObservedObject var roomList: RoomListModel

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var canManage = false
    @State private var error: String?

    private var graph: [SpaceNode] { roomList.graph }

    var body: some View {
        let categories = SpaceModern.categories(in: graph, of: spaceId)
        List {
            ForEach(Array(categories.enumerated()), id: \.offset) { _, category in
                Section {
                    ForEach(category.roomIds, id: \.self) { roomId in
                        channelRow(roomId, in: category, categories: categories)
                    }
                } header: {
                    categoryHeader(category)
                }
            }
            if let error {
                Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
            }
        }
        .navigationTitle(String(localized: "room.settings.channels.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: spaceId) { canManage = await session.canSendState("m.space.child", in: spaceId) }
    }

    private func categoryName(_ category: SpaceModern.Category) -> String {
        category.spaceId.flatMap { roomList.space(id: $0)?.name } ?? String(localized: "room.title")
    }

    private func categoryHeader(_ category: SpaceModern.Category) -> some View {
        HStack {
            Text(categoryName(category)).lineLimit(1)
            Spacer()
            if canManage, let categoryId = category.spaceId {
                Button { moveCategory(categoryId, -1) } label: { Image(systemName: "chevron.up") }
                    .accessibilityLabel(String(localized: "room.settings.roles.moveUp"))
                Button { moveCategory(categoryId, 1) } label: { Image(systemName: "chevron.down") }
                    .accessibilityLabel(String(localized: "room.settings.roles.moveDown"))
            }
        }
        .buttonStyle(.borderless)
    }

    private func channelRow(_ roomId: String, in category: SpaceModern.Category, categories: [SpaceModern.Category]) -> some View {
        let room = roomList.room(id: roomId)
        return HStack(spacing: WZ.Space.space4) {
            Image(systemName: room?.isVoice == true ? "speaker.wave.2" : "number").foregroundStyle(theme.textMuted)
            Text(room?.displayName ?? roomId)
                .foregroundStyle(room != nil ? theme.textPrimary : theme.textMuted)
                .lineLimit(1)
            Spacer()
            if canManage {
                Button { moveRoom(roomId, in: category, delta: -1) } label: { Image(systemName: "chevron.up") }
                    .accessibilityLabel(String(localized: "room.settings.roles.moveUp"))
                Button { moveRoom(roomId, in: category, delta: 1) } label: { Image(systemName: "chevron.down") }
                    .accessibilityLabel(String(localized: "room.settings.roles.moveDown"))
                Menu {
                    Section(String(localized: "room.settings.channels.moveTo")) {
                        ForEach(Array(categories.enumerated()), id: \.offset) { _, target in
                            if target.spaceId != category.spaceId {
                                Button(categoryName(target)) {
                                    moveToCategory(roomId, from: category.spaceId ?? spaceId, to: target.spaceId ?? spaceId)
                                }
                            }
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel(String(localized: "common.more"))
            }
        }
        .buttonStyle(.borderless)
    }

    private func run(_ work: @escaping (WizardClient) async throws -> Void) {
        guard let client = session.client else { return }
        Task {
            do {
                try await work(client)
                roomList.refreshGraph()
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func moveRoom(_ roomId: String, in category: SpaceModern.Category, delta: Int) {
        var ids = category.roomIds
        guard let index = ids.firstIndex(of: roomId), ids.indices.contains(index + delta) else { return }
        ids.swapAt(index, index + delta)
        let parent = category.spaceId ?? spaceId
        let node = graph.first { $0.spaceId == parent }
        let ordered = ids
        run { client in
            try await SpaceChannelOrder.save(client: client, node: node, spaceId: parent, orderedIds: ordered)
        }
    }

    private func moveCategory(_ categoryId: String, _ delta: Int) {
        guard let parent = SpaceModern.parent(of: categoryId, in: graph),
              let node = graph.first(where: { $0.spaceId == parent }) else { return }
        var siblings = SpaceModern.orderedChildren(node).map(\.roomId)
        guard let index = siblings.firstIndex(of: categoryId), siblings.indices.contains(index + delta) else { return }
        siblings.swapAt(index, index + delta)
        let ordered = siblings
        run { client in
            try await SpaceChannelOrder.save(client: client, node: node, spaceId: parent, orderedIds: ordered)
        }
    }

    private func moveToCategory(_ roomId: String, from: String, to: String) {
        run { client in
            try await client.addToSpace(spaceId: to, childId: roomId, suggested: false)
            try await client.removeFromSpace(spaceId: from, childId: roomId)
        }
    }
}
