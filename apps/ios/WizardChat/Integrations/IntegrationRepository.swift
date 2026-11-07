import Foundation
import WizardChatCore

/// Fetching a repository: repo.json and its detached signature, checked before anything is read from it
enum IntegrationRepository {
    /// Cap on the detached signature file (a 64-byte signature is 88 base64 characters)
    private static let maxSignatureBytes = 1024

    enum UrlResult {
        case ok(String)
        case error(String)
    }

    enum FetchResult {
        case ok(value: RepoManifest, key: String, fingerprint: String, serial: Int, official: Bool)
        case error(String)
    }

    private static func isSafe(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }

    /// Normalises what the user typed into the URL to fetch. A github.com repo URL becomes the raw repo.json at its root.
    /// Rejects http, credentials, ports and local or private hosts.
    static func parseRepoUrl(_ input: String) -> UrlResult {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return .error("Enter a repository URL") }
        if text.count > 500 { return .error("URL is too long") }
        guard let parts = URLComponents(string: text) else { return .error("Not a valid URL") }
        if parts.user != nil || parts.password != nil { return .error("URLs with credentials are not allowed") }
        guard let host = parts.host?.lowercased(), !host.isEmpty else { return .error("Not a valid URL") }
        if parts.scheme?.lowercased() != "https" { return .error("Only https URLs are allowed") }
        if parts.port != nil { return .error("URLs with a port are not allowed") }
        if IntegrationNetwork.isForbiddenHost(host) { return .error("That host is not allowed") }

        if host == "github.com" || host == "www.github.com" {
            let segments = parts.percentEncodedPath.components(separatedBy: "/").filter { !$0.isEmpty }
            let owner = segments.first
            var repo = segments.count > 1 ? segments[1] : nil
            if let name = repo, name.hasSuffix(".git") { repo = String(name.dropLast(4)) }
            guard let owner, let repo, !repo.isEmpty, isSafe(owner, "^[A-Za-z0-9._-]+\\z"), isSafe(repo, "^[A-Za-z0-9._-]+\\z") else {
                return .error("Use https://github.com/<owner>/<repo>")
            }
            var ref = "HEAD"
            if segments.count > 2 {
                if segments[2] != "tree" || segments.count < 4 { return .error("Use https://github.com/<owner>/<repo>[/tree/<ref>]") }
                // Branch names may contain "/", so everything after /tree/ is the ref
                ref = segments.dropFirst(3).joined(separator: "/")
                if !isSafe(ref, "^[A-Za-z0-9._\\-/]+\\z") || ref.components(separatedBy: "/").contains("..") {
                    return .error("Invalid branch or tag name")
                }
            }
            return .ok("https://raw.githubusercontent.com/\(owner)/\(repo)/\(ref)/repo.json")
        }
        var out = "https://" + host + (parts.percentEncodedPath.isEmpty ? "/" : parts.percentEncodedPath)
        if let query = parts.percentEncodedQuery { out += "?" + query }
        return .ok(out)
    }

    /// The one host a repository address talks to (repo.json and its signature); "" if unusable
    static func repoHost(_ url: String) -> String {
        guard case .ok(let fixed) = parseRepoUrl(url) else { return "" }
        return URLComponents(string: fixed)?.host?.lowercased() ?? ""
    }

    /// The detached signature lives next to repo.json: same URL plus ".sig"
    private static func signatureUrl(_ repoUrl: String) -> String? {
        guard let parts = URLComponents(string: repoUrl), let host = parts.host else { return nil }
        var out = "https://" + host + parts.percentEncodedPath + ".sig"
        if let query = parts.percentEncodedQuery { out += "?" + query }
        return out
    }

    /// "Official" needs the official key AND the official address: an old release signed with the official key could otherwise
    /// be hosted anywhere and still wear the badge, frozen in time.
    private static func isOfficialSource(_ url: String, key: String) -> Bool {
        guard IntegrationSignature.isOfficialKey(key), case .ok(let official) = parseRepoUrl(IntegrationSignature.officialRepoURL) else { return false }
        return official == url
    }

    /// Downloads repo.json and repo.json.sig, checks the signature over the exact bytes with the key the file carries, and only
    /// then runs the strict validator. Never throws.
    static func fetch(_ url: String, network: IntegrationNetwork = .shared) async -> FetchResult {
        guard case .ok(let checked) = parseRepoUrl(url) else {
            if case .error(let message) = parseRepoUrl(url) { return .error(message) }
            return .error("Not a valid URL")
        }
        guard let sigUrl = signatureUrl(checked) else { return .error("Not a valid URL") }
        let allow = [repoHost(checked)]
        async let file = network.fetch(IntegrationNetwork.Request(url: checked, allow: allow, expect: .jsonFile, maxBytes: maxManifestBytes))
        async let signature = network.fetch(IntegrationNetwork.Request(url: sigUrl, allow: allow, expect: .signature, maxBytes: maxSignatureBytes))
        let (res, sigRes) = await (file, signature)
        guard case .success(let body) = res else {
            if case .failure(let failure) = res { return .error(failure.error) }
            return .error("could not load the file")
        }
        guard case .success(let sig) = sigRes else {
            let error: String
            if case .failure(let failure) = sigRes { error = failure.error } else { error = "unknown error" }
            if error.hasSuffix(" answered 404") { return .error("This repository is not signed, so it cannot be added.") }
            return .error("Could not load the signature file: \(error)")
        }
        guard let json = body.json, let keyField = json["key"]?.string, IntegrationSignature.isValidKey(keyField) else {
            return .error("The repository carries a malformed or missing signing key.")
        }
        if case .failed(let message, _) = IntegrationSignature.verify(body.bytes, signature: sig.text ?? "", key: keyField) { return .error(message) }
        switch IntegrationManifest.validate(json) {
        case .invalid(let message): return .error(message)
        case .valid(let manifest):
            let fingerprint = IntegrationSignature.fingerprint(manifest.key)
            if fingerprint.isEmpty { return .error("This device cannot compute the key fingerprint.") }
            return .ok(value: manifest, key: manifest.key, fingerprint: fingerprint, serial: manifest.serial,
                       official: isOfficialSource(url, key: manifest.key))
        }
    }
}
