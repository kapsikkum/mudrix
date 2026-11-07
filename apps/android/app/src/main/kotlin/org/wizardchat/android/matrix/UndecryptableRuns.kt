package org.wizardchat.android.matrix

/** `undecryptable.ts` of the web: which runs of unreadable messages fold into one row, and what to tell the reader */
object UndecryptableRuns {
    /** Runs of at least this many consecutive unreadable messages are folded into one row */
    const val THRESHOLD = 3

    /** [count] unreadable messages in a row, of which this one is the oldest when [isFirst] */
    data class Run(val count: Int, val isFirst: Boolean)

    /** For each position, the run it belongs to; null where the message is readable */
    fun compute(unreadable: List<Boolean>): List<Run?> {
        val runs = arrayOfNulls<Run>(unreadable.size)
        var start = -1
        fun flush(end: Int) {
            if (start < 0) return
            for (index in start until end) runs[index] = Run(end - start, index == start)
            start = -1
        }
        unreadable.forEachIndexed { index, bad ->
            if (bad) {
                if (start < 0) start = index
            } else {
                flush(index)
            }
        }
        flush(unreadable.size)
        return runs.toList()
    }

    enum class HelpKind { notJoined, withheld, senderUntrusted, unverified, noBackup, waiting }

    /**
     * What to tell someone whose message cannot be read. Some causes nothing here can fix; for the rest the first
     * thing to look at is whether this session is verified (an unverified one is not given the keys), then whether a
     * backup exists at all.
     */
    fun helpKind(reason: String?, sessionVerified: Boolean): HelpKind {
        when (reason) {
            "sentBeforeWeJoined" -> return HelpKind.notJoined
            "withheldBySender" -> return HelpKind.withheld
            "verificationViolation", "unsignedDevice", "unknownDevice" -> return HelpKind.senderUntrusted
        }
        if (!sessionVerified) return HelpKind.unverified
        return if (reason == "historicalMessageAndBackupIsDisabled") HelpKind.noBackup else HelpKind.waiting
    }
}
