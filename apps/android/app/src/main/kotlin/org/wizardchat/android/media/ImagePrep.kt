package org.wizardchat.android.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min

/**
 * Removes the metadata from a JPEG or PNG and/or scales it down before it is sent, like the web's
 * `util/imageSanitize.ts`. The metadata is cut out of the bytes ([ImageStrip]) when that leaves the
 * picture exactly as it was; otherwise (a JPEG that relies on its EXIF orientation, or one that is
 * scaled) the picture is drawn again. Other formats (GIF, WebP, ...) are never touched.
 */
object ImagePrep {
    /** [stripMetadata] removes location, camera and other embedded details; [maxSide] is the longest side a bigger photo is scaled to (null keeps the size) */
    data class Options(val stripMetadata: Boolean, val maxSide: Int?)

    enum class Format(val mimetype: String) { jpeg("image/jpeg"), png("image/png") }

    private const val JPEG_QUALITY = 86

    /** A scaled-down copy is only worth sending if it saves at least this much */
    private const val MIN_SAVING = 0.05

    /** The format of [bytes] when it is one this processes */
    fun formatOf(bytes: ByteArray): Format? = when {
        bytes.size > 3 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte() -> Format.jpeg
        bytes.size > 8 && bytes[0] == 0x89.toByte() && bytes[1] == 'P'.code.toByte() && bytes[2] == 'N'.code.toByte() && bytes[3] == 'G'.code.toByte() -> Format.png
        else -> null
    }

    /**
     * The bytes to send for [bytes]: the same array when nothing has to change. Throws when the
     * metadata has to go and that cannot be done, so the photo is never sent with its details.
     */
    fun prepare(bytes: ByteArray, options: Options): ByteArray {
        val format = formatOf(bytes) ?: return bytes
        if (!options.stripMetadata && options.maxSide == null) return bytes
        val jpeg = format == Format.jpeg

        // Drawing an animated PNG again would keep only its first frame, so it is only ever cut, never redrawn
        val animated = !jpeg && ImageStrip.isAnimatedPng(bytes)
        if (animated && !options.stripMetadata) return bytes
        val maxSide = options.maxSide
        val scaleDown = !animated && maxSide != null && longestSide(bytes) > maxSide

        var orientation = 1
        val result: ByteArray? = if (scaleDown) {
            // A JPEG's orientation must be known to draw it upright; one that cannot be read is drawn as it is
            if (jpeg) orientation = ImageStrip.stripJpeg(bytes)?.orientation ?: 1
            val drawn = runCatching { redraw(bytes, format, maxSide, orientation) }
            // A failed resize sends the original; a failed strip must not
            if (drawn.isFailure && options.stripMetadata) throw IllegalStateException("Could not draw the image again", drawn.exceptionOrNull())
            drawn.getOrNull()
        } else if (options.stripMetadata) {
            var cut: ByteArray? = null
            if (jpeg) {
                val stripped = ImageStrip.stripJpeg(bytes)
                if (stripped != null) {
                    orientation = stripped.orientation
                    // Without its EXIF orientation a rotated photo would show sideways, so it is drawn upright
                    if (orientation == 1) cut = stripped.data
                }
            } else {
                cut = ImageStrip.stripPng(bytes)
            }
            if (animated && cut == null) throw IllegalStateException("Could not read the animated image")
            cut ?: redraw(bytes, format, null, orientation)
        } else {
            null
        }
        if (result == null) return bytes
        // A scaled copy that isn't clearly smaller isn't worth it, unless the metadata had to go anyway
        if (!options.stripMetadata && result.size > bytes.size * (1 - MIN_SAVING)) return bytes
        return result
    }

    private fun longestSide(bytes: ByteArray): Int {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        return max(bounds.outWidth, bounds.outHeight)
    }

    /** The matrix that turns a picture stored with EXIF [orientation] upright */
    internal fun uprightMatrix(orientation: Int): Matrix = Matrix().apply {
        when (orientation) {
            2 -> setScale(-1f, 1f)
            3 -> setRotate(180f)
            4 -> setScale(1f, -1f)
            5 -> { setRotate(90f); postScale(-1f, 1f) }
            6 -> setRotate(90f)
            7 -> { setRotate(-90f); postScale(-1f, 1f) }
            8 -> setRotate(-90f)
        }
    }

    /** Draws the picture again, upright and at most [maxSide] on its long side; nothing else survives */
    private fun redraw(bytes: ByteArray, format: Format, maxSide: Int?, orientation: Int): ByteArray {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Not a picture" }
        val longest = max(bounds.outWidth, bounds.outHeight)
        val scale = if (maxSide != null) min(1.0, maxSide.toDouble() / longest) else 1.0
        // Decode at the nearest power of two that is still at least as large as the result, to keep memory low
        var sample = 1
        while (sample < 64 && sample * 2 <= 1.0 / scale) sample *= 2
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: error("Could not decode the picture")
        var current = decoded
        try {
            val matrix = uprightMatrix(orientation)
            // `scale` is of the full picture, the bitmap is already 1/sample of it
            val factor = (scale * sample).toFloat()
            if (factor != 1f) matrix.postScale(factor, factor)
            if (!matrix.isIdentity) {
                val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
                current = rotated
                if (rotated !== decoded) decoded.recycle()
            }
            val out = ByteArrayOutputStream(bytes.size)
            val compressFormat = if (format == Format.jpeg) Bitmap.CompressFormat.JPEG else Bitmap.CompressFormat.PNG
            check(current.compress(compressFormat, JPEG_QUALITY, out)) { "Could not encode the picture" }
            return out.toByteArray()
        } finally {
            current.recycle()
        }
    }
}
