import SwiftUI

struct CreateSpaceView: View {
    let onDone: (String) -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    private enum Mode { case choose, create, join }

    @State private var mode = Mode.choose
    @State private var joinTarget = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        if mode == .create {
            CreateRoomView(onSpaceCreated: onDone) { mode = .choose }
        } else {
            NavigationStack {
                Form {
                    switch mode {
                    case .join: joinForm
                    default: chooser
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.error)
                    }
                }
                .navigationTitle(mode == .join ? String(localized: "room.space.join.title") : String(localized: "space.addASpace"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        if mode == .choose {
                            Button(String(localized: "common.cancel")) { dismiss() }
                        } else {
                            Button(String(localized: "common.back")) {
                                errorMessage = nil
                                mode = .choose
                            }
                        }
                    }
                    if mode == .join {
                        ToolbarItem(placement: .confirmationAction) {
                            if isWorking { ProgressView() } else {
                                Button(String(localized: "common.join")) { Task { await join() } }
                                    .disabled(joinTarget.trimmingCharacters(in: .whitespaces).isEmpty)
                            }
                        }
                    }
                }
                .tint(theme.control)
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var chooser: some View {
        Section {
            choice(icon: "ph-plus-circle-regular", title: String(localized: "room.space.create.title"),
                   note: String(localized: "space.groupRoomsTogetherFor")) { mode = .create }
            choice(icon: "ph-link-simple-regular", title: String(localized: "room.space.join.title"),
                   note: String(localized: "space.joinWithASpace")) { mode = .join }
        }
    }

    private func choice(icon: String, title: String, note: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: WZ.Space.space5) {
                Image(icon)
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textPrimary)
                    .frame(width: WZ.SizeIcon.lg)
                VStack(alignment: .leading, spacing: WZ.Space.space0) {
                    Text(title).foregroundStyle(theme.textPrimary)
                    Text(note).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                }
                Spacer(minLength: WZ.Space.space4)
                Image("ph-caret-right-bold")
                    .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var joinForm: some View {
        Section {
            TextField("#spacename:server.org", text: $joinTarget)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { Task { await join() } }
        } header: {
            Text(String(localized: "room.space.join.spaceId"))
        } footer: {
            Text(String(localized: "space.joinWithASpace"))
        }
    }

    private func join() async {
        guard !joinTarget.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let spaceId = try await session.join(joinTarget)
            onDone(spaceId)
            dismiss()
        } catch {
            errorMessage = L10n.format("explore.failedToJoin", "\(error)")
        }
    }
}
