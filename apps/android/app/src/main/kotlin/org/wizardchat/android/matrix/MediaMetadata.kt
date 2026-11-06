package org.wizardchat.android.matrix

import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.net.Uri
import java.io.File
import java.io.InputStream
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.wizardchat.android.WizardApplication

/** Pixel sizes and durations of local files before they're sent */
object MediaMetadata {
    data class Video(val duration: Double?, val size: Pair<Int, Int>?)

    suspend fun imageSize(uri: Uri): Pair<Int, Int>? = withContext(Dispatchers.IO) {
        runCatching {
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            WizardApplication.instance.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }
            if (options.outWidth <= 0 || options.outHeight <= 0) return@runCatching null
            val rotated = WizardApplication.instance.contentResolver.openInputStream(uri)?.use(::isRotated) ?: false
            if (rotated) options.outHeight to options.outWidth else options.outWidth to options.outHeight
        }.getOrNull()
    }

    fun isRotated(stream: InputStream): Boolean = runCatching {
        ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) in 5..8
    }.getOrDefault(false)

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
        val dir = File(WizardApplication.instance.cacheDir, UUID.randomUUID().toString())
        dir.mkdirs()
        File(dir, filename).also { it.writeBytes(data) }
    }

    private fun <T> retrieve(uri: Uri, read: (MediaMetadataRetriever) -> T): T? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(WizardApplication.instance, uri)
            read(retriever)
        } catch (_: Exception) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }
}
