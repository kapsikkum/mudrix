package chat.mudrix.android.media

import java.net.URI

/**
 * A bare GIPHY or KLIPY link in a message, the web's `gifProviders/links.ts`. Only a body that is nothing but one
 * such link counts; anything else (text around it, other hosts, lookalike domains) stays an ordinary message.
 */
object GifLink {
    /** What a link points at */
    sealed interface Target {
        val provider: String
    }

    data class Giphy(val id: String) : Target {
        override val provider: String get() = GifItem.GIPHY
    }

    data class KlipySlug(val slug: String) : Target {
        override val provider: String get() = GifItem.KLIPY
    }

    data class KlipyMedia(val url: String) : Target {
        override val provider: String get() = GifItem.KLIPY
    }

    private val GIPHY_ID = Regex("^[A-Za-z0-9]{6,32}$")
    private val KLIPY_SLUG = Regex("^[a-z0-9][a-z0-9_-]{0,200}$", RegexOption.IGNORE_CASE)
    private val MEDIA_HOST = Regex("^media\\d*\\.giphy\\.com$")

    fun parse(text: String): Target? {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || trimmed.any { it.isWhitespace() }) return null
        val bare = if (trimmed.startsWith("<") && trimmed.endsWith(">")) trimmed.substring(1, trimmed.length - 1) else trimmed
        val uri = runCatching { URI(bare) }.getOrNull() ?: return null
        if (!uri.scheme.equals("https", ignoreCase = true)) return null
        if (uri.userInfo != null) return null
        val host = uri.host?.lowercase() ?: return null
        val parts = uri.path.orEmpty().split('/').filter { it.isNotEmpty() }
        giphyFrom(host, parts)?.let { return Giphy(it) }
        if (host == "klipy.com" || host == "www.klipy.com") {
            val at = parts.indexOf("gifs")
            val slug = if (at >= 0) parts.getOrNull(at + 1) else null
            return slug?.takeIf { KLIPY_SLUG.matches(it) }?.let { KlipySlug(it) }
        }
        if (host.endsWith(".klipy.com") && bare.endsWith(".gif", ignoreCase = true) && GifApi.isAllowedKlipyUrl(bare)) {
            return KlipyMedia(bare)
        }
        return null
    }

    private fun giphyFrom(host: String, parts: List<String>): String? {
        val first = parts.getOrNull(0)
        val second = parts.getOrNull(1)
        if (host == "i.giphy.com") {
            val id = (if (first == "media") second else first)?.replace(Regex("\\.gif$", RegexOption.IGNORE_CASE), "")
            return id?.takeIf { GIPHY_ID.matches(it) }
        }
        if (MEDIA_HOST.matches(host)) {
            return if (first == "media" && second != null && GIPHY_ID.matches(second)) second else null
        }
        if (host == "giphy.com" || host == "www.giphy.com") {
            if (first == "gifs" || first == "embed") {
                val id = second?.split('-')?.lastOrNull()
                return id?.takeIf { GIPHY_ID.matches(it) }
            }
        }
        return null
    }

    /**
     * The GIF a link points at without asking the provider: a GIPHY id has a stable media URL, and a direct KLIPY
     * file URL is the GIF itself. A KLIPY page link needs the provider's API (see [needsApi]).
     */
    fun direct(target: Target, title: String = "GIF"): GifItem? = when (target) {
        is Giphy -> {
            val url = "https://media.giphy.com/media/${target.id}/giphy.gif"
            GifItem(target.id, title, url, url, 0, 0, GifItem.GIPHY)
        }
        is KlipyMedia -> GifItem(target.url, title, target.url, target.url, 0, 0, GifItem.KLIPY)
        is KlipySlug -> null
    }

    /** True when the target can only be resolved through the provider's API (a KLIPY page link) */
    fun needsApi(target: Target): Boolean = target is KlipySlug
}
