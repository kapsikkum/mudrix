import Combine
import Foundation

/// Whether the app is the newest release. The web asks its own server for the deployed version
/// (`util/versionCheck.ts`); the app is distributed as a build from the repository's releases, so the
/// newest release there is what to compare against, and a newer one is a link to its page (iOS has no
/// in-app updater).
enum AppUpdates {
    static let releasesUrl = URL(string: "https://github.com/kapsikkum/mudrix/releases/latest")!
    static let latestReleaseApiUrl = URL(string: "https://api.github.com/repos/kapsikkum/mudrix/releases/latest")!

    /// The marketing version this build runs, "0.0.0" in a build without one
    static func currentVersion(bundle: Bundle = .main) -> String {
        version(from: bundle.infoDictionary)
    }

    /// The version in a bundle's information, "0.0.0" when it names none
    static func version(from info: [String: Any]?) -> String {
        let version = info?["CFBundleShortVersionString"] as? String ?? ""
        return version.isEmpty ? "0.0.0" : version
    }

    /// `v26.12.2` as `26.12.2`; a version without a prefix is left as it is
    static func tidy(_ version: String) -> String {
        let trimmed = version.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("v") || trimmed.hasPrefix("V") else { return trimmed }
        return String(trimmed.dropFirst())
    }

    /// The web compares the running version with the newest one and treats any difference as newer
    /// (`isNewerVersion`)
    static func isNewer(current: String, latest: String) -> Bool {
        tidy(current) != tidy(latest)
    }

    /// The version of a release, from GitHub's release JSON: `tag_name`, else `name`
    static func latestVersion(fromRelease json: Data) -> String? {
        guard let object = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any] else { return nil }
        let tag = [object["tag_name"] as? String, object["name"] as? String]
            .compactMap { $0 }
            .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard let tag else { return nil }
        let version = tidy(tag)
        return version.isEmpty ? nil : version
    }

    /// The newest release's version, or nil when GitHub cannot be asked
    static func newestVersion(timeout: TimeInterval = 15) async -> String? {
        var request = URLRequest(url: latestReleaseApiUrl)
        request.timeoutInterval = timeout
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return latestVersion(fromRelease: data)
    }

    /// What the check found, from the running version
    static func outcome(current: String) async -> AppUpdateState {
        guard let latest = await newestVersion() else { return .failed }
        return isNewer(current: current, latest: latest) ? .available(latest) : .upToDate
    }
}

/// What the "Check for updates" row in Settings > About shows
enum AppUpdateState: Equatable {
    case idle
    case checking
    case upToDate
    /// The newest release's version
    case available(String)
    case failed
}

/// Runs one update check at a time and keeps its result for the About page
@MainActor
final class AppUpdateModel: ObservableObject {
    @Published private(set) var state: AppUpdateState = .idle

    func check() async {
        guard state != .checking else { return }
        state = .checking
        state = await AppUpdates.outcome(current: AppUpdates.currentVersion())
    }
}
