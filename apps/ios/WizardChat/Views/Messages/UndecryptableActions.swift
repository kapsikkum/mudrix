import SwiftUI
import WizardChatCore

/// Restoring keys from the backup, which reports its progress room by room
@MainActor
final class KeyRestoreModel: ObservableObject {
    @Published private(set) var progress: KeyRestoreProgress?

    func restore(with client: WizardClient) async throws -> KeyRestoreProgress {
        progress = KeyRestoreProgress(roomsDone: 0, roomsTotal: 0, keysRestored: 0)
        defer { progress = nil }
        return try await client.restoreKeyBackup { [weak self] update in
            MainActor.assumeIsolated { self?.progress = update }
        }
    }
}

/// An unreadable message's "Try again" and, when this device can read the key backup, "Restore from key backup"
struct UndecryptableActions: View {
    let roomId: String
    let reason: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @StateObject private var restoring = KeyRestoreModel()
    @State private var backupReadable = false
    @State private var retrying = false

    /// Reasons a retry can help: a key may arrive from the backup or another session. A message sent
    /// before this device joined, held back by the sender or from an untrusted sender can't be recovered by trying.
    static func canRetry(_ reason: String) -> Bool {
        switch reason {
        case "sentBeforeWeJoined", "verificationViolation", "withheldForUnverifiedOrInsecureDevice", "withheldBySender":
            return false
        default:
            return true
        }
    }

    var body: some View {
        if Self.canRetry(reason) {
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                if let progress = restoring.progress {
                    Text(L10n.format("timeline.undecryptable.restoreProgress", "\(progress.roomsDone)", "\(progress.roomsTotal)"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
                HStack(spacing: WZ.Space.space3) {
                    if backupReadable {
                        Button(String(localized: "timeline.undecryptable.restoreBackup")) { Task { await restoreBackup() } }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(restoring.progress != nil)
                    }
                    Button(String(localized: "timeline.undecryptable.retry")) { Task { await retry() } }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(retrying || restoring.progress != nil)
                }
            }
            .task(id: session.encryption?.backupEnabled) {
                // Only a backup whose key is on this device can be restored from
                backupReadable = (try? await session.client?.encryptionStatus().backupEnabled) == true
            }
        }
    }

    private func restoreBackup() async {
        guard let client = session.client else { return }
        do {
            let result = try await restoring.restore(with: client)
            CopyToast.shared.show(L10n.format("timeline.undecryptable.restored", "\(result.keysRestored)"))
        } catch let error as WizardError {
            CopyToast.shared.show(error.code == "noKeyBackup"
                ? String(localized: "timeline.undecryptable.restoreNeedsKey")
                : L10n.format("timeline.undecryptable.restoreFailed", error.message))
        } catch {
            CopyToast.shared.show(L10n.format("timeline.undecryptable.restoreFailed", error.localizedDescription))
        }
    }

    private func retry() async {
        guard let client = session.client else { return }
        retrying = true
        defer { retrying = false }
        do {
            try await client.retryDecryption(roomId: roomId)
        } catch {
            CopyToast.shared.show(L10n.format("timeline.undecryptable.retryFailed", error.localizedDescription))
        }
    }
}
