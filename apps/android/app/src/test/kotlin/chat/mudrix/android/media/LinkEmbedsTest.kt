package chat.mudrix.android.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LinkEmbedsTest {
    private fun match(url: String) = LinkEmbeds.match(url)?.let { it.service to it.url }

    @Test
    fun xPostsAndShortLinks() {
        assertEquals(LinkEmbedService.x to "https://x.com/JesseCohenInv/status/2120962452137431338", match("https://twitter.com/JesseCohenInv/status/2120962452137431338?s=20"))
        assertEquals(LinkEmbedService.x to "https://x.com/i/status/123", match("https://x.com/i/web/status/123"))
        assertEquals(LinkEmbedService.x to "https://t.co/abc", match("https://t.co/abc"))
        assertNull(match("https://x.com/JesseCohenInv"))
        assertNull(match("https://x.com/way_too_long_user_name_here/status/1"))
    }

    @Test
    fun instagram() {
        assertEquals(LinkEmbedService.instagram to "https://www.instagram.com/p/CzAbC12/", match("https://www.instagram.com/p/CzAbC12/?igsh=x"))
        assertEquals(LinkEmbedService.instagram to "https://www.instagram.com/reel/CzAbC12/", match("https://instagram.com/reels/CzAbC12"))
        assertEquals(LinkEmbedService.instagram to "https://www.instagram.com/p/CzAbC12/", match("https://instagram.com/tv/CzAbC12"))
        assertEquals(LinkEmbedService.instagram, LinkEmbeds.match("https://www.instagram.com/share/BAbc")?.service)
        assertNull(match("https://www.instagram.com/someone/"))
    }

    @Test
    fun tiktok() {
        assertEquals(
            LinkEmbedService.tiktok to "https://www.tiktok.com/@sanilarena/video/7709628307104468255",
            match("https://www.tiktok.com/@sanilarena/video/7709628307104468255?lang=en"),
        )
        assertEquals(LinkEmbedService.tiktok, LinkEmbeds.match("https://vm.tiktok.com/ZMabc/")?.service)
        assertEquals(LinkEmbedService.tiktok, LinkEmbeds.match("https://www.tiktok.com/t/ZTabc/")?.service)
        assertNull(match("https://www.tiktok.com/@sanilarena"))
    }

    @Test
    fun reddit() {
        assertEquals(
            LinkEmbedService.reddit to "https://www.reddit.com/r/steinsgate/comments/1ig9m0c/steinsgate_pilgrimage_akihabara/",
            match("https://old.reddit.com/r/steinsgate/comments/1ig9m0c/steinsgate_pilgrimage_akihabara/?x=1"),
        )
        assertEquals(LinkEmbedService.reddit to "https://redd.it/1ig9m0c", match("https://redd.it/1ig9m0c"))
        assertEquals(LinkEmbedService.reddit, LinkEmbeds.match("https://www.reddit.com/r/steinsgate/s/abcDEF")?.service)
        assertNull(match("https://www.reddit.com/r/steinsgate/"))
    }

    @Test
    fun facebook() {
        assertEquals(LinkEmbedService.facebook to "https://www.facebook.com/watch/?v=123456", match("https://facebook.com/watch/?v=123456"))
        assertEquals(LinkEmbedService.facebook to "https://www.facebook.com/reel/987", match("https://m.facebook.com/reel/987"))
        assertEquals(LinkEmbedService.facebook to "https://www.facebook.com/someone/posts/pfbid0abc", match("https://www.facebook.com/someone/posts/pfbid0abc"))
        assertEquals(LinkEmbedService.facebook, LinkEmbeds.match("https://www.facebook.com/share/p/abc/")?.service)
        assertEquals(LinkEmbedService.facebook, LinkEmbeds.match("https://fb.watch/abc/")?.service)
        assertNull(match("https://www.facebook.com/someone"))
    }

    @Test
    fun threadsBlueskyPinterestLinkedinTumblr() {
        assertEquals(LinkEmbedService.threads to "https://www.threads.net/@zuck/post/Cabc_1", match("https://www.threads.com/@zuck/post/Cabc_1?xmt=1"))
        assertEquals(
            LinkEmbedService.bluesky to "https://bsky.app/profile/tapenori.bsky.social/post/3n2bm4iim3kqh",
            match("https://bsky.app/profile/tapenori.bsky.social/post/3n2bm4iim3kqh"),
        )
        assertNull(match("https://bsky.app/profile/tapenori.bsky.social"))
        assertEquals(LinkEmbedService.pinterest to "https://www.pinterest.com/pin/12345678/", match("https://de.pinterest.com/pin/12345678/"))
        assertEquals(LinkEmbedService.pinterest, LinkEmbeds.match("https://pin.it/abc")?.service)
        assertEquals(LinkEmbedService.linkedin, LinkEmbeds.match("https://www.linkedin.com/posts/someone_abc-activity-123")?.service)
        assertEquals(
            LinkEmbedService.linkedin to "https://www.linkedin.com/feed/update/urn:li:activity:123/",
            match("https://www.linkedin.com/feed/update/urn:li:activity:123"),
        )
        assertEquals(LinkEmbedService.linkedin, LinkEmbeds.match("https://lnkd.in/abc")?.service)
        assertEquals(LinkEmbedService.tumblr to "https://www.tumblr.com/staff/1234567", match("https://staff.tumblr.com/post/1234567/slug"))
        assertEquals(LinkEmbedService.tumblr to "https://www.tumblr.com/staff/1234567", match("https://www.tumblr.com/staff/1234567/slug"))
        assertNull(match("https://www.tumblr.com/"))
    }

    @Test
    fun mastodonOnAnyInstanceButNotOnOtherServices() {
        assertEquals(
            LinkEmbedService.mastodon to "https://mastodon.social/@Mastodon/116839714185151652",
            match("https://mastodon.social/@Mastodon/116839714185151652"),
        )
        assertEquals(LinkEmbedService.mastodon, LinkEmbeds.match("https://fosstodon.org/users/someone/statuses/1234567")?.service)
        assertEquals(LinkEmbedService.mastodon, LinkEmbeds.match("https://example.social/web/@a@other.net/109876543")?.service)
        assertNull(match("https://mastodon.social/@Mastodon"))
        assertNull(match("https://www.threads.com/@team/1234"))
        assertNull(match("https://www.youtube.com/@channel/1234"))
    }

    @Test
    fun hostsMustBePublicHttpsNames() {
        assertEquals(LinkEmbedService.x to "https://x.com/a/status/1", match("http://x.com/a/status/1"))
        assertNull(match("ftp://x.com/a/status/1"))
        assertNull(match("https://127.0.0.1/@a/12345"))
        assertNull(match("https://localhost/@a/12345"))
        assertNull(match("https://printer.local/@a/12345"))
        assertNull(match("https://user:pw@x.com/a/status/1"))
        assertNull(match("https://x.com:8443/a/status/1"))
        assertNull(match("https://[::1]/@a/12345"))
        assertNull(match("not a link"))
        assertNull(match("https://example.com/" + "a".repeat(2100)))
    }

    @Test
    fun plansFollowTheMode() {
        assertEquals(LinkEmbedPlan.none, LinkEmbeds.plan(LinkEmbedMode.off))
        assertEquals(LinkEmbedPlan.prompt, LinkEmbeds.plan(LinkEmbedMode.ask))
        assertEquals(LinkEmbedPlan.card, LinkEmbeds.plan(LinkEmbedMode.on))
    }

    @Test
    fun serviceTableMatchesTheWeb() {
        assertEquals(
            listOf(
                "youtubeEmbeds", "spotifyEmbeds", "xEmbeds", "instagramEmbeds", "tiktokEmbeds", "redditEmbeds", "facebookEmbeds",
                "threadsEmbeds", "blueskyEmbeds", "mastodonEmbeds", "pinterestEmbeds", "linkedinEmbeds", "tumblrEmbeds",
            ),
            LinkEmbedService.entries.map { it.prefKey },
        )
        assertEquals(LinkEmbedMode.on, LinkEmbedService.spotify.defaultMode)
        assertEquals(setOf(LinkEmbedMode.ask), LinkEmbedService.entries.filter { it != LinkEmbedService.spotify }.map { it.defaultMode }.toSet())
        assertEquals(11, LinkEmbedService.cards.size)
    }
}
