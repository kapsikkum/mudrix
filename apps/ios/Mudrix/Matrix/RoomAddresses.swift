import Foundation

/// A room's or space's addresses (`#name:server`): which are shown, and the lists a change sends. The same rules
/// as the web's `useRoomAliases.ts` and Android's `matrix/RoomAddresses.kt`.
enum RoomAddresses {
    /// `#name:server`, as the web's `isValidAlias`
    static func isValid(_ alias: String) -> Bool {
        alias.trimmingCharacters(in: .whitespaces)
            .range(of: "^#[A-Za-z0-9.\\-_/=]+:[A-Za-z0-9.\\-_]+$", options: .regularExpression) != nil
    }

    /// The addresses that are not the main one: published alternatives and the ones in the server's directory
    static func others(canonical: String?, alt: [String], local: [String]) -> [String] {
        unique(alt + local).filter { $0 != canonical }
    }

    /// The alternative addresses after adding `alias` (unchanged when it is already the main or an alternative one)
    static func altAfterAdd(canonical: String?, alt: [String], alias: String) -> [String] {
        alias == canonical || alt.contains(alias) ? alt : alt + [alias]
    }

    /// The main and alternative addresses after removing `alias`
    static func afterRemove(canonical: String?, alt: [String], alias: String) -> (main: String?, alt: [String]) {
        (canonical == alias ? nil : canonical, alt.filter { $0 != alias })
    }

    /// The main and alternative addresses after making `alias` the main one: the old main one stays as an alternative
    static func afterSetMain(canonical: String?, alt: [String], alias: String) -> (main: String, alt: [String]) {
        let old = canonical.map { [$0] }?.filter { $0 != alias } ?? []
        return (alias, unique(old + alt.filter { $0 != alias }))
    }

    private static func unique(_ list: [String]) -> [String] {
        var seen = Set<String>()
        return list.filter { seen.insert($0).inserted }
    }
}
