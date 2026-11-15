package chat.mudrix.android.media

import org.junit.Assert.assertEquals
import org.junit.Test

/** A saved favourite is only its URL; the provider is read from its host, as the web's `gifFavourites.ts` does */
class GifFavouriteItemTest {
    @Test
    fun theProviderComesFromTheHost() {
        assertEquals(GifItem.KLIPY, GifItem.providerForUrl("https://klipy.com/gifs/abc.gif"))
        assertEquals(GifItem.KLIPY, GifItem.providerForUrl("https://media.klipy.com/a.gif"))
        assertEquals(GifItem.GIPHY, GifItem.providerForUrl("https://media.giphy.com/media/x/giphy.gif"))
        assertEquals(GifItem.GIPHY, GifItem.providerForUrl("mxc://example.org/abc"))
        assertEquals(GifItem.GIPHY, GifItem.providerForUrl("not a url"))
    }

    @Test
    fun aFavouriteDrawsFromItsUrlAlone() {
        val item = GifItem.favourite("https://media.giphy.com/media/x/giphy.gif")
        assertEquals("https://media.giphy.com/media/x/giphy.gif", item.url)
        assertEquals(item.url, item.previewUrl)
        assertEquals(item.url, item.id)
        assertEquals(GifItem.GIPHY, item.provider)
        assertEquals(200, item.width)
        assertEquals(200, item.height)
    }

    @Test
    fun aFavouriteThatLivesOnTheHomeserverIsOrdinarilySized() {
        val item = GifItem.favourite("mxc://example.org/abc", size = 260)
        assertEquals("mxc://example.org/abc", item.previewUrl)
        assertEquals(260, item.width)
        assertEquals(260, item.height)
    }
}
