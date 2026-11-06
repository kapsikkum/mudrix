package org.wizardchat.android.media

import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Mp4FastStartTest {
    private fun box(type: String, vararg payload: ByteArray): ByteArray {
        val body = payload.fold(ByteArray(0)) { a, b -> a + b }
        return ByteBuffer.allocate(8 + body.size).putInt(8 + body.size).put(type.toByteArray(Charsets.ISO_8859_1)).put(body).array()
    }

    private fun ints(vararg values: Int): ByteArray = ByteBuffer.allocate(values.size * 4).apply { values.forEach { putInt(it) } }.array()

    /** ftyp, mdat of [media], moov with one track whose chunk offsets point into the media data */
    private fun layout(media: ByteArray, moovFirst: Boolean): Pair<ByteArray, Int> {
        val ftyp = box("ftyp", "isom".toByteArray(), ints(0), "isom".toByteArray())
        val mdat = box("mdat", media)
        fun moov(mdatPayloadAt: Int): ByteArray {
            // version/flags, 2 entries: the first and the second half of the media data
            val stco = box("stco", ints(0, 2, mdatPayloadAt, mdatPayloadAt + media.size / 2))
            val stsz = box("stsz", ints(0, 0, 0))
            return box("moov", box("trak", box("mdia", box("minf", box("stbl", stsz, stco)))))
        }
        val moovSize = moov(0).size
        return if (moovFirst) {
            ftyp + moov(ftyp.size + moovSize + 8) + mdat to ftyp.size + moovSize + 8
        } else {
            ftyp + mdat + moov(ftyp.size + 8) to ftyp.size + 8
        }
    }

    private fun chunkOffsets(file: ByteArray): List<Int> {
        val at = (0..file.size - 4).first { String(file, it, 4, Charsets.ISO_8859_1) == "stco" } + 4
        val buffer = ByteBuffer.wrap(file, at, 16)
        buffer.int
        val count = buffer.int
        return List(count) { buffer.int }
    }

    private fun boxTypes(file: ByteArray): List<String> {
        val types = mutableListOf<String>()
        var pos = 0
        while (pos < file.size) {
            val size = ByteBuffer.wrap(file, pos, 4).int
            types += String(file, pos + 4, 4, Charsets.ISO_8859_1)
            pos += size
        }
        return types
    }

    @Test
    fun movesMoovInFrontAndShiftsChunkOffsets() {
        val media = ByteArray(1000) { (it % 251).toByte() }
        val (before, _) = layout(media, moovFirst = false)
        assertEquals(listOf("ftyp", "mdat", "moov"), boxTypes(before))
        val file = File.createTempFile("faststart", ".mp4").apply { writeBytes(before) }
        try {
            assertTrue(Mp4FastStart.apply(file))
            val after = file.readBytes()
            assertEquals(listOf("ftyp", "moov", "mdat"), boxTypes(after))
            assertEquals(before.size, after.size)
            // Each chunk offset still points at the same bytes of the media data
            val offsets = chunkOffsets(after)
            assertEquals(2, offsets.size)
            assertArrayEquals(media.copyOfRange(0, 500), after.copyOfRange(offsets[0], offsets[0] + 500))
            assertArrayEquals(media.copyOfRange(500, 1000), after.copyOfRange(offsets[1], offsets[1] + 500))
            assertEquals(layout(media, moovFirst = true).second, offsets[0])
        } finally {
            file.delete()
        }
    }

    @Test
    fun leavesAFileThatIsAlreadyFastStartAlone() {
        val (before, _) = layout(ByteArray(64), moovFirst = true)
        val file = File.createTempFile("faststart", ".mp4").apply { writeBytes(before) }
        try {
            assertFalse(Mp4FastStart.apply(file))
            assertArrayEquals(before, file.readBytes())
        } finally {
            file.delete()
        }
    }

    @Test
    fun leavesAFileThatIsNotAnMp4Alone() {
        val junk = ByteArrayOutputStream().apply { write(ByteArray(50) { 7 }) }.toByteArray()
        val file = File.createTempFile("faststart", ".mp4").apply { writeBytes(junk) }
        try {
            assertFalse(Mp4FastStart.apply(file))
            assertArrayEquals(junk, file.readBytes())
        } finally {
            file.delete()
        }
    }
}
