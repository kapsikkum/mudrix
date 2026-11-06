package org.wizardchat.android.media

import java.net.URI
import java.net.URLDecoder

/** A link to a single YouTube video; [start] is the offset in seconds from `t=` / `start=` */
data class YouTubeVideo(val id: String, val start: Int)

/** Recognises YouTube links the way the web's `util/youtube.ts` does */
object YouTubeLink {
    private val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
    private val SECONDS = Regex("^\\d+s?$")
    private val CLOCK = Regex("^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$")

    /** "90", "90s" or "1h2m3s" -> seconds */
    private fun timestamp(raw: String?): Int {
        if (raw.isNullOrEmpty()) return 0
        if (SECONDS.matches(raw)) return raw.trimEnd('s').toIntOrNull() ?: 0
        val match = CLOCK.matchEntire(raw) ?: return 0
        fun part(index: Int) = match.groupValues[index].toIntOrNull() ?: 0
        return part(1) * 3600 + part(2) * 60 + part(3)
    }

    private fun query(uri: URI): Map<String, String> =
        uri.rawQuery.orEmpty().split('&').filter { it.isNotEmpty() }.associate { pair ->
            val (key, value) = pair.split('=', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
            URLDecoder.decode(key, "UTF-8") to URLDecoder.decode(value, "UTF-8")
        }

    /** The video behind a watch, youtu.be, shorts, embed or live link, or null */
    fun parse(raw: String): YouTubeVideo? {
        val uri = runCatching { URI(raw) }.getOrNull() ?: return null
        if (uri.scheme != "https" && uri.scheme != "http") return null
        val host = uri.host?.lowercase()?.replace(Regex("^(www|m)\\."), "") ?: return null
        val parts = uri.path.orEmpty().split('/').filter { it.isNotEmpty() }
        val params = runCatching { query(uri) }.getOrDefault(emptyMap())
        val id = when {
            host == "youtu.be" -> parts.firstOrNull()
            host == "youtube.com" || host == "youtube-nocookie.com" -> when (parts.firstOrNull()) {
                "watch" -> params["v"]
                "shorts", "embed", "live", "v" -> parts.getOrNull(1)
                else -> null
            }
            else -> null
        }
        if (id == null || !VIDEO_ID.matches(id)) return null
        return YouTubeVideo(id, timestamp(params["t"] ?: params["start"]))
    }

    /** The privacy-enhanced player; nothing is requested from YouTube before this is loaded */
    fun embedUrl(video: YouTubeVideo): String =
        "https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1" + if (video.start > 0) "&start=${video.start}" else ""
}
