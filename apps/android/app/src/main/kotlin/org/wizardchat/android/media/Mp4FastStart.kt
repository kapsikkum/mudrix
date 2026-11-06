package org.wizardchat.android.media

import java.io.File
import java.io.RandomAccessFile
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Moves the `moov` box of an MP4 in front of its `mdat`, so the video can start playing before it has
 * fully downloaded. Android's `MediaMuxer` (and so the encoder) writes `moov` last. Chunk offsets in
 * `stco` / `co64` are shifted by the size of the box that moved in front of the media data.
 */
object Mp4FastStart {
    private const val HEADER = 8
    private val CONTAINERS = setOf("moov", "trak", "mdia", "minf", "stbl")

    private class Box(val type: String, val start: Long, val size: Long)

    private fun topLevelBoxes(file: RandomAccessFile): List<Box>? {
        val boxes = mutableListOf<Box>()
        var pos = 0L
        val length = file.length()
        val header = ByteArray(16)
        while (pos + HEADER <= length) {
            file.seek(pos)
            file.readFully(header, 0, HEADER)
            var size = u32(header, 0)
            val type = String(header, 4, 4, Charsets.ISO_8859_1)
            if (size == 1L) {
                if (pos + 16 > length) return null
                file.readFully(header, 8, 8)
                size = u64(header, 8)
            } else if (size == 0L) {
                size = length - pos
            }
            if (size < HEADER || pos + size > length) return null
            boxes += Box(type, pos, size)
            pos += size
        }
        return if (pos == length) boxes else null
    }

    private fun u32(b: ByteArray, at: Int): Long =
        ((b[at].toLong() and 0xff) shl 24) or ((b[at + 1].toLong() and 0xff) shl 16) or ((b[at + 2].toLong() and 0xff) shl 8) or (b[at + 3].toLong() and 0xff)

    private fun u64(b: ByteArray, at: Int): Long = (u32(b, at) shl 32) or u32(b, at + 4)

    private fun put32(b: ByteArray, at: Int, value: Long) {
        b[at] = (value shr 24).toByte()
        b[at + 1] = (value shr 16).toByte()
        b[at + 2] = (value shr 8).toByte()
        b[at + 3] = value.toByte()
    }

    private fun put64(b: ByteArray, at: Int, value: Long) {
        put32(b, at, value ushr 32)
        put32(b, at + 4, value and 0xffffffffL)
    }

    /** Adds [shift] to every chunk offset in the boxes between [from] and [to] of [moov]; false if an offset would not fit */
    private fun shiftOffsets(moov: ByteArray, from: Int, to: Int, shift: Long): Boolean {
        var pos = from
        while (pos + HEADER <= to) {
            var size = u32(moov, pos)
            var header = HEADER
            if (size == 1L) {
                size = u64(moov, pos + 8)
                header = 16
            } else if (size == 0L) {
                size = (to - pos).toLong()
            }
            if (size < header || pos + size > to) return false
            val type = String(moov, pos + 4, 4, Charsets.ISO_8859_1)
            val end = (pos + size).toInt()
            when (type) {
                in CONTAINERS -> if (!shiftOffsets(moov, pos + header, end, shift)) return false
                "stco", "co64" -> {
                    // version/flags (4), entry count (4), entries
                    val count = u32(moov, pos + header + 4).toInt()
                    val entrySize = if (type == "stco") 4 else 8
                    val first = pos + header + 8
                    if (first + count.toLong() * entrySize > end) return false
                    for (i in 0 until count) {
                        val at = first + i * entrySize
                        if (type == "stco") {
                            val moved = u32(moov, at) + shift
                            if (moved > 0xffffffffL) return false
                            put32(moov, at, moved)
                        } else {
                            put64(moov, at, u64(moov, at) + shift)
                        }
                    }
                }
            }
            pos = end
        }
        return true
    }

    /**
     * Rewrites [file] in place with `moov` before `mdat`. Returns false and leaves the file as it was
     * when it is already laid out that way, is fragmented, or is not an MP4 this can read.
     */
    fun apply(file: File): Boolean {
        val rewritten = File(file.parentFile, file.name + ".faststart")
        try {
            RandomAccessFile(file, "r").use { input ->
                val boxes = topLevelBoxes(input) ?: return false
                val moovIndex = boxes.indexOfFirst { it.type == "moov" }
                val mdatIndex = boxes.indexOfFirst { it.type == "mdat" }
                if (moovIndex < 0 || mdatIndex < 0 || moovIndex < mdatIndex || boxes.any { it.type == "moof" }) return false
                val moovBox = boxes[moovIndex]
                if (moovBox.size > 64L * 1024 * 1024) return false

                val moov = ByteArray(moovBox.size.toInt())
                input.seek(moovBox.start)
                input.readFully(moov)
                val header = if (u32(moov, 0) == 1L) 16 else HEADER
                if (!shiftOffsets(moov, header, moov.size, moovBox.size)) return false

                rewritten.outputStream().buffered().use { out ->
                    val buffer = ByteArray(1 shl 16)
                    fun copy(start: Long, size: Long) {
                        input.seek(start)
                        var left = size
                        while (left > 0) {
                            val read = input.read(buffer, 0, minOf(buffer.size.toLong(), left).toInt())
                            if (read < 0) error("Unexpected end of file")
                            out.write(buffer, 0, read)
                            left -= read
                        }
                    }
                    // Everything in front of the media data (ftyp, free, ...), then moov, then the rest without the old moov
                    val mdat = boxes[mdatIndex]
                    copy(0, mdat.start)
                    out.write(moov)
                    for (box in boxes) {
                        if (box.start >= mdat.start && box !== moovBox) copy(box.start, box.size)
                    }
                }
            }
            Files.move(rewritten.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
            return true
        } catch (_: Exception) {
            return false
        } finally {
            if (rewritten.exists()) rewritten.delete()
        }
    }
}
