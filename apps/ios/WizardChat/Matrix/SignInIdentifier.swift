import Foundation
import WizardChatCore

/// What someone typed into the sign-in box; `signInIdentifier.ts` in Swift
enum SignInIdentifier: Equatable {
    case user(String)
    case mxid(String)
    case email(String)
    case phone(String)

    var isEmailOrPhone: Bool {
        switch self {
        case .email, .phone: return true
        case .user, .mxid: return false
        }
    }

    func toCore() -> LoginIdentifier {
        switch self {
        case .email(let address): return .email(.init(address: address))
        case .phone(let number): return .phone(.init(number: number))
        case .user(let user): return .user(.init(user: user))
        case .mxid(let user): return .user(.init(user: user))
        }
    }

    private static let emailPattern = "^[^\\s@:]+@[^\\s@:]+\\.[^\\s@:]{2,}$"
    private static let mxidPattern = "^@[^:\\s]+:[^\\s]+$"
    private static let phoneCharsPattern = "^\\+?[0-9\\s().-]{7,24}$"

    private static func matches(_ pattern: String, _ value: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }

    private static func digits(_ value: String) -> String {
        String(value.filter { ("0"..."9").contains($0) })
    }

    /// Only input that clearly looks like a phone number counts as one: a leading `+`, or
    /// formatting around plenty of digits. A bare run of digits is a valid username.
    private static func looksLikePhone(_ value: String) -> Bool {
        guard matches(phoneCharsPattern, value) else { return false }
        let count = digits(value).count
        if value.hasPrefix("+") { return (7...15).contains(count) }
        let formatted = value.contains { $0.isWhitespace || $0 == "(" || $0 == ")" || $0 == "-" }
        return formatted && (9...15).contains(count)
    }

    static func parse(_ raw: String) -> SignInIdentifier? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return nil }
        if matches(mxidPattern, value) { return .mxid(value) }
        if matches(emailPattern, value) { return .email(value) }
        if looksLikePhone(value) { return .phone(digits(value)) }
        return .user(value.hasPrefix("@") ? String(value.dropFirst()) : value)
    }

    /// An email on the selected server's own name is a user id written email-style
    static func interpret(_ raw: String, serverName: String) -> SignInIdentifier? {
        let identifier = parse(raw)
        if case .email(let address)? = identifier, !serverName.isEmpty, let at = address.lastIndex(of: "@") {
            let domain = String(address[address.index(after: at)...])
            if domain.lowercased() == serverName.lowercased() {
                return .user(String(address[..<at]))
            }
        }
        return identifier
    }
}
