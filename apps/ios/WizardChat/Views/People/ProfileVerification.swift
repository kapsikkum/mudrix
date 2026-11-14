import SwiftUI
import WizardChatCore

/// Whether you verified this person, and the emoji comparison to do it when they have an identity
struct ProfileVerificationSection: View {
    let userId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var trust: UserTrust?
    @State private var verification: VerificationModel?

    var body: some View {
        Group {
            if let trust, trust.verified || trust.hasIdentity {
                Section {
                    if trust.verified {
                        Label(String(localized: "profile.verifiedUser"), image: "ph-shield-check-regular")
                            .foregroundStyle(theme.success)
                    } else {
                        Button {
                            verification = VerificationModel(.user(userId))
                        } label: {
                            HStack(spacing: WZ.Space.space4) {
                                Label(String(localized: "profile.notVerifiedUser"), image: "ph-shield-warning-regular")
                                    .foregroundStyle(theme.textMuted)
                                Spacer()
                                Text(String(localized: "verification.verifyUser"))
                                    .font(.wizard(WZ.FontSize.md, .medium))
                                    .foregroundStyle(theme.control)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .sheet(item: $verification) { VerificationSheet(model: $0) }
        .task(id: userId) { await load() }
        .onChange(of: verification == nil) { _, closed in
            if closed { Task { await load() } }
        }
    }

    private func load() async {
        guard let client = session.client else { return }
        trust = try? await client.userTrust(userId: userId)
    }
}
