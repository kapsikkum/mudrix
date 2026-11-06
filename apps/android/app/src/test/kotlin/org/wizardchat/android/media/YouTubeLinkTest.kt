package org.wizardchat.android.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class YouTubeLinkTest {
    private val id = "dQw4w9WgXcQ"

    @Test
    fun recognisesTheLinkShapes() {
        assertEquals(YouTubeVideo(id, 0), YouTubeLink.parse("https://www.youtube.com/watch?v=$id"))
        assertEquals(YouTubeVideo(id, 0), YouTubeLink.parse("https://m.youtube.com/watch?feature=share&v=$id"))
        assertEquals(YouTubeVideo(id, 0), YouTubeLink.parse("https://youtu.be/$id"))
        assertEquals(YouTubeVideo(id, 0), YouTubeLink.parse("https://www.youtube.com/shorts/$id"))
        assertEquals(YouTubeVideo(id, 0), YouTubeLink.parse("https://www.youtube.com/embed/$id"))
        assertEquals(YouTubeVideo(id, 0), YouTubeLink.parse("https://www.youtube.com/live/$id"))
        assertEquals(YouTubeVideo(id, 0), YouTubeLink.parse("https://www.youtube-nocookie.com/embed/$id"))
    }

    @Test
    fun readsTheStartOffset() {
        assertEquals(90, YouTubeLink.parse("https://youtu.be/$id?t=90")?.start)
        assertEquals(90, YouTubeLink.parse("https://youtu.be/$id?t=90s")?.start)
        assertEquals(3723, YouTubeLink.parse("https://www.youtube.com/watch?v=$id&t=1h2m3s")?.start)
        assertEquals(125, YouTubeLink.parse("https://www.youtube.com/embed/$id?start=125")?.start)
        assertEquals(0, YouTubeLink.parse("https://youtu.be/$id?t=soon")?.start)
    }

    @Test
    fun rejectsEverythingElse() {
        assertNull(YouTubeLink.parse("https://www.youtube.com/"))
        assertNull(YouTubeLink.parse("https://www.youtube.com/watch?v=short"))
        assertNull(YouTubeLink.parse("https://www.youtube.com/playlist?list=PL12345678901"))
        assertNull(YouTubeLink.parse("https://vimeo.com/$id"))
        assertNull(YouTubeLink.parse("ftp://youtu.be/$id"))
        assertNull(YouTubeLink.parse("not a url"))
        assertNull(YouTubeLink.parse("https://evil.example/youtu.be/$id"))
    }

    @Test
    fun embedsFromThePrivacyEnhancedHost() {
        assertEquals(
            "https://www.youtube-nocookie.com/embed/$id?autoplay=1&rel=0&playsinline=1&start=30",
            YouTubeLink.embedUrl(YouTubeVideo(id, 30)),
        )
    }
}
