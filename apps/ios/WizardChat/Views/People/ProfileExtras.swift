import SwiftUI
import WizardChatCore

extension Color {
    /// The colour a profile asks to be tinted with (`#rrggbb`), or nil
    static func accent(_ hex: String?) -> Color? {
        guard let hex, ProfileFields.normalizeHex(hex) != nil else { return nil }
        return Color(hex: hex)
    }
}

/// The profile picture, with a ring in the person's accent colour when they chose one, inside their frame
struct AccentAvatar: View {
    let name: String
    let url: String?
    let accent: String?
    var decoration: CosmeticValue? = nil
    var frame: CosmeticValue? = nil

    var body: some View {
        ZStack {
            CosmeticFramePieces(value: frame, layer: "back", size: WZ.SizeAvatar.xl)
            picture
            CosmeticFramePieces(value: frame, layer: "front", size: WZ.SizeAvatar.xl)
        }
    }

    @ViewBuilder
    private var picture: some View {
        if let color = Color.accent(accent) {
            AvatarView(name: name, url: url, size: WZ.SizeAvatar.xl, decoration: decoration)
                .padding(3)
                .overlay(Circle().strokeBorder(color, lineWidth: 3))
        } else {
            AvatarView(name: name, url: url, size: WZ.SizeAvatar.xl, decoration: decoration)
        }
    }
}

/// Pronouns, local time, what they are playing and the bio, under the name
struct ProfileAboutView: View {
    let profile: ExtendedProfile

    @Environment(\.theme) private var theme
    @State private var fullBio = false

    private static let clampLines = 4
    private static let clampChars = 200

    private var activities: [ProfileActivity] { ProfileFields.live(profile.activities) }

    private var bioIsLong: Bool {
        profile.bio.filter { $0 == "\n" }.count >= Self.clampLines || profile.bio.count > Self.clampChars
    }

