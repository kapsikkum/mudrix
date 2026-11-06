package org.wizardchat.android.media

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The cases of the web's `imageStrip.test.ts`, on the Kotlin port */
class ImageStripTest {
    private fun text(s: String) = s.map { it.code }
    private fun be16(n: Int) = listOf((n shr 8) and 0xff, n and 0xff)
    private fun be32(n: Int) = listOf((n ushr 24) and 0xff, (n shr 16) and 0xff, (n shr 8) and 0xff, n and 0xff)
    private fun bytes(vararg parts: List<Int>) = ByteArray(parts.sumOf { it.size }).also { out ->
        var at = 0
        for (part in parts) for (b in part) out[at++] = b.toByte()
    }

    private fun segment(marker: Int, body: List<Int>) = listOf(0xff, marker) + be16(body.size + 2) + body

    /** Exif segment body with one IFD0 entry: orientation */
    private fun exif(orientation: Int): List<Int> {
        val tiff = text("MM") + be16(42) + be32(8) + be16(1) + be16(0x0112) + be16(3) + be32(1) + be16(orientation) + listOf(0, 0) + be32(0)
        return text("Exif") + listOf(0, 0) + tiff
    }

    private val scan = listOf(0xff, 0xda, 0, 4, 0, 0, 1, 2, 3, 0xff, 0xd9)

    private fun contains(haystack: ByteArray, needle: List<Int>): Boolean {
        val n = ByteArray(needle.size) { needle[it].toByte() }
        return (0..haystack.size - n.size).any { i -> n.indices.all { haystack[i + it] == n[it] } }
    }

    @Test
    fun jpegDropsExifCommentsAndXmpButKeepsTheIccProfileAndThePicture() {
        val icc = segment(0xe2, text("ICC_PROFILE") + listOf(0, 1, 2, 3))
        val file = bytes(
            listOf(0xff, 0xd8),
            segment(0xe0, text("JFIF") + listOf(0, 1, 1, 0, 0, 1, 0, 1, 0, 0)),
            segment(0xe1, exif(6)),
            segment(0xe1, text("http://ns.adobe.com/xap/1.0/") + listOf(0, 1)),
            icc,
            segment(0xfe, text("hello")),
            scan,
        )
        val out = ImageStrip.stripJpeg(file)
        assertNotNull(out)
        assertEquals(6, out!!.orientation)
        assertFalse(contains(out.data, text("Exif")))
        assertFalse(contains(out.data, text("xap")))
        assertFalse(contains(out.data, text("hello")))
        assertTrue(contains(out.data, text("ICC_PROFILE")))
        assertTrue(contains(out.data, text("JFIF")))
        assertArrayEquals(bytes(scan), out.data.copyOfRange(out.data.size - scan.size, out.data.size))
    }

    @Test
    fun jpegWithoutExifIsUpright() {
        val file = bytes(listOf(0xff, 0xd8), segment(0xe0, text("JFIF-abcdefg")), scan)
        assertEquals(1, ImageStrip.stripJpeg(file)?.orientation)
    }

    @Test
    fun littleEndianExifOrientationIsRead() {
        // "II", 42, IFD at 8, one entry: tag 0x0112, short, 1 value, 8
        val tiff = text("II") + listOf(42, 0) + listOf(8, 0, 0, 0) + listOf(1, 0) + listOf(0x12, 0x01) + listOf(3, 0) + listOf(1, 0, 0, 0) + listOf(8, 0) + listOf(0, 0) + listOf(0, 0, 0, 0)
        val file = bytes(listOf(0xff, 0xd8), segment(0xe1, text("Exif") + listOf(0, 0) + tiff), scan)
        assertEquals(8, ImageStrip.stripJpeg(file)?.orientation)
    }

    @Test
    fun notAJpegIsRejected() {
        assertNull(ImageStrip.stripJpeg(byteArrayOf(1, 2, 3, 4, 5)))
    }

    @Test
    fun truncatedJpegIsRejected() {
        val file = bytes(listOf(0xff, 0xd8), listOf(0xff, 0xe1, 0x01, 0x00, 1, 2, 3))
        assertNull(ImageStrip.stripJpeg(file))
    }

    private fun chunk(type: String, data: List<Int>) = be32(data.size) + text(type) + data + listOf(0, 0, 0, 0)

    private val sig = listOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    private val header = chunk("IHDR", listOf(0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0))

    @Test
    fun pngDropsTextExifAndTimeChunksOnly() {
        val file = bytes(
            sig,
            header,
            chunk("tEXt", text("Comment-secret")),
            chunk("eXIf", listOf(1, 2, 3)),
            chunk("tIME", listOf(1, 2, 3, 4, 5, 6, 7)),
            chunk("IDAT", listOf(9, 9, 9)),
            chunk("IEND", emptyList()),
        )
        val out = ImageStrip.stripPng(file)
        assertNotNull(out)
        assertArrayEquals(bytes(sig, header, chunk("IDAT", listOf(9, 9, 9)), chunk("IEND", emptyList())), out)
    }

    @Test
    fun notAPngIsRejected() {
        assertNull(ImageStrip.stripPng(ByteArray(30)))
    }

    @Test
    fun animatedPngsAreRecognisedAndKeepTheirAnimationChunks() {
        val animated = bytes(
            sig,
            header,
            chunk("acTL", listOf(0, 0, 0, 2, 0, 0, 0, 0)),
            chunk("tEXt", text("Comment-secret")),
            chunk("IDAT", listOf(9)),
            chunk("IEND", emptyList()),
        )
        val still = bytes(sig, header, chunk("IDAT", listOf(9)), chunk("IEND", emptyList()))
        assertTrue(ImageStrip.isAnimatedPng(animated))
        assertFalse(ImageStrip.isAnimatedPng(still))
        val out = ImageStrip.stripPng(animated)
        assertNotNull(out)
        assertTrue(ImageStrip.isAnimatedPng(out!!))
        assertFalse(contains(out, text("Comment")))
    }
}
