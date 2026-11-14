package org.wizardchat.android.matrix

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.wizardchat.core.EmojiPack
import org.wizardchat.core.PackImage

class StickerPacksTest {
    private fun pack(room: String?, vararg urls: String) = EmojiPack(
        id = "pack",
        name = "Pack",
        roomId = room,
        images = urls.map { PackImage(shortcode = it.substringAfterLast('/'), url = it, emoticon = false, sticker = true) },
    )

    @Test
    fun `the pack holding the image is found`() {
        val first = pack("!a:x", "mxc://a/one")
        val second = pack("!b:x", "mxc://b/two", "mxc://b/three")
        assertEquals(second, StickerPacks.find(listOf(first, second), "mxc://b/three"))
        assertNull(StickerPacks.find(listOf(first, second), "mxc://c/four"))
    }

    @Test
    fun `the image url is read from plain and encrypted media sources`() {
        assertEquals("mxc://a/one", StickerPacks.imageUrl(Json.parseToJsonElement("""{"url":"mxc://a/one"}""")))
        assertEquals(
            "mxc://a/two",
            StickerPacks.imageUrl(Json.parseToJsonElement("""{"file":{"url":"mxc://a/two","key":"k"}}""")),
        )
        assertNull(StickerPacks.imageUrl(Json.parseToJsonElement("""{"file":{"key":"k"}}""")))
        assertNull(StickerPacks.imageUrl(null))
    }

    @Test
    fun `the room on screen is searched first and listed once`() {
        assertEquals(
            listOf("!here:x", "!a:x", "!b:x"),
            StickerPacks.roomOrder("!here:x", listOf("!a:x", "!here:x", "!b:x", "!a:x")),
        )
        assertEquals(listOf("!a:x"), StickerPacks.roomOrder(null, listOf("!a:x")))
    }
}
