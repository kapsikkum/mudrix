import Foundation

/// The rules of the room key export and import: passphrase checks and which notice a failure gets
enum RoomKeyFiles {
    /// Why a passphrase can't be used for an export, as a locale key; nil when it is fine
    static func exportProblem(passphrase: String, confirm: String) -> String? {
        if passphrase.isEmpty { return "settings.roomKeys.passphrase" }
        if passphrase != confirm { return "settings.roomKeys.passphraseMismatch" }
        return nil
    }

    /// The notice for an import that failed, from what the core says about the file; nil when unknown
    static func importErrorKey(_ message: String?) -> String? {
        guard let text = message?.lowercased() else { return nil }
        if text.contains("version") { return "settings.roomKeys.error_version" }
        if text.contains("rounds") { return "settings.roomKeys.error_rounds" }
        if ["mac", "decrypt", "password", "passphrase"].contains(where: text.contains) { return "settings.roomKeys.error_password" }
        if ["format", "header", "base64", "json"].contains(where: text.contains) { return "settings.roomKeys.error_format" }
        return nil
    }
}
