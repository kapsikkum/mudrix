package org.wizardchat.android.matrix

/**
 * Decides when to tell someone they are alone in a direct call: after the other person left (or never picked up),
 * wait a moment, then count down and hang up unless they stay. The same rules as the web app's AloneNotice.
 */
class AloneTracker(private val graceMs: Long = GRACE_MS, private val countdownMs: Long = COUNTDOWN_MS) {
    sealed interface Phase {
        data object Idle : Phase
        data class Waiting(val until: Long) : Phase
        data class Counting(val endsAt: Long) : Phase
    }

    var phase: Phase = Phase.Idle
        private set
    private var hadOthers = false
    private var dismissed = false

    /** Feeds what the call looks like now; call it whenever it changes */
    fun update(isDirect: Boolean, joined: Boolean, others: Int, ring: CallManager.RingState?, now: Long) {
        if (!isDirect || !joined) {
            phase = Phase.Idle
            hadOthers = false
            dismissed = false
            return
        }
        if (others > 0) {
            hadOthers = true
            dismissed = false
            phase = Phase.Idle
            return
        }
        if (ring == CallManager.RingState.ringing) {
            phase = Phase.Idle
            return
        }
        val unanswered = ring == CallManager.RingState.unanswered || ring == CallManager.RingState.declined
        if (phase == Phase.Idle && !dismissed && (unanswered || hadOthers)) phase = Phase.Waiting(now + graceMs)
    }

    /** Moves on with the clock; true when the countdown ran out and the call should end */
    fun tick(now: Long): Boolean {
        when (val current = phase) {
            is Phase.Waiting -> if (now >= current.until) phase = Phase.Counting(now + countdownMs)
            is Phase.Counting -> if (now >= current.endsAt) {
                phase = Phase.Idle
                dismissed = true
                return true
            }
            Phase.Idle -> Unit
        }
        return false
    }

    /** "Stay": no more notices until someone else joins */
    fun stay() {
        phase = Phase.Idle
        dismissed = true
    }

    fun secondsLeft(now: Long): Int {
        val counting = phase as? Phase.Counting ?: return 0
        return ((counting.endsAt - now + 999) / 1000).toInt().coerceIn(0, (countdownMs / 1000).toInt())
    }

    companion object {
        const val GRACE_MS = 10_000L
        const val COUNTDOWN_MS = 60_000L
    }
}
