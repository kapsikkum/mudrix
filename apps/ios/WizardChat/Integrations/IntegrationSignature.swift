import CryptoKit
import Foundation

/// Repository signatures. repo.json is signed (Ed25519, detached, over its exact bytes) with the key it carries in its own
/// `key` field. That key is then pinned per repository by the user (trust on first use), except the official repository's
/// key, which is built into the app. Nothing here ever falls back to accepting: any failure is a rejection. Nothing throws.
/// `signature.ts` and `officialKeys.ts` of the web, `IntegrationSignature.kt` on Android (CryptoKit has Ed25519 on iOS 13+).
enum IntegrationSignature {
    static let keyBytes = 32
    static let signatureBytes = 64
    static let maxSerial = 2_147_483_647

    /// The official integrations repository, offered by default
    static let officialRepoURL = "https://github.com/kapsikkum/mudrix-integrations"

    /// Ed25519 public keys (standard base64 of the raw 32 bytes) that count as "official". A list so a key can be rotated.
    static let officialKeys = ["AcV0kn9xQsh7H9G76k7cDoJWRAeAjhhqUTnc2hHw85A="]

    enum Result: Equatable {
        case ok
        case failed(String, keyChanged: Bool = false)

        var isOK: Bool { self == .ok }
    }

    /// Strict standard base64 (padding required). Nil when malformed.
    static func base64ToBytes(_ text: String) -> Data? {
        guard text.utf8.count % 4 == 0 else { return nil }
        var padding = 0
        for scalar in text.unicodeScalars {
            let v = scalar.value
            let letter = (0x41...0x5A).contains(v) || (0x61...0x7A).contains(v) || (0x30...0x39).contains(v) || v == 0x2B || v == 0x2F
            if letter {
                if padding > 0 { return nil }
            } else if v == 0x3D {
                padding += 1
                if padding > 2 { return nil }
            } else {
                return nil
            }
        }
        return Data(base64Encoded: text)
    }

    /// True when the text is base64 of exactly 32 bytes
    static func isValidKey(_ keyB64: String) -> Bool {
        keyB64.count == 44 && base64ToBytes(keyB64)?.count == keyBytes
    }

    /// SHA-256 of the raw key, first 16 bytes as 8 groups of 4 lowercase hex digits. Empty when unusable.
    static func fingerprint(_ keyB64: String) -> String {
        guard let raw = base64ToBytes(keyB64), raw.count == keyBytes else { return "" }
        let digest = Array(SHA256.hash(data: raw).prefix(16))
        let hex = digest.map { String(format: "%02x", $0) }.joined()
        var groups: [String] = []
        var index = hex.startIndex
        while index < hex.endIndex {
            let end = hex.index(index, offsetBy: 4)
            groups.append(String(hex[index..<end]))
            index = end
        }
        return groups.joined(separator: " ")
    }

    static func verify(_ bytes: Data, signature sigText: String, key keyB64: String) -> Result {
        guard keyB64.count == 44, let key = base64ToBytes(keyB64), key.count == keyBytes else {
            return .failed("The repository carries a malformed signing key.")
        }
        guard let sig = base64ToBytes(sigText.trimmingCharacters(in: .whitespacesAndNewlines)), sig.count == signatureBytes else {
            return .failed("The signature file is malformed.")
        }
        guard let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: key) else {
            return .failed("The repository carries a malformed signing key.")
        }
        return publicKey.isValidSignature(sig, for: bytes)
            ? .ok
            : .failed("The signature does not match this repository. It may have been tampered with.")
    }

    /// A serial lower than the one already seen is refused (rollback protection)
    static func checkSerial(previous: Int?, next: Int) -> Result {
        if let previous, next < previous { return .failed("This repository is older than the version already seen.") }
        return .ok
    }

    static let keyChangedError = "This repository now uses a different signing key. Remove it and add it again only if you expected that."

    /// Decides whether a freshly fetched, verified repository may replace the pinned one
    static func checkUpdate(previous: (key: String, serial: Int), next: (key: String, serial: Int)) -> Result {
        if previous.key != next.key { return .failed(keyChangedError, keyChanged: true) }
        return checkSerial(previous: previous.serial, next: next.serial)
    }

    static func isOfficialKey(_ keyB64: String) -> Bool {
        officialKeys.contains(keyB64)
    }
}
