package chat.mudrix.android.ui.login

/**
 * The sign-in server step's rules, as the web's `ServerPicker`/`useHomeserver` have them: a folded line
 * naming the server, an address box when it is opened, and the popular servers one tap away.
 */
object ServerStep {
    /** The popular servers, like the web's `PRESET_SERVERS` */
    val POPULAR = listOf("https://matrix.org", "https://mozilla.org", "https://unredacted.org")

    /** What the line under the address says; the UI maps it to text */
    enum class State { empty, checking, ok, notMatrix, unreachable }

    /** The address to ask discovery with: as typed, with `https://` when it names no scheme */
    fun address(input: String): String {
        val trimmed = input.trim()
        return if (trimmed.isEmpty() || "://" in trimmed) trimmed else "https://$trimmed"
    }

    /** The host of an address, lower-cased, without a scheme, port or path ("matrix.org") */
    fun host(input: String): String {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return ""
        val withScheme = if ("://" in trimmed) trimmed else "https://$trimmed"
        val authority = withScheme.substringAfter("://").substringBefore('/').substringAfter('@')
        return (if (authority.startsWith("[")) authority else authority.substringBefore(':')).lowercase()
    }

    /** True when the typed address is one of the popular servers */
    fun isPopular(input: String): Boolean {
        val host = host(input)
        return host.isNotEmpty() && POPULAR.any { host(it) == host }
    }

    /** The status line for the address as typed and what discovery found */
    fun state(input: String, checking: Boolean, found: Boolean, notMatrix: Boolean, unreachable: Boolean): State = when {
        input.trim().isEmpty() -> State.empty
        checking -> State.checking
        found -> State.ok
        notMatrix -> State.notMatrix
        unreachable -> State.unreachable
        else -> State.checking
    }
}
