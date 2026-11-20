package chat.mudrix.android.media

import chat.mudrix.android.integrations.IntegrationNetwork
import java.net.URI
import java.net.URLDecoder

/** Asked once, then shown, or hidden (the link falls back to a plain preview) */
enum class LinkEmbedMode { ask, on, off }

/**
 * A service whose normal links become a card or player in the timeline, like the web's
 * `LinkEmbedServiceId`. [prefKey] is the synced preference holding its [LinkEmbedMode].
 * YouTube keeps its own player and Spotify has no card on this device; the rest are cards
 * that embeds.now builds ([viaEmbedsNow]).
 */
enum class LinkEmbedService(val id: String, val label: String, val prefKey: String, val viaEmbedsNow: Boolean) {
    youtube("youtube", "YouTube", "youtubeEmbeds", false),
    spotify("spotify", "Spotify", "spotifyEmbeds", false),
    x("x", "X", "xEmbeds", true),
    instagram("instagram", "Instagram", "instagramEmbeds", true),
    tiktok("tiktok", "TikTok", "tiktokEmbeds", true),
    reddit("reddit", "Reddit", "redditEmbeds", true),
    facebook("facebook", "Facebook", "facebookEmbeds", true),
    threads("threads", "Threads", "threadsEmbeds", true),
    bluesky("bluesky", "Bluesky", "blueskyEmbeds", true),
    mastodon("mastodon", "Mastodon", "mastodonEmbeds", true),
    pinterest("pinterest", "Pinterest", "pinterestEmbeds", true),
    linkedin("linkedin", "LinkedIn", "linkedinEmbeds", true),
    tumblr("tumblr", "Tumblr", "tumblrEmbeds", true),
    ;

    /** What a fresh install does: only the Spotify player starts visible, like the web */
    val defaultMode: LinkEmbedMode get() = if (this == spotify) LinkEmbedMode.on else LinkEmbedMode.ask

    companion object {
        val players = listOf(youtube, spotify)
        val cards = entries.filter { it.viaEmbedsNow }
    }
}

/** A link embeds.now can make a card for; [url] is the normalised https address to ask it about */
data class LinkEmbedMatch(val service: LinkEmbedService, val url: String)

/** What a link shows, from its service's setting */
enum class LinkEmbedPlan { none, prompt, card }

/** Recognises the links embeds.now cards are made for, with the same shapes as the web's `util/linkEmbeds.ts` */
object LinkEmbeds {
    /** `on` is consent (also in encrypted rooms); `ask` is only a prompt; `off` leaves the plain link preview */
    fun plan(mode: LinkEmbedMode): LinkEmbedPlan = when (mode) {
        LinkEmbedMode.off -> LinkEmbedPlan.none
        LinkEmbedMode.ask -> LinkEmbedPlan.prompt
        LinkEmbedMode.on -> LinkEmbedPlan.card
    }

    private const val MAX_URL_LENGTH = 2000

    /** The parts of a link the matchers read: lower-case host, decoded path segments and the first value of each query key */
    private class Link(val host: String, val rawPath: String, val rawQuery: String?) {
        val parts: List<String> = rawPath.split('/').filter { it.isNotEmpty() }.map(::decode)
        val query: Map<String, String> by lazy {
            val map = LinkedHashMap<String, String>()
            for (pair in rawQuery.orEmpty().split('&')) {
                if (pair.isEmpty()) continue
                val key = decode(pair.substringBefore('='))
                if (key !in map) map[key] = decode(pair.substringAfter('=', ""))
            }
            map
        }

        fun href(): String = "https://$host${rawPath.ifEmpty { "/" }}${rawQuery?.let { "?$it" } ?: ""}"
    }

    private fun decode(part: String): String =
        runCatching { URLDecoder.decode(part.replace("+", "%2B"), "UTF-8") }.getOrDefault(part)

    /** https (http is upgraded), a public DNS name, no credentials and no odd port */
    private fun read(raw: String): Link? {
        if (raw.isEmpty() || raw.length > MAX_URL_LENGTH) return null
        val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase()
        if (scheme != "https" && scheme != "http") return null
        if (uri.rawUserInfo != null || uri.port != -1) return null
        val host = uri.host?.lowercase() ?: return null
        if (IntegrationNetwork.isForbiddenHost(host)) return null
        return Link(host, uri.rawPath.orEmpty(), uri.rawQuery)
    }

