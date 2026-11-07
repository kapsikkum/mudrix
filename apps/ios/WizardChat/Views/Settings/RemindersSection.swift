import SwiftUI

/// Pending "Remind me" reminders, cancellable; Settings > Notifications
struct RemindersSection: View {
    @EnvironmentObject private var session: MatrixSession
    @ObservedObject private var reminders = Reminders.shared
    @Environment(\.theme) private var theme

    var body: some View {
        SettingsSection(title: "settings.notifications.reminders.title") {
            if reminders.items.isEmpty {
                Text(String(localized: "settings.notifications.reminders.empty"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            ForEach(reminders.items) { reminder in
                HStack(spacing: WZ.Space.space4) {
                    Text(L10n.format("settings.notifications.reminders.entry",
                                     session.roomList?.room(id: reminder.roomId)?.displayName ?? reminder.roomId,
                                     Self.label(reminder.at)))
                        .font(.wizard(WZ.FontSize.md))
                        .foregroundStyle(theme.textPrimary)
                    Spacer(minLength: 4)
                    Button {
                        guard let client = session.client else { return }
                        Task { _ = try? await reminders.remove(client: client, id: reminder.id) }
                    } label: {
                        Image("ph-x-regular").font(.system(size: WZ.SizeIcon.sm))
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(String(localized: "settings.notifications.reminders.cancel"))
                }
            }
        }
    }

    /// The time for a reminder due today, the date and time otherwise
    private static func label(_ milliseconds: Int64) -> String {
        let date = Date(timeIntervalSince1970: Double(milliseconds) / 1000)
        if Calendar.current.isDateInToday(date) { return date.formatted(date: .omitted, time: .shortened) }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
