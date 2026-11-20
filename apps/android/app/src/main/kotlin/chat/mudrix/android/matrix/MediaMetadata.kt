package chat.mudrix.android.matrix

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.drawable.Drawable
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.nio.ByteBuffer
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import chat.mudrix.android.MudrixApplication
import chat.mudrix.android.util.safeFileName

/** Pixel sizes and durations of local files before they're sent */
object MediaMetadata {
    data class Video(val duration: Double?, val size: Pair<Int, Int>?)

    suspend fun imageSize(uri: Uri): Pair<Int, Int>? = withContext(Dispatchers.IO) {
        runCatching {
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            MudrixApplication.instance.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }
            if (options.outWidth <= 0 || options.outHeight <= 0) return@runCatching null
            val rotated = MudrixApplication.instance.contentResolver.openInputStream(uri)?.use(::isRotated) ?: false
            if (rotated) options.outHeight to options.outWidth else options.outWidth to options.outHeight
        }.getOrNull()
    }

    fun isRotated(stream: InputStream): Boolean = runCatching {
        ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) in 5..8
    }.getOrDefault(false)

    class Frame(val data: ByteArray, val width: Int, val height: Int)

    suspend fun videoFrame(uri: Uri, maxSize: Int = 800): Frame? = withContext(Dispatchers.IO) {
        retrieve(uri) { r ->
            val frame = r.getFrameAtTime(0) ?: return@retrieve null
            val scale = minOf(1f, maxSize.toFloat() / maxOf(frame.width, frame.height))
            val scaled = Bitmap.createScaledBitmap(frame, (frame.width * scale).toInt(), (frame.height * scale).toInt(), true)
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
            Frame(out.toByteArray(), scaled.width, scaled.height)
        }
    }

    /** An image, decoded with its longer side at most [MAX_DECODED_SIZE] pixels */
    fun decodeImage(data: ByteArray, size: Int?): Bitmap? = runCatching {
        if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(data))) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.setTargetSampleSize(sampleSize(maxOf(info.size.width, info.size.height), size))
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
            val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(maxOf(bounds.outWidth, bounds.outHeight), size) }
            BitmapFactory.decodeByteArray(data, 0, data.size, options)?.let { upright(it, data) }
        }
    }.getOrNull()

    /** A GIF or animated WebP, decoded with every frame's longer side at most [MAX_DECODED_SIZE] */
    @RequiresApi(Build.VERSION_CODES.P)
    fun decodeDrawable(data: ByteArray): Drawable? = runCatching {
        ImageDecoder.decodeDrawable(ImageDecoder.createSource(ByteBuffer.wrap(data))) { decoder, info, _ ->
            decoder.setTargetSampleSize(sampleSize(maxOf(info.size.width, info.size.height), null))
        }
    }.getOrNull()

    internal const val MAX_DECODED_SIZE = 2560

    private fun sampleSize(longest: Int, size: Int?): Int {
        val target = minOf(size ?: MAX_DECODED_SIZE, MAX_DECODED_SIZE)
        var sample = 1
        while (longest / (sample * 2) >= target) sample *= 2
        while (longest / sample > MAX_DECODED_SIZE) sample *= 2
        return sample
    }

    private fun upright(bitmap: Bitmap, data: ByteArray): Bitmap {
        val orientation = runCatching {
            ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> matrix.apply { setRotate(90f); postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> matrix.apply { setRotate(-90f); postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
            else -> return bitmap
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    suspend fun video(uri: Uri): Video = withContext(Dispatchers.IO) {
        retrieve(uri) { r ->
            val duration = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { it / 1000.0 }
            val width = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
            val height = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
            val rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            val size = if (width != null && height != null) {
                if (rotation % 180 != 0) height to width else width to height
            } else {
                null
            }
            Video(duration, size)
        } ?: Video(null, null)
    }

    suspend fun duration(uri: Uri): Double? = withContext(Dispatchers.IO) {
        retrieve(uri) { it.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { ms -> ms / 1000.0 } }
    }

    suspend fun temporaryCopy(data: ByteArray, filename: String): File = withContext(Dispatchers.IO) {
        val dir = File(MudrixApplication.instance.cacheDir, UUID.randomUUID().toString())
        dir.mkdirs()
        File(dir, safeFileName(filename)).also { it.writeBytes(data) }
    }

    private fun <T> retrieve(uri: Uri, read: (MediaMetadataRetriever) -> T): T? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(MudrixApplication.instance, uri)
            read(retriever)
        } catch (_: Exception) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }
}
