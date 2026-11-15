package chat.mudrix.android.matrix

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.serialization.json.Json

class GifFavouritesTest {
    private fun urls(count: Int) = (1..count).map { "https://media.example/gif$it.gif" }

    @Test
    fun onlyHttpsAndMxcAreStorable() {
        assertEquals(listOf("https://a", "mxc://b"), GifFavourites.sanitize(listOf("https://a", "mxc://b")))
        assertEquals(emptyList<String>(), GifFavourites.sanitize(listOf("http://a", "ftp://b", "", "javascript:x")))
    }

    @Test
    fun duplicatesAreDroppedAndTheListIsCapped() {
        val list = urls(60)
        assertEquals(50, GifFavourites.sanitize(list).size)
        assertEquals(listOf("https://a", "https://b"), GifFavourites.sanitize(listOf("https://a", "https://b", "https://a")))
    }

    @Test
    fun starringPutsTheNewOneFirstAndUnstarringRemovesIt() {
        val starred = GifFavourites.toggled(listOf("https://a"), "https://b")
        assertEquals(listOf("https://b", "https://a"), starred)
        assertEquals(listOf("https://b"), GifFavourites.toggled(starred, "https://a"))
    }

    @Test
    fun anUnstorableUrlLeavesTheListAlone() {
        assertEquals(listOf("https://a"), GifFavourites.toggled(listOf("https://a"), "http://b"))
    }

    @Test
    fun theStoredEventIsAUrlsArray() {
        val content = GifFavourites.content(listOf("https://a", "mxc://b", "https://a"))
        assertEquals(listOf("https://a", "mxc://b"), GifFavourites.parse(content))
        assertEquals("""{"urls":["https://a","mxc://b"]}""", content.toString())
    }

    @Test
    fun parsingToleratesAnythingElse() {
        assertEquals(emptyList<String>(), GifFavourites.parse(null))
        assertEquals(emptyList<String>(), GifFavourites.parse(Json.parseToJsonElement("{}")))
        assertEquals(emptyList<String>(), GifFavourites.parse(Json.parseToJsonElement("""{"urls":"https://a"}""")))
        assertEquals(
            listOf("https://a"),
            GifFavourites.parse(Json.parseToJsonElement("""{"urls":["https://a",3,null,"http://b"]}""")),
        )
    }

    @Test
    fun theAccountTypesAreTheMudrixOneThenTheUpstreamOne() {
        assertEquals("io.github.kapsikkum.mudrix.gif_favourites", GifFavourites.TYPE)
        assertEquals("org.wizardchat.gif_favourites", GifFavourites.UPSTREAM_TYPE)
        assertEquals(listOf(GifFavourites.TYPE, GifFavourites.UPSTREAM_TYPE), GifFavourites.READ_TYPES)
    }

    @Test
    fun theOldDeviceListIsReadFromEncodedGifsOrPlainStrings() {
        val encoded = """[{"id":"1","title":"","url":"https://media.example/one.gif",""" +
            """"previewUrl":"https://media.example/one.gif","width":200,"height":200,"provider":"giphy"}]"""
        assertEquals(listOf("https://media.example/one.gif"), GifFavourites.legacyUrls(encoded))
        assertEquals(
            listOf("https://media.example/two.gif", "mxc://three"),
            GifFavourites.legacyUrls("""["https://media.example/two.gif","mxc://three","https://media.example/two.gif"]"""),
        )
        assertEquals(emptyList<String>(), GifFavourites.legacyUrls(null))
        assertEquals(emptyList<String>(), GifFavourites.legacyUrls("not json"))
    }

    @Test
    fun storedUrlsAreWhatAFavouriteIs() {
        assertTrue(GifFavourites.isStorable("https://media.example/a.gif"))
        assertFalse(GifFavourites.isStorable("http://media.example/a.gif"))
        assertEquals(50, GifFavourites.CAP)
    }
}
