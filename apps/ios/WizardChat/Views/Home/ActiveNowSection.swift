import SwiftUI
import WizardChatCore

struct ActiveNowSection: View {
    @ObservedObject var roomList: RoomListModel
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme

    private struct Card: Identifiable {
        let room: RoomSummary
        let people: [Person]
        let knownCount: Int
        let includesMe: Bool
        var id: String { room.id }
    }

    private struct Person: Identifiable {
        let userId: String
        let name: String?
        let avatarUrl: String?
        let known: Bool
        var id: String { userId }
    }

    private static let peopleLimit = 5

    private var cards: [Card] {
        let known = Dictionary(roomList.joinedRooms.filter(\.isDirect).compactMap { room in
            room.dmUserId.map { ($0, room) }
        }, uniquingKeysWith: { first, _ in first })
        let me = session.userId
        return roomList.joinedRooms
            .filter { $0.isVoice && !$0.callParticipants.isEmpty }
            .compactMap { room -> Card? in
                let ids = Array(NSOrderedSet(array: room.callParticipants)) as? [String] ?? room.callParticipants
                let people = ids.map { id in
                    Person(userId: id, name: known[id]?.dmUserName, avatarUrl: known[id]?.dmUserAvatar,
                           known: id != me && known[id] != nil)
                }
                let knownCount = people.filter(\.known).count
                guard knownCount > 0 else { return nil }
                return Card(room: room, people: people.sorted { $0.known && !$1.known }, knownCount: knownCount,
                            includesMe: me.map(ids.contains) ?? false)
            }
            .sorted { $0.knownCount > $1.knownCount }
    }

    var body: some View {
        let cards = cards
        if !cards.isEmpty {
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                Text(String(localized: "home.activeNow"))
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textMuted)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: WZ.Space.space4) {
                        ForEach(cards) { card($0) }
                    }
                }
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: WZ.Space.space2, leading: WZ.Space.space6, bottom: WZ.Space.space4, trailing: 0))
        }
    }

    private func card(_ card: Card) -> some View {
        let shown = card.people.prefix(Self.peopleLimit)
        return VStack(alignment: .leading, spacing: WZ.Space.space4) {
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                HStack(spacing: WZ.Space.space2) {
                    Image("ph-speaker-high-regular")
                        .font(.system(size: WZ.SizeIcon.xs))
                        .foregroundStyle(theme.success)
                    Text(card.room.displayName)
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                }
                if let space = roomList.space(containing: card.room.id) {
                    Text(space.name)
                        .font(.wizard(WZ.FontSize.xs))
                        .foregroundStyle(theme.textMuted)
                        .lineLimit(1)
                }
            }
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                ForEach(shown) { person in
                    ActivePerson(person: person.userId, name: person.name, avatarUrl: person.avatarUrl,
                                 roomId: card.room.id, known: person.known)
                }
                if card.people.count > shown.count {
                    Text(L10n.format("home.morePeople", card.people.count - shown.count))
                        .font(.wizard(WZ.FontSize.xs))
                        .foregroundStyle(theme.textMuted)
                }
            }
            Spacer(minLength: WZ.Space.space0)
            NavigationLink(value: Route.room(card.room.id)) {
                Text(String(localized: card.includesMe ? "home.open" : "home.join"))
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(card.includesMe ? theme.textPrimary : theme.textOnAccent)
                    .frame(maxWidth: .infinity, minHeight: WZ.SizeControl.md)
                    .background(card.includesMe ? theme.fill : theme.accent, in: Capsule())
            }
            .simultaneousGesture(TapGesture().onEnded {
                guard !card.includesMe else { return }
                Task { await calls.join(card.room, session: session) }
            })
        }
        .padding(WZ.Space.space5)
        .frame(width: WZ.Size.sidebar * 0.75, alignment: .topLeading)
        .frame(minHeight: WZ.Size.sidebar * 0.75)
        .background(theme.bgSecondary, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
    }
}

private struct ActivePerson: View {
    let person: String
    let name: String?
    let avatarUrl: String?
    let roomId: String
    let known: Bool
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var profile: MemberDirectory.Profile?

    var body: some View {
        HStack(spacing: WZ.Space.space3) {
            AvatarView(name: name ?? profile?.name ?? person, url: avatarUrl ?? profile?.avatarUrl, size: WZ.SizeAvatar.xs)
            Text(name ?? profile?.name ?? person)
                .font(.wizard(WZ.FontSize.sm, known ? .semibold : .regular))
                .foregroundStyle(known ? theme.textPrimary : theme.textMuted)
                .lineLimit(1)
        }
        .task(id: person) {
            guard name == nil else { return }
            profile = await session.memberProfile(person, in: roomId)
        }
    }
}
