package org.wizardchat.android.matrix

/** Plain-text emoticons turned into Unicode emoji on send; the same table and rules as the web's `util/emoticons.ts` */
object Emoticons {
    private val table = mapOf(
        ":)" to "🙂",
        ":-)" to "🙂",
        "(:" to "🙂",
        ":D" to "😃",
        ":-D" to "😃",
        "XD" to "😆",
        "xD" to "😆",
        ":(" to "🙁",
        ":-(" to "🙁",
        ":'(" to "😢",
        ":P" to "😛",
        ":-P" to "😛",
        ":p" to "😛",
        ";)" to "😉",
        ";-)" to "😉",
        ":O" to "😮",
        ":-O" to "😮",
        ":o" to "😮",
        ":/" to "😕",
        ":-/" to "😕",
        ":|" to "😐",
        ":-|" to "😐",
        ":*" to "😘",
        ":-*" to "😘",
        "B)" to "😎",
        "8)" to "😎",
        ">:(" to "😠",
        "<3" to "❤️",
        "</3" to "💔",
    )

    // A token only counts when whitespace or the start of the text comes before it and whitespace, the end,
    // or sentence punctuation comes after, so "http://x", "a:D" and "(:" inside words are left alone.
    private val emoticon = Regex(
        "(^|\\s)(" + table.keys.sortedByDescending { it.length }.joinToString("|") { Regex.escape(it) } + ")(?=$|\\s|[.,!?;])",
    )
    private val inlineCode = Regex("(`[^`]*`)")

    /** [text] with its emoticons replaced, except inside inline code */
    fun replaceInText(text: String): String {
        val parts = inlineCode.split(text)
        val codes = inlineCode.findAll(text).map { it.value }.toList()
        val out = StringBuilder()
        parts.forEachIndexed { index, part ->
            out.append(emoticon.replace(part) { match -> match.groupValues[1] + table.getValue(match.groupValues[2]) })
            codes.getOrNull(index)?.let(out::append)
        }
        return out.toString()
    }

    /** A message with its emoticons replaced, except inside inline code and fenced code blocks */
    fun replaceInMessage(message: String): String {
        var inFence = false
        return message.split("\n").joinToString("\n") { line ->
            if (line.trim().startsWith("```")) {
                inFence = !inFence
                line
            } else if (inFence) {
                line
            } else {
                replaceInText(line)
            }
        }
    }
}
