package chat.mudrix.android.util

import java.util.UUID

/**
 * Longest name [safeFileName] returns, in UTF-8 bytes. Leaves room for a caller's own prefix
 * (`ShareActivity` puts a UUID in front) inside the 255-byte limit of Android's filesystems.
 */
const val MAX_SAFE_FILE_NAME_BYTES = 200

private val REPEATED_DOTS = Regex("\\.{2,}")
private const val GENERATED_BASE = "attachment"

/**
 * Turns a name that came from outside the app (a content provider's `DISPLAY_NAME`, a share
 * intent, a download) into one safe file name.
 *
 * The result is always a single path component: no `/` or `\`, no control characters, no `..`,
 * never `.`, `..` or empty. Anything that cannot be used gets a generated name. When the name is
 * shortened to [maxBytes], the extension is kept.
 */
fun safeFileName(name: String, maxBytes: Int = MAX_SAFE_FILE_NAME_BYTES): String {
    val limit = maxBytes.coerceAtLeast(1)
    val component = name
        .filterNot { it.isISOControl() }
        .substringAfterLast('/')
        .substringAfterLast('\\')
        .trim()
        // A `..` left in the middle cannot traverse without a separator, but never emit one
        .replace(REPEATED_DOTS, ".")
    if (component.isEmpty() || component == ".") return generated(limit)

    if (component.utf8Size() <= limit) return component

    val dot = component.lastIndexOf('.')
    val extension = if (dot > 0 && dot < component.length - 1) component.substring(dot) else ""
    val base = if (extension.isEmpty()) component else component.substring(0, dot)
    val extensionBytes = extension.utf8Size()
    if (extensionBytes >= limit) return truncate(component, limit).ifEmpty { generated(limit) }

    val budget = limit - extensionBytes
    val head = truncate(base, budget).trimEnd(' ', '.')
    return if (head.isEmpty()) truncate(GENERATED_BASE + "-" + UUID.randomUUID(), budget) + extension else head + extension
}

private fun generated(maxBytes: Int): String =
    truncate(GENERATED_BASE + "-" + UUID.randomUUID(), maxBytes).ifEmpty { "file" }

/** Cuts [value] to at most [maxBytes] UTF-8 bytes without splitting a character */
private fun truncate(value: String, maxBytes: Int): String {
    if (value.utf8Size() <= maxBytes) return value
    val out = StringBuilder()
    var bytes = 0
    var index = 0
    while (index < value.length) {
        val codePoint = value.codePointAt(index)
        val length = String(Character.toChars(codePoint)).utf8Size()
        if (bytes + length > maxBytes) break
        out.appendCodePoint(codePoint)
        bytes += length
        index += Character.charCount(codePoint)
    }
    return out.toString()
}

private fun String.utf8Size(): Int = encodeToByteArray().size
