import WizardChatCore
import SwiftUI

@MainActor
final class VerificationModel: ObservableObject, Identifiable {
    enum Start {
        case ownDevice
        case device(String)
        case user(String)
        case incoming(VerificationFlow)
    }

    enum Step {
        case starting, waitingForOtherDevice, waitingForEmojis
        case incoming(otherUser: String, isSelf: Bool)
        case compare([VerificationEmoji])
        case done, failed(String), cancelled
    }

    let id = UUID()
    let start: Start
    @Published var step = Step.starting
    private var flow: VerificationFlow?
    private var subscription: Subscription?
    private var begun = false
    private var accepted = false
    private var sasStarted = false
    private var sasAccepted = false

    init(_ start: Start) {
        self.start = start
        if case .incoming(let flow) = start {
            step = .incoming(otherUser: flow.otherUserId, isSelf: flow.isSelfVerification)
        }
    }

    func begin(client: WizardClient?) async {
        guard !begun else { return }
        begun = true
        do {
            let flow: VerificationFlow
            switch start {
            case .ownDevice:
                guard let client else { throw WizardError.notSignedIn }
                flow = try await client.requestSelfVerification()
            case .device(let deviceId):
                guard let client else { throw WizardError.notSignedIn }
                flow = try await client.requestDeviceVerification(deviceId: deviceId)
            case .user(let userId):
                guard let client else { throw WizardError.notSignedIn }
                flow = try await client.requestUserVerification(userId: userId)
            case .incoming(let incoming):
                flow = incoming
            }
            self.flow = flow
            subscription = flow.watch { [weak self] status in
                MainActor.assumeIsolated { self?.update(status) }
            }
        } catch {
            step = .failed(error.localizedDescription)
        }
    }

    func accept() {
        accepted = true
        step = .waitingForEmojis
        run { try await $0.accept() }
    }

    private func update(_ status: VerificationStatus) {
        switch status {
        case .requested:
            step = .waitingForOtherDevice
        case .incoming(let incoming):
            // Waits for Accept; a request you started never arrives as incoming
            if !accepted { step = .incoming(otherUser: incoming.otherUser, isSelf: incoming.isSelf) }
        case .ready:
            step = .waitingForEmojis
            // The side that sent the request starts comparing; answering one, wait for it
            if case .incoming = start { return }
            guard !sasStarted else { return }
            sasStarted = true
            run { try await $0.startSas() }
        case .sasIncoming:
            step = .waitingForEmojis
            guard !sasAccepted else { return }
            sasAccepted = true
            run { try await $0.acceptSas() }
        case .sasStarted, .confirmed: step = .waitingForEmojis
        case .emojis(let sas): step = .compare(sas.emojis)
        case .done: step = .done
        case .cancelled(let cancelled):
            if case .done = step { return }
            step = cancelled.reason.isEmpty ? .cancelled : .failed(cancelled.reason)
        }
    }

    private func run(_ action: @escaping (VerificationFlow) async throws -> Void) {
        guard let flow else { return }
        Task {
            do { try await action(flow) } catch {
                step = .failed(error.localizedDescription)
            }
        }
    }

    func confirm(_ matches: Bool) async {
        do {
            if matches { try await flow?.confirm() } else { try await flow?.mismatch() }
        } catch {
            step = .failed(error.localizedDescription)
        }
    }

    func cancel() async {
        if case .done = step {} else { try? await flow?.cancel() }
        subscription?.cancel()
    }
}

