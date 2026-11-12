import SwiftUI
import WizardChatCore

/// "Send later": schedules the draft as a delayed event on the homeserver (MSC4140) and lists, sends or
/// cancels the room's scheduled messages
struct ScheduleSheet: View {
    let client: WizardClient
    let roomId: String
    let roomEncrypted: Bool
    /// The draft to schedule, as text and HTML
    let draft: String
    let html: String?
    let replyTo: String?
    let threadRoot: String?
    let mentionedUserIds: [String]
    /// Called once the draft is scheduled, so the composer can clear it
    let onScheduled: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var sendAt = Date().addingTimeInterval(3600)
    @State private var supported: Bool?
    @State private var scheduled: [ScheduledMessage]?
    @State private var busy = false

    private var nowMs: Int { Int(Date().timeIntervalSince1970 * 1000) }
    private var sendAtMs: Int { Int(sendAt.timeIntervalSince1970 * 1000) }
    private var hasDraft: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var available: Bool { supported != false && !roomEncrypted }
    private var tooSoon: Bool { !ScheduledMessages.isSchedulable(sendAtMs, now: nowMs) }

    var body: some View {
        NavigationStack {
            Form {
                if !available {
                    Section {
                        Text(String(localized: roomEncrypted ? "composer.schedule.encrypted" : "composer.schedule.unsupported"))
                            .foregroundStyle(theme.warningColor)
                    }
                }
                Section {
                    Text(hasDraft ? draft : String(localized: "composer.schedule.noDraft"))
                        .foregroundStyle(hasDraft ? theme.textPrimary : theme.textMuted)
                } header: {
                    Text(String(localized: "composer.schedule.messageLabel"))
                }
                Section {
                    DatePicker(String(localized: "composer.schedule.whenLabel"), selection: $sendAt, displayedComponents: [.date, .hourAndMinute])
                    Button(String(localized: "composer.schedule.inOneHour")) {
                        sendAt = Date(timeIntervalSince1970: Double(ScheduledMessages.inOneHour(now: nowMs)) / 1000)
                    }
                    Button(String(localized: "composer.schedule.tomorrowMorning")) {
                        sendAt = Date(timeIntervalSince1970: Double(ScheduledMessages.tomorrowMorning(now: nowMs)) / 1000)
                    }
                    Button(String(localized: "composer.schedule.submit")) { Task { await schedule() } }
                        .disabled(!available || !hasDraft || tooSoon || busy)
                } footer: {
                    if hasDraft && tooSoon { Text(String(localized: "composer.schedule.pastTime")) }
                }
                Section {
                    if let scheduled {
                        if scheduled.isEmpty {
                            Text(String(localized: "composer.schedule.empty")).foregroundStyle(theme.textMuted)
                        }
                        ForEach(scheduled) { message in
                            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                                Text(message.body).lineLimit(3)
                                Text(Date(timeIntervalSince1970: Double(message.sendAt) / 1000).formatted(date: .abbreviated, time: .shortened))
                                    .font(.wizard(WZ.FontSize.xs))
                                    .foregroundStyle(theme.textMuted)
                                HStack {
                                    Button(String(localized: "composer.schedule.sendNow")) { Task { await sendNow(message) } }
                                    Button(String(localized: "composer.schedule.cancel"), role: .destructive) { Task { await cancel(message) } }
                                }
                                .buttonStyle(.borderless)
                            }
                        }
                    } else {
                        ProgressView()
                    }
                } header: {
                    Text(String(localized: "composer.schedule.listTitle"))
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "composer.schedule.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.close")) { dismiss() } }
            }
            .overlay(alignment: .top) { CopyToastView().padding(.top, WZ.Space.space2) }
            .tint(theme.control)
        }
        .task { await reload() }
    }

    private func reload() async {
        do {
            scheduled = ScheduledMessages.of(try await client.listDelayedEvents(roomId: roomId), roomId: roomId)
            supported = true
        } catch {
            if ScheduledMessages.noticeKey(for: error) == "composer.schedule.unsupported" { supported = false }
            scheduled = []
        }
    }

    private func report(_ key: String, _ error: Error) {
        if let notice = ScheduledMessages.noticeKey(for: error) {
            CopyToast.shared.show(L10n.format(notice))
        } else {
            CopyToast.shared.show(L10n.format(key, error.localizedDescription))
        }
    }

    private func schedule() async {
        busy = true
        defer { busy = false }
        let content = ScheduledMessages.content(body: draft.trimmingCharacters(in: .whitespacesAndNewlines), html: html,
                                                mentionedUserIds: mentionedUserIds, replyTo: replyTo, threadRoot: threadRoot)
        do {
            _ = try await client.sendDelayedEvent(roomId: roomId, eventType: "m.room.message", content: content,
                                                  delayMs: ScheduledMessages.delay(for: sendAtMs, now: nowMs))
            CopyToast.shared.show(L10n.format("composer.schedule.scheduled"))
            onScheduled()
            await reload()
        } catch {
            report("composer.schedule.failed", error)
        }
    }

    private func sendNow(_ message: ScheduledMessage) async {
        do {
            try await client.sendDelayedEventNow(delayId: message.delayId)
            await reload()
        } catch {
            report("composer.schedule.sendNowFailed", error)
        }
    }

    private func cancel(_ message: ScheduledMessage) async {
        do {
            try await client.cancelDelayedEvent(delayId: message.delayId)
            await reload()
        } catch {
            report("composer.schedule.cancelFailed", error)
        }
    }
}
