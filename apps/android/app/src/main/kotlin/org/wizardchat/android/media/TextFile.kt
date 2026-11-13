package org.wizardchat.android.media

/** Which attachments are small text files, and how much of one a card reads (the web's FilePreviewModal rules) */
object TextFile {
    private val TEXT_EXT = Regex("\\.(md|markdown|txt|log|json|csv)$", RegexOption.IGNORE_CASE)
    private val PDF_EXT = Regex("\\.pdf$", RegexOption.IGNORE_CASE)

    /** Larger files stay a plain file row */
    const val CARD_MAX_BYTES = 5L * 1024 * 1024

    /** The card only reads the start of a file */
    const val PREVIEW_BYTES = 64 * 1024

    /** Copying takes at most this much of a larger file */
    const val MAX_CARD_CHARS = 200_000

    /** Whether a file is text rather than a PDF or binary; the web checks the PDF rule first */
    fun isTextLike(filename: String, mimetype: String?): Boolean {
        if (mimetype == "application/pdf" || PDF_EXT.containsMatchIn(filename)) return false
        return TEXT_EXT.containsMatchIn(filename) || mimetype?.startsWith("text/") == true
    }

    /** Whether a file is shown as a text card (a small text file) rather than a plain file row */
    fun showsCard(filename: String, mimetype: String?, size: Long?): Boolean =
        isTextLike(filename, mimetype) && (size == null || size <= CARD_MAX_BYTES)

    /** The first [limit] bytes as UTF-8, dropping a character the limit cut in half */
    fun decodeHead(bytes: ByteArray, limit: Int = PREVIEW_BYTES): String {
        val head = if (bytes.size <= limit) bytes else bytes.copyOf(limit)
        val text = String(head, Charsets.UTF_8)
        return if (head.size < bytes.size && text.endsWith('\uFFFD')) text.dropLast(1) else text
    }

    /** The whole text capped for an expanded card */
    fun clampForCard(text: String): String =
        if (text.length <= MAX_CARD_CHARS) text else text.substring(0, MAX_CARD_CHARS)
}
