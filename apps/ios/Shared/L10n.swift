import Foundation

enum L10n {
    static func format(_ key: String, _ args: CVarArg...) -> String {
        String(format: NSLocalizedString(key, comment: ""), locale: .current, arguments: args)
    }

    /// A plural: a text that shows its count is one catalog entry under key that picks its own form; one that does
    /// not stays as separate key_one / key_other entries (packages/i18n/scripts/build.mjs)
    static func plural(_ key: String, count: Int, _ args: CVarArg...) -> String {
        let form = count == 1 ? "one" : "other"
        let separate = NSLocalizedString("\(key)_\(form)", comment: "")
        if separate != "\(key)_\(form)" {
            return String(format: separate, locale: .current, arguments: args)
        }
        return String(format: NSLocalizedString(key, comment: ""), locale: .current, arguments: args)
    }

    /// A key with its arguments in a list, for text whose arguments are only known at run time
    static func args(_ key: String, _ values: [String]) -> String {
        String(format: NSLocalizedString(key, comment: ""), locale: .current, arguments: values)
    }

    static func plain(_ key: String, _ args: CVarArg...) -> String {
        String(format: NSLocalizedString(key, comment: ""), locale: .current, arguments: args)
            .replacingOccurrences(of: "</?[a-zA-Z]+>", with: "", options: .regularExpression)
    }
}
