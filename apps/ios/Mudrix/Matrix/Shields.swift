import Foundation
import MudrixCore

/// How a message's encryption shield looks, as the web app's shield.ts decides it: grey for what can't be
/// guaranteed, a warning for a red SDK shield (unverified sender), and the strongest red for a message sent
/// unencrypted into an encrypted room. Nil when the message has no shield.
enum Shields {
    enum Kind: Equatable { case grey, warning, red }

    struct Display: Equatable {
        let kind: Kind
        /// Locale key of the reason shown when the shield is tapped
        let reasonKey: String
    }

    static func reasonKey(_ code: ShieldCode) -> String {
        switch code {
        case .authenticityNotGuaranteed: "encryption.shield.authenticity"
        case .unknownDevice: "encryption.shield.unknownDevice"
        case .unsignedDevice: "encryption.shield.unsignedDevice"
        case .unverifiedIdentity: "encryption.shield.unverifiedIdentity"
        case .verificationViolation: "encryption.shield.violation"
        case .mismatchedSender: "encryption.shield.mismatchedSender"
        case .sentInClear: "encryption.shield.sentInClear"
        }
    }

    static func display(_ shield: ShieldView?) -> Display? {
        guard let shield else { return nil }
        let key = reasonKey(shield.code)
        if shield.code == .sentInClear { return Display(kind: .red, reasonKey: key) }
        return Display(kind: shield.color == .red ? .warning : .grey, reasonKey: key)
    }

    /// What the Modern and Compact layouts draw beside a message's text: only a real warning. A grey shield
    /// means the app cannot vouch for the sender's device (an unverified session), which the app already says
    /// elsewhere, so it is not drawn on every line.
    static func inlineWarning(_ display: Display?) -> Display? {
        guard let display, display.kind != .grey else { return nil }
        return display
    }
}
