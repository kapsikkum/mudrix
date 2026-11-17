package chat.mudrix.android.media

/** Which in-app preview suits an attachment (the web's FilePreviewModal rules) */
enum class FilePreviewKind { pdf, text }

object FilePreview {
    /** The preview reads at most this much of a text file */
    const val MAX_TEXT_BYTES = 2 * 1024 * 1024

    /** Zoom steps of the PDF preview: multiples of the screen width */
    val PDF_ZOOMS = listOf(1f, 1.5f, 2f, 3f)

    fun kind(filename: String, mimetype: String?): FilePreviewKind? = when {
        mimetype == "application/pdf" || filename.endsWith(".pdf", ignoreCase = true) -> FilePreviewKind.pdf
        TextFile.isTextLike(filename, mimetype) -> FilePreviewKind.text
        else -> null
    }

    /** The start of a text file up to [MAX_TEXT_BYTES], without a character cut in half */
    fun decodeText(bytes: ByteArray): String = TextFile.decodeHead(bytes, MAX_TEXT_BYTES)

    /** Pixel height of a PDF page shown [width] pixels wide */
    fun pageHeight(width: Int, pageWidth: Int, pageHeight: Int): Int =
        if (pageWidth <= 0) width else (width.toLong() * pageHeight / pageWidth).toInt().coerceAtLeast(1)

    /** The next zoom step, wrapping back to 1x after the last */
    fun nextZoom(current: Float): Float {
        val index = PDF_ZOOMS.indexOfFirst { it > current + 0.01f }
        return if (index < 0) PDF_ZOOMS.first() else PDF_ZOOMS[index]
    }
}
