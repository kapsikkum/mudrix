import Foundation

/// Which attachments are small text files, and how much of one a card reads: the web's
/// `FilePreviewModal` rules and Android's `media/TextFile.kt`.
enum TextFile {
    private static let textExtensions: Set<String> = ["md", "markdown", "txt", "log", "json", "csv"]

    /// Larger files stay a plain file row
    static let cardMaxBytes = 5 * 1024 * 1024

    /// The card only reads the start of a file
    static let previewBytes = 64 * 1024

    /// Copying takes at most this much of a larger file
    static let maxCardCharacters = 200_000

    private static func fileExtension(_ filename: String) -> String {
        (filename as NSString).pathExtension.lowercased()
    }

    /// Whether a file is text rather than a PDF or binary; the web checks the PDF rule first
    static func isTextLike(filename: String, mimetype: String?) -> Bool {
        let ext = fileExtension(filename)
        if mimetype == "application/pdf" || ext == "pdf" { return false }
        if textExtensions.contains(ext) { return true }
        return mimetype?.hasPrefix("text/") == true
    }

    /// Whether a file is shown as a text card (a small text file) rather than a plain file row
    static func showsCard(filename: String, mimetype: String?, size: Int?) -> Bool {
        isTextLike(filename: filename, mimetype: mimetype) && (size == nil || (size ?? 0) <= cardMaxBytes)
    }

    /// The first `limit` bytes as UTF-8, dropping a character the limit cut in half
    static func decodeHead(_ bytes: Data, limit: Int = previewBytes) -> String {
        let head = bytes.count <= limit ? bytes : bytes.prefix(limit)
        var text = String(decoding: head, as: UTF8.self)
        if head.count < bytes.count, text.hasSuffix("\u{FFFD}") { text.removeLast() }
        return text
    }

    /// The whole text capped for an expanded card
    static func clampForCard(_ text: String) -> String {
        text.count <= maxCardCharacters ? text : String(text.prefix(maxCardCharacters))
    }
}
