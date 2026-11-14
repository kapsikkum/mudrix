package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GalleryTagsTest {
    @Test
    fun `only still pictures count toward a gallery`() {
        assertTrue(GalleryTags.isGalleryImage("image/jpeg"))
        assertTrue(GalleryTags.isGalleryImage("image/gif"))
        assertFalse(GalleryTags.isGalleryImage("image/svg+xml"))
        assertFalse(GalleryTags.isGalleryImage("video/mp4"))
    }

    @Test
    fun `images sent together share one id and are numbered in order`() {
        val tags = GalleryTags.plan(listOf("image/jpeg", "video/mp4", "image/png", "image/gif"), "g1")
        assertEquals(GalleryTags.Tag("g1", 0, 3), tags[0])
        assertNull(tags[1])
        assertEquals(GalleryTags.Tag("g1", 1, 3), tags[2])
        assertEquals(GalleryTags.Tag("g1", 2, 3), tags[3])
    }

    @Test
    fun `a single image or a set of only other files is not tagged`() {
        assertTrue(GalleryTags.plan(listOf("image/jpeg"), "g1").all { it == null })
        assertTrue(GalleryTags.plan(listOf("video/mp4", "video/mp4"), "g1").all { it == null })
    }

    @Test
    fun `the tag goes under the current Mudrix key with id, index and count`() {
        val content = GalleryTags.content(GalleryTags.Tag("g1", 1, 2))
        val tag = (content[GalleryTags.KEY] as JsonObject)
        assertEquals("io.github.kapsikkum.mudrix.gallery", GalleryTags.KEY)
        assertEquals("""{"id":"g1","index":1,"count":2}""", tag.toString())
    }
}