struct VerificationSheet: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: VerificationModel

    private var title: String {
        if case .ownDevice = model.start { return String(localized: "settings.encryption.verifyWithDevice") }
        if case .user = model.start { return String(localized: "verification.verifyUser") }
        return String(localized: "verification.verifyDevice")
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: WZ.Space.space6) {
                switch model.step {
                case .starting, .waitingForOtherDevice:
                    ProgressView().tint(theme.accent)
                    Group {
                        if case .user(let userId) = model.start {
                            Text(L10n.format("verification.waitingFor", userId))
                        } else if case .ownDevice = model.start {
                            Text(String(localized: "verification.otherDeviceHint"))
                        } else {
                            Text(String(localized: "verification.waitingForOther"))
                        }
                    }
                    .multilineTextAlignment(.center)
                case .incoming(let otherUser, let isSelf):
                    Image("ph-shield-warning-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.warningColor)
                    Text(isSelf ? L10n.format("verification.newSignInDetected", otherUser)
                                : L10n.format("verification.verificationRequestFrom", otherUser))
                        .multilineTextAlignment(.center)
                    HStack(spacing: WZ.Space.space4) {
                        Button(String(localized: "common.decline")) {
                            Task { await model.cancel() }
                            dismiss()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        Button(String(localized: "common.accept")) { model.accept() }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                case .waitingForEmojis:
                    ProgressView().tint(theme.accent)
                    Text(String(localized: "verification.waitingForOtherDevice"))
                case .compare(let emojis):
                    if case .user(let userId) = model.start {
                        Text(L10n.format("verification.compareEmojisUser", userId))
                            .multilineTextAlignment(.center)
                    } else {
                        Text(String(localized: "verification.compareEmojis"))
                            .multilineTextAlignment(.center)
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: WZ.Space.space5) {
                        ForEach(Array(emojis.enumerated()), id: \.offset) { _, emoji in
                            VStack(spacing: WZ.Space.space2) {
                                Text(emoji.symbol).font(.system(size: WZ.SizeIcon.xl))
                                Text(emoji.description)
                                    .font(.wizard(WZ.FontSize.xs))
                                    .foregroundStyle(theme.textMuted)
                                    .lineLimit(1)
                            }
                        }
                    }
                    HStack(spacing: WZ.Space.space4) {
                        Button(String(localized: "verification.theyDontMatch")) { Task { await model.confirm(false) } }
                            .buttonStyle(SecondaryButtonStyle())
                        Button(String(localized: "verification.theyMatch")) { Task { await model.confirm(true) } }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                case .done:
                    Image("ph-shield-check-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.success)
                    if case .user(let userId) = model.start {
                        Text(L10n.format("verification.deviceVerified", userId)).font(.wizard(WZ.FontSize.lg, .bold))
                    } else {
                        Text(String(localized: "common.verified")).font(.wizard(WZ.FontSize.lg, .bold))
                    }
                    Button(String(localized: "common.done")) { dismiss() }.buttonStyle(PrimaryButtonStyle())
                case .failed(let message):
                    Image("ph-x-circle-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.error)
                    Text(message).multilineTextAlignment(.center)
                case .cancelled:
                    Text(String(localized: "verification.cancelled"))
                }
                Spacer()
            }
            .font(.wizard(WZ.FontSize.md))
            .foregroundStyle(theme.textPrimary)
            .padding(WZ.Space.space7)
            .frame(maxWidth: .infinity)
            .background(theme.bgSecondary)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) {
                        Task { await model.cancel() }
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(isWaitingOnYou)
        .task { await model.begin(client: session.client) }
    }

    /// Swiping away mid-comparison would leave the other device waiting, so Cancel is the way out
    private var isWaitingOnYou: Bool {
        switch model.step {
        case .incoming, .compare: return true
        default: return false
        }
    }
}

@MainActor
final class VerificationRequests: ObservableObject {
    @Published var presented: VerificationModel?
    private var subscription: Subscription?

    func start(client: WizardClient) {
        subscription = client.watchVerificationRequests { [weak self] flow in
            MainActor.assumeIsolated { self?.received(flow) }
        }
    }

    func stop() {
        subscription?.cancel()
        subscription = nil
        presented = nil
    }

    private func received(_ flow: VerificationFlow) {
        // Only the first status counts: whether the request is still waiting for an answer
        let first = FirstStatus()
        first.subscription = flow.watch { [weak self] status in
            MainActor.assumeIsolated {
                guard !first.seen else { return }
                first.seen = true
                first.subscription?.cancel()
                guard let self, case .incoming = status, self.presented == nil else { return }
                self.presented = VerificationModel(.incoming(flow))
            }
        }
    }

    private final class FirstStatus: @unchecked Sendable {
        var seen = false
        var subscription: Subscription?
    }
}
