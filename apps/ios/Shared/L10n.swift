import Foundation

enum L10n {
    static func format(_ key: String, _ args: CVarArg...) -> String {
        String(format: NSLocalizedString(key, comment: ""), locale: .current, arguments: args)
    }

    static func plural(_ key: String, count: Int, _ args: CVarArg...) -> String {
        let form = count == 1 ? "one" : "other"
        return String(format: NSLocalizedString("\(key)_\(form)", comment: ""), locale: .current, arguments: args)
    }

    static func plain(_ key: String, _ args: CVarArg...) -> String {
        String(format: NSLocalizedString(key, comment: ""), locale: .current, arguments: args)
            .replacingOccurrences(of: "</?[a-zA-Z]+>", with: "", options: .regularExpression)
    }
}
