import SwiftUI

struct CreateSpaceView: View {
    let onDone: (String) -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    private enum Mode { case choose, create, join }

    @State private var mode = Mode.choose
    @State private var name = ""
    @State private var topic = ""
    @State private var isPublic = false
    @State private var joinTarget = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WZ.Space.space6) {
                    switch mode {
                    case .choose: chooser
                    case .create: createForm
                    case .join: joinForm
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.error)
                    }
                }
                .padding(WZ.Space.space6)
            }
            .background(theme.bgSecondary)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(theme.bgPrimary, for: .navigationBar)
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
            }
            .tint(theme.control)
        }
        .presentationDetents([.medium, .large])
    }

    private var title: String {
        switch mode {
        case .choose: return String(localized: "space.addASpace")
        case .create: return String(localized: "room.space.create.title")
        case .join: return String(localized: "room.space.join.title")
        }
    }

    private var chooser: some View {
        VStack(spacing: WZ.Space.space5) {
            choice(icon: "ph-plus-circle-regular", title: String(localized: "room.space.create.title"),
                   note: String(localized: "space.groupRoomsTogetherFor")) { mode = .create }
            choice(icon: "ph-arrow-circle-right-regular", title: String(localized: "room.space.join.title"),
                   note: String(localized: "space.joinWithASpace")) { mode = .join }
        }
    }

    private func choice(icon: String, title: String, note: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: WZ.Space.space5) {
                Image(icon)
                    .font(.system(size: WZ.SizeIcon.lg))
                    .foregroundStyle(theme.control)
                    .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                    .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WizardTheme.radiusMd))
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(title)
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(note)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image("ph-caret-right-bold")
                    .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
            .padding(WZ.Space.space5)
            .background(theme.bgPrimary, in: RoundedRectangle(cornerRadius: WizardTheme.radiusMd))
            .overlay(RoundedRectangle(cornerRadius: WizardTheme.radiusMd).stroke(theme.border))
        }
        .buttonStyle(.plain)
    }

    private var createForm: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space6) {
            field(String(localized: "room.space.name")) {
                TextField("", text: $name, prompt: Text(String(localized: "space.mySpace")).foregroundColor(theme.textMuted))
                    .wizardField()
            }
            field(String(localized: "dialogs.topic")) {
                TextField("", text: $topic, prompt: Text(String(localized: "space.whatIsThisSpace")).foregroundColor(theme.textMuted))
                    .wizardField()
            }
            Toggle(isOn: $isPublic) {
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(String(localized: "room.space.create.public"))
                        .font(.wizard(WZ.FontSize.md, .medium))
                        .foregroundStyle(theme.textPrimary)
                    Text(String(localized: "room.space.create.publicNote"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .tint(theme.control)
            Button(isWorking ? String(localized: "space.creating") : String(localized: "common.create")) {
                Task { await create() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isWorking || name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    private var joinForm: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space6) {
            field(String(localized: "room.space.join.spaceId")) {
                TextField("", text: $joinTarget,
                          prompt: Text("#spacename:server.org").foregroundColor(theme.textMuted))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .wizardField()
                    .onSubmit { Task { await join() } }
            }
            Button(isWorking ? String(localized: "explore.joining") : String(localized: "common.join")) {
                Task { await join() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isWorking || joinTarget.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(label)
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
            content()
        }
    }

    private func create() async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let trimmedTopic = topic.trimmingCharacters(in: .whitespaces)
            let spaceId = try await session.createSpace(
                name: name.trimmingCharacters(in: .whitespaces),
                topic: trimmedTopic.isEmpty ? nil : trimmedTopic,
                isPublic: isPublic
            )
            onDone(spaceId)
            dismiss()
        } catch {
            errorMessage = L10n.format("space.failedToCreateSpace", "\(error)")
        }
    }

    private func join() async {
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
