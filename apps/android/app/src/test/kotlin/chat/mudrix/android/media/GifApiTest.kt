package chat.mudrix.android.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GifApiTest {
    @Test
    fun `giphy asks trending or search with the key and paging`() {
        assertEquals(
            "https://api.giphy.com/v1/gifs/trending?api_key=k%2B1&limit=30&offset=0",
            GifApi.giphyUrl("k+1", ""),
        )
        assertEquals(
            "https://api.giphy.com/v1/gifs/search?api_key=k&q=funny%20cat&limit=30&offset=30",
            GifApi.giphyUrl("k", "funny cat", offset = 30),
        )
    }

    @Test
    fun `klipy asks trending or search with a page number`() {
        assertEquals(
            "https://api.klipy.com/api/v1/k/gifs/trending?per_page=24&page=1",
            GifApi.klipyUrl("k", ""),
        )
        assertEquals(
            "https://api.klipy.com/api/v1/k/gifs/search?q=funny%20cat&per_page=24&page=2",
            GifApi.klipyUrl("k", "funny cat", page = 2),
        )
        assertEquals(
            "https://api.klipy.com/api/v1/k/gifs/items?slugs=sunny-day",
            GifApi.klipyItemUrl("k", "sunny-day"),
        )
    }

    @Test
    fun `only klipy hosts over https are trusted`() {
        assertTrue(GifApi.isAllowedKlipyUrl("https://cdn.klipy.com/a.gif"))
        assertTrue(GifApi.isAllowedKlipyUrl("https://klipy.com/a.gif"))
        assertFalse(GifApi.isAllowedKlipyUrl("http://cdn.klipy.com/a.gif"))
        assertFalse(GifApi.isAllowedKlipyUrl("https://klipy.com.evil.example/a.gif"))
        assertFalse(GifApi.isAllowedKlipyUrl("https://evil.example/a.gif"))
        assertFalse(GifApi.isAllowedKlipyUrl("https://user@cdn.klipy.com/a.gif"))
        assertFalse(GifApi.isAllowedKlipyUrl(null))
    }

    @Test
    fun `a download only passes as a gif when its magic bytes say so`() {
        assertTrue(GifApi.isGif("GIF89a....".toByteArray()))
        assertTrue(GifApi.isGif("GIF87a....".toByteArray()))
        assertFalse(GifApi.isGif("PNG".toByteArray()))
        assertFalse(GifApi.isGif(ByteArray(0)))
    }

    @Test
    fun `reads a giphy reply`() {
        val body = """
            {"data":[
              {"id":"abc123","title":"A cat","images":{
                "original":{"url":"https://media.giphy.com/media/abc123/giphy.gif","width":"480","height":"270"},
                "downsized":{"url":"https://media.giphy.com/media/abc123/giphy-downsized.gif","width":"480","height":"270"},
                "fixed_width":{"url":"https://media.giphy.com/media/abc123/200w.gif","width":"200","height":"112"}
              }},
              {"id":"","images":{}}
            ]}
        """.trimIndent()
        val items = GifApi.parseGiphy(body)
        assertEquals(1, items.size)
        val gif = items.first()
        assertEquals("abc123", gif.id)
        assertEquals("A cat", gif.title)
        assertEquals("https://media.giphy.com/media/abc123/giphy-downsized.gif", gif.url)
        assertEquals("https://media.giphy.com/media/abc123/200w.gif", gif.previewUrl)
        assertEquals(480, gif.width)
        assertEquals(270, gif.height)
        assertEquals(GifItem.GIPHY, gif.provider)
    }

    @Test
    fun `reads a klipy reply and drops what cannot be trusted`() {
        val body = """
            {"result":true,"data":{"has_next":true,"data":[
              {"id":7,"type":"gif","title":"Dog","file":{
                "md":{"gif":{"url":"https://cdn.klipy.com/md.gif","width":300,"height":200,"size":1000}},
                "hd":{"gif":{"url":"https://cdn.klipy.com/hd.gif","width":600,"height":400,"size":4000}},
                "sm":{"gif":{"url":"https://cdn.klipy.com/sm.gif","width":150,"height":100,"size":500}}
              }},
              {"id":8,"type":"sticker","file":{"md":{"gif":{"url":"https://cdn.klipy.com/x.gif","size":1}}}},
              {"id":9,"type":"gif","file":{"md":{"gif":{"url":"https://evil.example/x.gif","size":1}}}}
            ]}}
        """.trimIndent()
        val items = GifApi.parseKlipy(body)
        assertEquals(1, items.size)
        val gif = items.first()
        assertEquals("7", gif.id)
        assertEquals("https://cdn.klipy.com/md.gif", gif.url)
        assertEquals("https://cdn.klipy.com/sm.gif", gif.previewUrl)
        assertEquals(150, gif.width)
        assertEquals(100, gif.height)
        assertEquals(GifItem.KLIPY, gif.provider)
    }

    @Test
    fun `a klipy failure is no list`() {
        assertEquals(emptyList<GifItem>(), GifApi.parseKlipy("""{"result":false}"""))
        assertEquals(emptyList<GifItem>(), GifApi.parseGiphy("nonsense"))
        assertEquals(emptyList<GifItem>(), GifApi.parseKlipy("nonsense"))
    }

    @Test
    fun `recent keeps one entry per gif and moves the newest first`() {
        val a = GifItem("a", "A", "https://x/a.gif", "https://x/a.gif", 1, 1)
        val b = GifItem("b", "B", "https://x/b.gif", "https://x/b.gif", 1, 1)
        val c = GifItem("c", "C", "https://x/c.gif", "https://x/c.gif", 1, 1)
        // The picker stores GifItems, so the list (not just its ids) is what has to come back in order
        assertEquals(listOf(c, a, b), GifApi.withRecent(listOf(a, b), c))
        assertEquals(listOf(b, a), GifApi.withRecent(listOf(a, b), b))
        assertEquals(listOf(c, a), GifApi.withRecent(listOf(a, b), c, cap = 2))
    }

    @Test
    fun `a stored recent list survives a round trip and unusable entries are dropped`() {
        val a = GifItem("a", "A", "https://x/a.gif", "https://x/a.gif", 1, 1)
        val b = GifItem("b", "B", "https://x/b.gif", "https://x/b.gif", 1, 1, GifItem.KLIPY)
        assertEquals(listOf(a, b), GifApi.parseRecent(GifApi.encodeRecent(listOf(a, b))))
        assertEquals(emptyList<GifItem>(), GifApi.parseRecent("not json"))
        assertEquals(emptyList<GifItem>(), GifApi.parseRecent(null))
    }
}
