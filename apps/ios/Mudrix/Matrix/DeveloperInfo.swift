import Foundation
import MudrixCore

/// The text "Copy debug info" puts on the clipboard: the session, the sync and encryption state and what the
/// server supports, never the access token (Android's `debugInfo`). The labels stay in English, as they do there:
/// this is a report for whoever reads the issue, not part of the interface.
enum DeveloperInfo {
    struct Snapshot {
        var userId: String?
        var deviceId: String?
        var homeserver: String?
        var version: String
        var syncState: String
        var joined: Int
        var invited: Int
        var encryption: EncryptionStatus?
        var features: ServerFeatures?
    }

    static func text(_ snapshot: Snapshot) -> String {
        var lines: [String] = [
            "User ID: \(snapshot.userId ?? "-")",
            "Device ID: \(snapshot.deviceId ?? "-")",
            "Homeserver: \(snapshot.homeserver ?? "-")",
            "App version: \(snapshot.version)",
            "Sync state: \(snapshot.syncState)",
            "Rooms: \(snapshot.joined) joined, \(snapshot.invited) invited",
        ]
        if let encryption = snapshot.encryption {
            lines.append("Cross-signing: \(encryption.crossSigningComplete)")
            lines.append("Recovery: \(encryption.recovery)")
            lines.append("Key backup: \(encryption.backupEnabled)")
            lines.append("Device verified: \(encryption.deviceVerified)")
        }
        if let features = snapshot.features {
            lines.append("Spec versions: \(features.versions.joined(separator: ", "))")
            lines.append("Server features: \(features.unstableFeatures.joined(separator: ", "))")
        }
        return lines.joined(separator: "\n")
    }
}
