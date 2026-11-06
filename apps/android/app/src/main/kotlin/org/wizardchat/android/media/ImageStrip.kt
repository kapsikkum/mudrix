package org.wizardchat.android.media

import java.io.ByteArrayOutputStream

/**
 * Lossless metadata stripping for JPEG and PNG, on raw bytes, the same rules as the web's
 * `util/imageStrip.ts`. A JPEG loses its Exif, XMP, IPTC and comment segments (APPn except ICC
 * profile and Adobe, COM) up to the start of scan; a PNG loses eXIf, tEXt, zTXt, iTXt and tIME
 * chunks. The EXIF orientation is reported so the caller can redraw a rotated photo upright instead.
 */
object ImageStrip {
    private val PNG_SIGNATURE = intArrayOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

    /** PNG chunks that carry text, EXIF or timestamps rather than picture data */
    private val PNG_METADATA_CHUNKS = setOf("eXIf", "tEXt", "zTXt", "iTXt", "tIME")

    class Jpeg(val data: ByteArray, val orientation: Int)

    private fun ascii(bytes: ByteArray, start: Int, length: Int): String {
        val end = minOf(bytes.size, start + length)
        return if (start >= end) "" else String(bytes, start, end - start, Charsets.ISO_8859_1)
    }

    private fun u8(bytes: ByteArray, at: Int) = bytes[at].toInt() and 0xff

    private fun u16(bytes: ByteArray, at: Int, little: Boolean): Int =
        if (little) u8(bytes, at) or (u8(bytes, at + 1) shl 8) else (u8(bytes, at) shl 8) or u8(bytes, at + 1)

    private fun u32(bytes: ByteArray, at: Int, little: Boolean): Long {
        val high = u16(bytes, if (little) at + 2 else at, little).toLong()
        val low = u16(bytes, if (little) at else at + 2, little).toLong()
        return (high shl 16) or low
    }

    private fun isPng(bytes: ByteArray) = bytes.size >= 20 && PNG_SIGNATURE.indices.all { u8(bytes, it) == PNG_SIGNATURE[it] }

    /** The EXIF orientation (1-8) from the data of an APP1 "Exif" segment, or 1 when there is none */
    private fun readOrientation(segment: ByteArray): Int {
        // "Exif\0\0" then a TIFF header
        val tiff = 6
        if (segment.size < tiff + 8) return 1
        val little = ascii(segment, tiff, 2) == "II"
        val ifd = tiff + u32(segment, tiff + 4, little)
        if (ifd + 2 > segment.size) return 1
        val ifdAt = ifd.toInt()
        val count = u16(segment, ifdAt, little)
        for (i in 0 until count) {
            val entry = ifdAt + 2 + i * 12
            if (entry + 12 > segment.size) break
            if (u16(segment, entry, little) == 0x0112) return u16(segment, entry + 8, little)
        }
        return 1
    }

    /**
     * Cuts the Exif, XMP, IPTC and comment segments out of a JPEG without touching the picture. Colour
     * profiles and the markers a decoder needs stay. Null if the file isn't a JPEG this can read.
     */
    fun stripJpeg(bytes: ByteArray): Jpeg? {
        if (bytes.size < 4 || u8(bytes, 0) != 0xff || u8(bytes, 1) != 0xd8) return null
        val out = ByteArrayOutputStream(bytes.size)
        out.write(bytes, 0, 2)
        var orientation = 1
        var pos = 2
        while (pos + 4 <= bytes.size) {
            if (u8(bytes, pos) != 0xff) return null
            val marker = u8(bytes, pos + 1)
            if (marker == 0xff) {
                pos += 1
                continue
            }
            if (marker == 0xda) {
                // Start of scan: the rest is picture data
                out.write(bytes, pos, bytes.size - pos)
                return Jpeg(out.toByteArray(), orientation)
            }
            if (marker == 0x01 || marker in 0xd0..0xd8) {
                out.write(bytes, pos, 2)
                pos += 2
                continue
            }
            val end = pos + 2 + ((u8(bytes, pos + 2) shl 8) or u8(bytes, pos + 3))
            if (end > bytes.size) return null
            val body = if (end > pos + 4) bytes.copyOfRange(pos + 4, end) else ByteArray(0)
            var keep = true
            if (marker == 0xe1 && ascii(body, 0, 6) == "Exif\u0000\u0000") {
                orientation = readOrientation(body)
                keep = false
            } else if (marker == 0xe2) {
                keep = ascii(body, 0, 12) == "ICC_PROFILE\u0000"
            } else if (marker == 0xee) {
                keep = ascii(body, 0, 5) == "Adobe"
            } else if (marker == 0xfe || marker in 0xe1..0xef) {
                keep = false
            }
            if (keep) out.write(bytes, pos, end - pos)
            pos = end
        }
        return null
    }

    /** Whether a PNG is animated (APNG): it has an animation control chunk before its picture data */
    fun isAnimatedPng(bytes: ByteArray): Boolean {
        if (!isPng(bytes)) return false
        var pos = 8L
        while (pos + 12 <= bytes.size) {
            val at = pos.toInt()
            when (ascii(bytes, at + 4, 4)) {
                "acTL" -> return true
                "IDAT", "IEND" -> return false
            }
            pos += 12 + u32(bytes, at, little = false)
        }
        return false
    }

    /** Cuts the text, EXIF and timestamp chunks out of a PNG. Null if it isn't a PNG this can read */
    fun stripPng(bytes: ByteArray): ByteArray? {
        if (!isPng(bytes)) return null
        val out = ByteArrayOutputStream(bytes.size)
        out.write(bytes, 0, 8)
        var pos = 8L
        while (pos + 12 <= bytes.size) {
            val at = pos.toInt()
            val end = pos + 12 + u32(bytes, at, little = false)
            if (end > bytes.size) return null
            val type = ascii(bytes, at + 4, 4)
            if (type !in PNG_METADATA_CHUNKS) out.write(bytes, at, (end - pos).toInt())
            pos = end
            if (type == "IEND") return out.toByteArray()
        }
        return null
    }
}
