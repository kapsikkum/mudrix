package chat.mudrix.android.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GifLinkTest {
    @Test
    fun `recognises giphy link shapes`() {
        assertEquals(GifLink.Giphy("AbCdEf1234"), GifLink.parse("https://media.giphy.com/media/AbCdEf1234/giphy.gif"))
        assertEquals(GifLink.Giphy("AbCdEf1234"), GifLink.parse("https://i.giphy.com/AbCdEf1234.gif"))
        assertEquals(GifLink.Giphy("AbCdEf1234"), GifLink.parse("https://i.giphy.com/media/AbCdEf1234"))
        assertEquals(GifLink.Giphy("AbCdEf1234"), GifLink.parse("https://media3.giphy.com/media/AbCdEf1234/giphy.gif"))
        assertEquals(GifLink.Giphy("AbCdEf1234"), GifLink.parse("https://giphy.com/gifs/some-title-AbCdEf1234"))
        assertEquals(GifLink.Giphy("AbCdEf1234"), GifLink.parse("https://www.giphy.com/embed/AbCdEf1234"))
    }

    @Test
    fun `recognises klipy links`() {
        assertEquals(GifLink.KlipySlug("sunny-day"), GifLink.parse("https://klipy.com/gifs/sunny-day"))
        assertEquals(GifLink.KlipySlug("sunny-day"), GifLink.parse("https://www.klipy.com/gifs/sunny-day"))
        assertEquals(
            GifLink.KlipyMedia("https://cdn.klipy.com/funny.gif"),
            GifLink.parse("https://cdn.klipy.com/funny.gif"),
        )
    }

    @Test
    fun `a wrapped link is still a link`() {
        assertEquals(GifLink.Giphy("AbCdEf1234"), GifLink.parse("<https://i.giphy.com/AbCdEf1234.gif>"))
    }

    @Test
    fun `anything but one link stays an ordinary message`() {
        assertNull(GifLink.parse("look at this https://i.giphy.com/AbCdEf1234.gif"))
        assertNull(GifLink.parse("two https://i.giphy.com/AbCdEf1234.gif and more"))
        assertNull(GifLink.parse("https://i.giphy.com/ABC.gif"))
        assertNull(GifLink.parse("http://i.giphy.com/AbCdEf1234.gif"))
        assertNull(GifLink.parse("https://user@i.giphy.com/AbCdEf1234.gif"))
        assertNull(GifLink.parse("https://giphy.example.com/gifs/some-title-AbCdEf1234"))
        assertNull(GifLink.parse("https://klipy.com/gifs"))
        assertNull(GifLink.parse("https://evil.example/funny.gif"))
        assertNull(GifLink.parse("not a url"))
        assertNull(GifLink.parse(""))
    }

    @Test
    fun `a giphy link has a stable media url`() {
        val gif = GifLink.direct(GifLink.Giphy("AbCdEf1234"))
        assertEquals("https://media.giphy.com/media/AbCdEf1234/giphy.gif", gif?.url)
        assertEquals("https://media.giphy.com/media/AbCdEf1234/giphy.gif", gif?.previewUrl)
        assertEquals(GifItem.GIPHY, gif?.provider)
    }

    @Test
    fun `a direct klipy file resolves without the api but a page link does not`() {
        val gif = GifLink.direct(GifLink.KlipyMedia("https://cdn.klipy.com/funny.gif"))
        assertEquals("https://cdn.klipy.com/funny.gif", gif?.url)
        assertEquals(GifItem.KLIPY, gif?.provider)
        assertNull(GifLink.direct(GifLink.KlipySlug("sunny-day")))
        assertTrue(GifLink.needsApi(GifLink.KlipySlug("sunny-day")))
        assertFalse(GifLink.needsApi(GifLink.Giphy("AbCdEf1234")))
    }
}
