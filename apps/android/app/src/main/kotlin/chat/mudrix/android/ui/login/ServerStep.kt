package chat.mudrix.android.ui.login

import chat.mudrix.android.BuildConfig

/**
 * The sign-in server step's rules, as the web's `ServerPicker`/`useHomeserver` have them: a folded line
 * naming the server, an address box when it is opened, and the popular servers one tap away.
 */
object ServerStep {
    /** The popular servers, like the web's `PRESET_SERVERS` */
    val POPULAR = listOf("https://matrix.org", "https://mozilla.org", "https://unredacted.org")

    /** What the line under the address says; the UI maps it to text */
    enum class State { empty, invalid, checking, ok, notMatrix, unreachable }

    /** A typed scheme (`ftp:`, `mailto:`, ...) or, for a bare `host:port`, none */
    private val SCHEME = Regex("^([A-Za-z][A-Za-z0-9+.-]*):(.*)$", RegexOption.DOT_MATCHES_ALL)

    /**
     * The scheme of an address, in lower case, or null when it names none: `matrix.org`,
     * `matrix.org:8448` and `[::1]:8448` are host names, not schemes.
     */
    private fun schemeOf(address: String): String? {
        // An IPv6 literal has colons before any port
        if (address.startsWith("[")) return null
        val match = SCHEME.matchEntire(address) ?: return null
        val rest = match.groupValues[2]
        // "matrix.org:8448" is a host and port, not a scheme
        val head = rest.substringBefore('/').substringBefore('?').substringBefore('#')
        if (!rest.startsWith("//") && head.isNotEmpty() && head.all(Char::isDigit)) return null
        return match.groupValues[1].lowercase()
    }

    /**
     * True for an address the app may ask discovery with: no scheme (https is added), `https://`, or
     * `http://` in a debug build. Anything else is refused rather than silently rewritten.
     */
    fun valid(input: String): Boolean {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return true
        val scheme = schemeOf(trimmed) ?: return true
        if (scheme != "http" && scheme != "https") return false
        return trimmed.startsWith("$scheme://", ignoreCase = true)
    }

    /**
     * The address to ask discovery with: as typed, with `https://` when it names no scheme. Release
     * builds force `https://` (the core refuses cleartext there), while debug builds keep a typed
     * `http://` so a LAN test server works. A non-http scheme is invalid, not rewritten.
     */
    fun address(input: String): String {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return trimmed
        if (!valid(trimmed)) return ""
        return when (schemeOf(trimmed)) {
            null -> "https://$trimmed"
            "https" -> trimmed
            else -> if (BuildConfig.DEBUG) trimmed else "https://" + trimmed.substringAfter("://")
        }
    }

    /** The host of an address, lower-cased, without a scheme, port or path ("matrix.org") */
    fun host(input: String): String {
        val trimmed = input.trim()
        if (trimmed.isEmpty() || !valid(trimmed)) return ""
        val withScheme = if (schemeOf(trimmed) == null) "https://$trimmed" else trimmed
        val authority = withScheme.substringAfter("://").substringBefore('/').substringAfter('@')
        return (if (authority.startsWith("[")) authority.substringBefore(']') + "]" else authority.substringBefore(':')).lowercase()
    }

    /** True when the typed address is one of the popular servers */
    fun isPopular(input: String): Boolean {
        val host = host(input)
        return host.isNotEmpty() && POPULAR.any { host(it) == host }
    }

    /** The status line for the address as typed and what discovery found */
    fun state(input: String, checking: Boolean, found: Boolean, notMatrix: Boolean, unreachable: Boolean): State = when {
        input.trim().isEmpty() -> State.empty
        !valid(input) -> State.invalid
        checking -> State.checking
        found -> State.ok
        notMatrix -> State.notMatrix
        unreachable -> State.unreachable
        else -> State.checking
    }
}
