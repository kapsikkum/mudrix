import SwiftUI
import WizardChatCore

struct IdentityWarning: View {
    let roomId: String
    let client: WizardClient
    let encrypted: Bool

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var violations: [String: Bool] = [:]
    @State private var names: [String: String] = [:]
    @State private var subscription: Subscription?
    @State private var busy = false
    @State private var error: String?

    private var current: (userId: String, verified: Bool)? {
        violations.sorted { a, b in a.value != b.value ? a.value : a.key < b.key }.first.map { ($0.key, $0.value) }
    }

    var body: some View {
        Group {
            if let current {
                let name = names[current.userId] ?? current.userId
                HStack(alignment: .center, spacing: WZ.Space.space4) {
                    Image("ph-warning-regular")
                        .font(.system(size: WZ.SizeIcon.md))
                        .foregroundStyle(current.verified ? theme.danger : theme.warningColor)
                    VStack(alignment: .leading, spacing: WZ.Space.space1) {
                        Text(L10n.format(current.verified ? "verification.identityWarning.verifiedReset" : "verification.identityWarning.reset", name))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textPrimary)
                        Text(current.userId)
                            .font(.wizard(WZ.FontSize.xs))
                            .foregroundStyle(theme.textMuted)
                        if let error {
                            Text(error).font(.wizard(WZ.FontSize.xs)).foregroundStyle(theme.danger)
                        }
                    }
                    Spacer(minLength: WZ.Space.space0)
                    Button(String(localized: current.verified ? "verification.identityWarning.withdraw" : "common.ok")) {
                        resolve(current.userId)
                    }
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(current.verified ? theme.danger : theme.control)
                    .disabled(busy)
                }
                .padding(WZ.Space.space4)
                .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                .padding(.horizontal, WZ.Space.space5)
                .task(id: current.userId) {
                    if names[current.userId] == nil {
                        names[current.userId] = await session.memberProfile(current.userId, in: roomId).name
                    }
                }
            }
        }
        .onAppear { watch() }
        .onChange(of: encrypted) { _, _ in watch() }
        .onDisappear {
            subscription?.cancel()
            subscription = nil
        }
    }

    private func watch() {
        subscription?.cancel()
        subscription = nil
        violations = [:]
        guard encrypted else { return }
        let me = session.userId
        subscription = client.watchIdentityChanges(roomId: roomId) { changes in
            MainActor.assumeIsolated {
                for change in changes where change.userId != me {
                    switch change.state {
                    case "verificationViolation": violations[change.userId] = true
                    case "pinViolation": violations[change.userId] = false
                    default: violations[change.userId] = nil
                    }
                }
            }
        }
    }

    private func resolve(_ userId: String) {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await client.acknowledgeIdentity(userId: userId)
            } catch {
                self.error = L10n.format("verification.identityWarning.failed", error.localizedDescription)
            }
        }
    }
}
