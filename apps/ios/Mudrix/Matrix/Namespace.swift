import Foundation

/// Mudrix's namespace for custom Matrix event types, account data, room state and call data
/// topics; the same names as `apps/web/src/util/namespace.ts`.
///
/// Two older families are still read so existing data keeps working: `chat.mudrix.*` (earlier
/// Mudrix versions) and `org.wizardchat.*` (the upstream base this app is forked from). Only the
/// current name is written, except where another device may still need an older one (settings).
/// The upstream names are data compatibility, not branding: this file is the one place on the iOS
/// side that spells them out.
enum Namespace {
    static let mudrix = "io.github.kapsikkum.mudrix"
    private static let legacyMudrix = "chat.mudrix"
    private static let upstream = "org.wizardchat"

    /// The current name of a Mudrix type or key
    static func mudrixKey(_ name: String) -> String { "\(mudrix).\(name)" }

    /// The name earlier Mudrix versions used for it
    static func legacyMudrixKey(_ name: String) -> String { "\(legacyMudrix).\(name)" }

    /// The name the upstream base used for it
    static func upstreamKey(_ name: String) -> String { "\(upstream).\(name)" }
}
