import WizardChatCore
import SwiftUI

struct PinnedMessagesView: View {
    let room: RoomSummary
    let canPin: Bool

    @StateObject private var timeline: TimelineModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    init(room: RoomSummary, client: WizardClient, canPin: Bool) {
        self.room = room
        self.canPin = canPin
        _timeline = StateObject(wrappedValue: TimelineModel(client: client, roomId: room.id, pinnedOnly: true))
    }

    private var messages: [ChatEntry] {
        timeline.entries.filter {
            switch $0.kind {
            case .dateDivider, .system: return false
            default: return true
            }
        }
        .map { var entry = $0; entry.isGrouped = false; return entry }
        .reversed()
    }

    var body: some View {
            List {
                ForEach(messages) { entry in
                    MessageRow(entry: entry, isPrivateRoom: room.isDirect)
                        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                        .listRowBackground(theme.bgSecondary)
                        .swipeActions {
                            if canPin {
                                Button(String(localized: "timeline.unpin")) { Task { await timeline.togglePin(entry) } }
                                    .tint(theme.accent)
                            }
                        }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(theme.bgSecondary)
            .overlay {
                if messages.isEmpty {
                    ContentUnavailableView(String(localized: "pins.empty"), image: "ph-push-pin-regular",
                                           description: Text(String(localized: "timeline.pinImportantMessagesFrom")))
                }
            }
            .navigationTitle(String(localized: "room.header.pinnedMessages"))
            .navigationBarTitleDisplayMode(.inline)
            .tint(theme.accent)
            .task { await timeline.start() }
    }
}

struct SourceView: View {
    let json: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            ScrollView([.vertical, .horizontal]) {
                Text(json)
                    .font(.system(size: WZ.SizeIcon.xs, design: .monospaced))
                    .foregroundStyle(theme.textPrimary)
                    .textSelection(.enabled)
                    .padding(WZ.Space.space6)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(theme.bgSecondary)
            .overlay(alignment: .top) { CopyToastView().padding(.top, WZ.Space.space2) }
            .navigationTitle(String(localized: "timeline.viewSource"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { copyToClipboard(json) } label: { Image("ph-copy-regular") }
                        .accessibilityLabel(String(localized: "common.copy"))
                }
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
            }
            .tint(theme.accent)
        }
    }
}