    /** The service that recognises [raw], with the address to ask embeds.now about, or null */
    fun match(raw: String): LinkEmbedMatch? {
        val link = read(raw) ?: return null
        for ((service, parse) in matchers) {
            val url = parse(link) ?: continue
            return LinkEmbedMatch(service, url)
        }
        return null
    }

    private val matchers: List<Pair<LinkEmbedService, (Link) -> String?>> = listOf(
        LinkEmbedService.x to ::x,
        LinkEmbedService.instagram to ::instagram,
        LinkEmbedService.tiktok to ::tiktok,
        LinkEmbedService.reddit to ::reddit,
        LinkEmbedService.facebook to ::facebook,
        LinkEmbedService.threads to ::threads,
        LinkEmbedService.bluesky to ::bluesky,
        LinkEmbedService.pinterest to ::pinterest,
        LinkEmbedService.linkedin to ::linkedin,
        LinkEmbedService.tumblr to ::tumblr,
        LinkEmbedService.mastodon to ::mastodon,
    )

    private fun Link.at(index: Int): String? = parts.getOrNull(index)

    private val X_HOSTS = setOf("x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com")
    private val INSTAGRAM_HOSTS = setOf("instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am")
    private val REDDIT_HOSTS = setOf("reddit.com", "www.reddit.com", "old.reddit.com", "m.reddit.com", "new.reddit.com")
    private val FACEBOOK_HOSTS = setOf("facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "mbasic.facebook.com")
    private val THREADS_HOSTS = setOf("threads.net", "www.threads.net", "threads.com", "www.threads.com")

    private val DIGITS_1_25 = Regex("^\\d{1,25}$")
    private val X_USER = Regex("^[A-Za-z0-9_]{1,15}$")
    private val INSTAGRAM_CODE = Regex("^[A-Za-z0-9_-]{5,30}$")
    private val TIKTOK_ID = Regex("^\\d{6,25}$")
    private val TIKTOK_USER = Regex("^[A-Za-z0-9._-]{1,64}$")
    private val REDDIT_ID = Regex("^[a-z0-9]{4,12}$", RegexOption.IGNORE_CASE)
    private val REDDIT_SUB = Regex("^[A-Za-z0-9_]{2,32}$")
    private val REDDIT_SLUG = Regex("^[A-Za-z0-9_-]{1,120}$")
    private val FACEBOOK_SAFE = Regex("^[A-Za-z0-9._-]{1,100}$")
    private val THREADS_USER = Regex("^[A-Za-z0-9._-]{1,64}$")
    private val THREADS_ID = Regex("^[A-Za-z0-9_-]{1,64}$")
    private val BSKY_RKEY = Regex("^[A-Za-z0-9._~-]{1,512}$")
    private val BSKY_DID = Regex("^did:[a-z]+:[A-Za-z0-9._:%-]+$")
    private val BSKY_HANDLE = Regex("^[A-Za-z0-9.-]{1,253}$")
    private val STATUS_ID = Regex("^\\d{4,32}$")
    private val MASTODON_USER = Regex("^[A-Za-z0-9_.-]+(@[A-Za-z0-9.-]+)?$")
    private val PIN_ID = Regex("^\\d{4,30}$")
    private val LINKEDIN_URN = Regex("^urn:li:(activity|share|ugcPost):(\\d{1,30})$")
    private val TUMBLR_BLOG = Regex("^[A-Za-z0-9-]{1,64}$")
    private val TUMBLR_HOST = Regex("^[a-z0-9-]+\\.tumblr\\.com$")
    private val PINTEREST_LOCAL_HOST = Regex("^[a-z]{2,5}\\.pinterest\\.com$")

    private fun x(link: Link): String? {
        if (link.host == "t.co") return link.href()
        if (link.host !in X_HOSTS) return null
        val p = link.parts
        var user: String? = null
        val id: String?
        when {
            p.getOrNull(0) == "i" && p.getOrNull(1) == "web" && p.getOrNull(2) == "status" -> id = link.at(3)
            p.getOrNull(0) == "i" && p.getOrNull(1) == "status" -> id = link.at(2)
            p.getOrNull(1) == "status" || p.getOrNull(1) == "statuses" -> {
                user = link.at(0)
                id = link.at(2)
            }
            else -> id = null
        }
        if (id == null || !DIGITS_1_25.matches(id)) return null
        if (user != null && !X_USER.matches(user)) return null
        return if (user != null) "https://x.com/$user/status/$id" else "https://x.com/i/status/$id"
    }

    private fun instagram(link: Link): String? {
        if (link.host !in INSTAGRAM_HOSTS) return null
        val kind = link.at(0)
        val code = link.at(1)
        if (kind == "share") return link.href()
        if (kind == null || kind !in setOf("p", "reel", "reels", "tv")) return null
        if (code == null || !INSTAGRAM_CODE.matches(code)) return null
        val embedKind = if (kind == "p" || kind == "tv") "p" else "reel"
        return "https://www.instagram.com/$embedKind/$code/"
    }

    private fun tiktok(link: Link): String? {
        if (link.host == "vt.tiktok.com" || link.host == "vm.tiktok.com") return link.href()
        if (link.host !in setOf("tiktok.com", "www.tiktok.com", "m.tiktok.com")) return null
        val p = link.parts
        if (p.getOrNull(0) == "t") return link.href()
        var user: String? = null
        val id: String?
        when {
            p.getOrNull(0) == "embed" && p.getOrNull(1) == "v2" -> id = link.at(2)
            p.getOrNull(0) == "v" -> id = link.at(1)?.replace(Regex("\\.html$", RegexOption.IGNORE_CASE), "")
            p.getOrNull(0)?.startsWith("@") == true && (p.getOrNull(1) == "video" || p.getOrNull(1) == "photo") -> {
                user = p[0].substring(1)
                id = link.at(2)
            }
            else -> id = null
        }
        if (id == null || !TIKTOK_ID.matches(id)) return null
        if (user != null && !TIKTOK_USER.matches(user)) return null
        return if (user != null) "https://www.tiktok.com/@$user/video/$id" else link.href()
    }

    private fun reddit(link: Link): String? {
        if (link.host == "redd.it" || link.host == "www.redd.it") return link.href()
        if (link.host !in REDDIT_HOSTS) return null
        val p = link.parts
        if (p.getOrNull(0) == "r" && p.getOrNull(2) == "s") return link.href()
        var sub: String? = null
        val id: String?
        if (p.getOrNull(0) == "r" && p.getOrNull(2) == "comments") {
            sub = link.at(1)
            id = link.at(3)
        } else if (p.getOrNull(0) == "comments") {
            id = link.at(1)
        } else {
            id = null
        }
        if (id == null || !REDDIT_ID.matches(id)) return null
        if (sub == null) return link.href()
        if (!REDDIT_SUB.matches(sub)) return null
        val slug = link.at(4)?.takeIf { REDDIT_SLUG.matches(it) }?.let { "$it/" } ?: ""
        return "https://www.reddit.com/r/$sub/comments/$id/$slug"
    }

    private fun facebook(link: Link): String? {
        if (link.host == "fb.watch" || link.host == "fb.me") return link.href()
        if (link.host !in FACEBOOK_HOSTS) return null
        val p = link.parts
        fun safe(value: String?) = value != null && FACEBOOK_SAFE.matches(value)
        val first = link.at(0)
        return when {
            first == "watch" -> link.query["v"]?.takeIf(::safe)?.let { "https://www.facebook.com/watch/?v=$it" }
            first == "reel" && safe(link.at(1)) -> "https://www.facebook.com/reel/${p[1]}"
            first == "videos" && safe(link.at(1)) -> link.href()
            first == "posts" && safe(link.at(1)) -> "https://www.facebook.com/posts/${p[1]}"
            link.at(1) == "posts" && safe(first) && safe(link.at(2)) -> "https://www.facebook.com/$first/posts/${p[2]}"
            first == "permalink.php" || first == "story.php" -> {
                val story = link.query["story_fbid"]
                val owner = link.query["id"]
                if (safe(story) && safe(owner)) "https://www.facebook.com/$first?story_fbid=$story&id=$owner" else null
            }
            first == "photo.php" -> link.query["fbid"]?.takeIf(::safe)?.let { "https://www.facebook.com/photo.php?fbid=$it" }
            first == "share" -> link.href()
            else -> null
        }
    }

    private fun threads(link: Link): String? {
        if (link.host !in THREADS_HOSTS) return null
        if (link.at(0) == "t") return link.href()
        val handle = link.at(0)
        if (handle == null || !handle.startsWith("@") || link.at(1) != "post") return null
        val user = handle.substring(1)
        val id = link.at(2)
        if (!THREADS_USER.matches(user)) return null
        if (id == null || !THREADS_ID.matches(id)) return null
        return "https://www.threads.net/@$user/post/$id"
    }

    private fun bluesky(link: Link): String? {
        if (link.host != "bsky.app" && link.host != "www.bsky.app") return null
        if (link.at(0) != "profile" || link.at(2) != "post") return null
        val handle = link.at(1)
        val rkey = link.at(3)
        if (handle == null || rkey == null || !BSKY_RKEY.matches(rkey)) return null
        if (!BSKY_DID.matches(handle) && !BSKY_HANDLE.matches(handle)) return null
        return "https://bsky.app/profile/$handle/post/$rkey"
    }

    private fun pinterest(link: Link): String? {
        if (link.host == "pin.it") return link.href()
        val localised = PINTEREST_LOCAL_HOST.matches(link.host) && link.host != "www.pinterest.com"
        if (link.host !in setOf("pinterest.com", "www.pinterest.com", "m.pinterest.com") && !localised) return null
        val id = link.at(1)
        if (link.at(0) != "pin" || id == null || !PIN_ID.matches(id)) return null
        return "https://www.pinterest.com/pin/$id/"
    }

    private fun linkedin(link: Link): String? {
        if (link.host == "lnkd.in" || link.host == "www.lnkd.in") return link.href()
        if (link.host !in setOf("linkedin.com", "www.linkedin.com", "m.linkedin.com")) return null
        if (link.at(0) == "feed" && link.at(1) == "update" && link.at(2) != null) {
            val urn = link.parts[2]
            if (!LINKEDIN_URN.matches(urn)) return null
            return "https://www.linkedin.com/feed/update/$urn/"
        }
        if (link.at(0) == "posts" || link.at(0) == "pulse") return link.href()
        return null
    }

    private fun tumblr(link: Link): String? {
        if (link.host == "tmblr.co" || link.host == "www.tmblr.co") return link.href()
        val blog: String
        val id: String?
        if (link.host == "tumblr.com" || link.host == "www.tumblr.com") {
            val first = link.at(0)
            if (first == null || !TUMBLR_BLOG.matches(first)) return null
            blog = first
            id = if (link.at(1) == "post") link.at(2) else link.at(1)
        } else if (TUMBLR_HOST.matches(link.host)) {
            blog = link.host.removeSuffix(".tumblr.com")
            id = if (link.at(0) == "post") link.at(1) else link.at(0)
        } else {
            return null
        }
        if (id == null || !PIN_ID.matches(id)) return null
        return "https://www.tumblr.com/$blog/$id"
    }

    /** Hosts the other services own, which Mastodon's any-instance shape must not claim */
    private val OWNED_HOSTS: Set<String> = buildSet {
        addAll(listOf("youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"))
        addAll(listOf("open.spotify.com", "play.spotify.com", "spotify.link", "spotify.app.link"))
        addAll(X_HOSTS)
        add("t.co")
        addAll(INSTAGRAM_HOSTS)
        addAll(listOf("tiktok.com", "www.tiktok.com", "m.tiktok.com", "vt.tiktok.com", "vm.tiktok.com"))
        addAll(REDDIT_HOSTS)
        addAll(listOf("redd.it", "www.redd.it"))
        addAll(FACEBOOK_HOSTS)
        addAll(listOf("fb.watch", "fb.me"))
        addAll(THREADS_HOSTS)
        addAll(listOf("bsky.app", "www.bsky.app"))
        addAll(listOf("pinterest.com", "www.pinterest.com", "m.pinterest.com", "pin.it"))
        addAll(listOf("linkedin.com", "www.linkedin.com", "m.linkedin.com", "lnkd.in", "www.lnkd.in"))
        addAll(listOf("tumblr.com", "www.tumblr.com", "tmblr.co", "www.tmblr.co"))
    }

    private fun isOwnedHost(host: String): Boolean =
        host in OWNED_HOSTS || PINTEREST_LOCAL_HOST.matches(host) || TUMBLR_HOST.matches(host)

    /** Mastodon has no host list: any instance's `/@user/<id>` or `/users/<user>/statuses/<id>` */
    private fun mastodon(link: Link): String? {
        if (isOwnedHost(link.host)) return null
        val p = if (link.at(0) == "web" && link.at(1)?.startsWith("@") == true) link.parts.drop(1) else link.parts
        val user: String?
        val id: String?
        if (p.getOrNull(0)?.startsWith("@") == true) {
            user = p[0].substring(1)
            id = p.getOrNull(1)
        } else if (p.getOrNull(0) == "users" && p.getOrNull(2) == "statuses") {
            user = p.getOrNull(1)
            id = p.getOrNull(3)
        } else {
            return null
        }
        if (id == null || !STATUS_ID.matches(id)) return null
        if (user != null && !MASTODON_USER.matches(user)) return null
        return link.href()
    }
}
