import SwiftUI
import WizardChatCore

/// "Jump to date": picks a day, asks the homeserver for the first message on or after it and hands the
/// event id back so the room can open there. Works on servers with `timestampToEvent` (MSC3030 / v1.6).
struct JumpToDateSheet: View {
    let client: WizardClient
    let roomId: String
    let onJump: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var day = Date()
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: WZ.Space.space5) {
                Text(String(localized: "room.jumpToDate.description"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                DatePicker("", selection: $day, in: ...Date(), displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                Button(String(localized: "room.jumpToDate.jump")) { Task { await submit() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy)
                Spacer(minLength: 0)
            }
            .padding(WZ.Space.space6)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "room.jumpToDate.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.close")) { dismiss() } }
            }
            .overlay(alignment: .top) { CopyToastView().padding(.top, WZ.Space.space2) }
            .tint(theme.control)
        }
    }

    private func submit() async {
        busy = true
        defer { busy = false }
        do {
            let found = try await JumpToDate.eventNear(JumpToDate.startOfDay(day)) { at, direction in
                try await client.timestampToEvent(roomId: roomId, timestamp: at, direction: direction)
            }
            guard let found else {
                CopyToast.shared.show(L10n.format("room.jumpToDate.notFound"))
                return
            }
            dismiss()
            onJump(found)
        } catch {
            CopyToast.shared.show(L10n.format(JumpToDate.noticeKey(for: error)))
        }
    }
}