    var body: some View {
        VStack(spacing: WZ.Space.space3) {
            if !profile.pronouns.isEmpty {
                Text(profile.pronouns.joined(separator: ", "))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textSecondary)
            }
            if let timezone = profile.timezone, let local = ProfileFields.localTime(timezone) {
                Text("\(local.time) \u{00B7} \(relative(local.offsetHours))")
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            ForEach(Array(activities.enumerated()), id: \.offset) { _, activity in
                ActivityCard(activity: activity)
            }
            if !profile.bio.isEmpty {
                VStack(alignment: .leading, spacing: WZ.Space.space2) {
                    Text(profile.bio)
                        .font(.wizard(WZ.FontSize.md))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(fullBio ? nil : Self.clampLines)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !fullBio, bioIsLong {
                        Button(String(localized: "profile.viewFullBio")) { fullBio = true }
                            .font(.wizard(WZ.FontSize.sm, .semibold))
                            .foregroundStyle(theme.accent)
                            .buttonStyle(.plain)
                    }
                }
                .padding(WZ.Space.space4)
                .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func relative(_ offset: Double) -> String {
        if offset == 0 { return String(localized: "profile.sameTime") }
        let hours = abs(offset)
        let shown = hours.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(hours))" : String(format: "%.1f", hours)
        return L10n.format(offset > 0 ? "profile.hoursAhead" : "profile.hoursBehind", shown)
    }
}

private struct ActivityCard: View {
    let activity: ProfileActivity

    @Environment(\.theme) private var theme

    private var title: String {
        if activity.type == "playing" { return L10n.format("profile.activity.playing", activity.name) }
        if !activity.details.isEmpty { return L10n.format("profile.activity.listeningBy", activity.name, activity.details) }
        return L10n.format("profile.activity.listening", activity.name)
    }

    private var cardTitle: String {
        if activity.type == "playing" { return String(localized: "profile.activity.cardPlaying") }
        return String(localized: "profile.activity.cardListening")
    }

    private var since: String? {
        guard activity.type == "playing", activity.startedAt > 0 else { return nil }
        let elapsed = Int64(Date().timeIntervalSince1970 * 1000) - activity.startedAt
        let minutes = max(0, elapsed / 60_000)
        if minutes < 1 { return String(localized: "profile.activity.justStarted") }
        let duration = minutes >= 60 ? "\(minutes / 60) h \(minutes % 60) min" : "\(minutes) min"
        return L10n.format("profile.activity.forDuration", duration)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space1) {
            Text(cardTitle)
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
            Text(title)
                .font(.wizard(WZ.FontSize.md, .medium))
                .foregroundStyle(theme.textPrimary)
            if let since {
                Text(since).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(WZ.Space.space4)
        .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
    }
}

/// "Mudrix user" and the software the person's homeserver runs
struct ProfileBadges: View {
    let isMudrixUser: Bool
    let software: HomeserverSoftware?

    @Environment(\.theme) private var theme

    var body: some View {
        if isMudrixUser || software != nil {
            HStack(spacing: WZ.Space.space3) {
                if isMudrixUser {
                    badge(String(localized: "profile.badge.mudrixUser"), glyph: "M", color: theme.accent)
                }
                if let software {
                    let known = ProfileFields.describeSoftware(software.name)
                    badge([known.label, software.version].filter { !$0.isEmpty }.joined(separator: " "),
                          glyph: known.glyph, color: Color(hex: String(format: "%06X", known.color)))
                }
            }
        }
    }

    private func badge(_ text: String, glyph: String, color: Color) -> some View {
        HStack(spacing: WZ.Space.space2) {
            Text(glyph)
                .font(.wizard(WZ.FontSize.xs, .bold))
                .foregroundStyle(Color.white)
                .frame(width: WZ.SizeIcon.md, height: WZ.SizeIcon.md)
                .background(color, in: Circle())
            Text(text)
                .font(.wizard(WZ.FontSize.sm, .medium))
                .foregroundStyle(theme.textSecondary)
                .lineLimit(1)
        }
        .padding(.horizontal, WZ.Space.space3)
        .padding(.vertical, WZ.Space.space1)
        .background(theme.bgTertiary, in: Capsule())
    }
}

/// A private note on someone, kept in account data and saved when the box loses focus
struct ProfileNoteSection: View {
    let userId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @FocusState private var focused: Bool
    @State private var note = ""
    @State private var loaded = false
    @State private var saved = false

    var body: some View {
        Section {
            TextField("", text: $note,
                      prompt: Text(String(localized: "profile.notesPlaceholderTouch")).foregroundColor(theme.textMuted),
                      axis: .vertical)
                .lineLimit(1...6)
                .focused($focused)
                .onChange(of: note) { _, value in
                    if value.count > ProfileFields.maxNoteLength { note = String(value.prefix(ProfileFields.maxNoteLength)) }
                }
                .onChange(of: focused) { was, now in
                    if was, !now { Task { await save() } }
                }
        } header: {
            Text(String(localized: "profile.notes"))
        } footer: {
            if saved { Text(String(localized: "profile.notesSaved")) }
        }
        .task(id: userId) {
            note = await current()[userId] ?? ""
            loaded = true
        }
    }

    private func current() async -> [String: String] {
        var content = await session.accountDataJSON(ProfileFields.notesType)
        if content == nil { content = await session.accountDataJSON(ProfileFields.legacyNotesType) }
        return ProfileFields.parseNotes(content.map { JSONValue(any: $0) })
    }

    private func save() async {
        guard loaded else { return }
        var notes = await current()
        let trimmed = String(note.prefix(ProfileFields.maxNoteLength))
        if trimmed == (notes[userId] ?? "") { return }
        if trimmed.isEmpty { notes.removeValue(forKey: userId) } else { notes[userId] = trimmed }
        guard let object = ProfileFields.notesValue(notes).any as? [String: Any],
              (try? await session.setAccountDataJSON(ProfileFields.notesType, object)) != nil else { return }
        saved = true
        try? await Task.sleep(for: .seconds(1.6))
        saved = false
    }
}
