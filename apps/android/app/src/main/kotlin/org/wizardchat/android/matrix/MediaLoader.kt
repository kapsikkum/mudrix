package org.wizardchat.android.matrix

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.LruCache
import java.io.File
import java.net.URLEncoder
import java.nio.ByteBuffer
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.wizardchat.android.WizardApplication
import org.wizardchat.core.DownloadProgress
import org.wizardchat.core.MediaSource
import org.wizardchat.core.WizardClient

/** Downloads (and decrypts) media through the core and keeps decoded images in memory */
class MediaLoader(val client: WizardClient) {
    private val cache = object : LruCache<String, Bitmap>(64 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    private val animatedCache = LruCache<String, Drawable>(24)
    private val inFlight = HashMap<String, CompletableDeferred<Bitmap?>>()
    private val files = File(WizardApplication.instance.cacheDir, "media")

    fun cachedThumbnail(key: String): Bitmap? = cache.get(key)

    fun store(image: Bitmap, key: String) {
        cache.put(key, image)
    }

    private val thumbnailSizes = HashMap<String, Int>()

    suspend fun thumbnail(url: String, size: Int = 96): Bitmap? {
        val pixels = standardSize(size)
        val cached = cache.get(url)
        if (cached != null && (thumbnailSizes[url] ?: 0) >= pixels) return cached
        val image = load("$url|$pixels", maxSide = pixels * 2) { it.thumbnail(url, pixels.toLong(), pixels.toLong(), if (pixels == 96) true else null) }
        if (image != null && (thumbnailSizes[url] ?: 0) < pixels) {
            store(image, url)
            thumbnailSizes[url] = pixels
        }
        return image ?: cache.get(url)
    }

    suspend fun image(source: MediaSource, thumbnailSize: Int?): Bitmap? =
        load("${key(source)}|${thumbnailSize ?: 0}", maxSide = thumbnailSize?.let { it * 2 } ?: MAX_FULL_SIDE) {
            it.media(source, thumbnailSize?.toLong(), thumbnailSize?.toLong())
        }

    /** A playing GIF/WebP (Android 9+); null if the image isn't animated */
    suspend fun animated(source: MediaSource): Drawable? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
        val key = key(source)
        animatedCache.get(key)?.let { return it }
        val data = runCatching { client.media(source) }.getOrNull() ?: return null
        val drawable = withContext(Dispatchers.Default) {
            runCatching { ImageDecoder.decodeDrawable(ImageDecoder.createSource(ByteBuffer.wrap(data))) }.getOrNull()
        } ?: return null
        if (drawable !is AnimatedImageDrawable) return null
        animatedCache.put(key, drawable)
        return drawable
    }

    /** The decrypted file on disk, e.g. to share or open in another app */
    suspend fun file(source: MediaSource, filename: String, sizeHint: Long? = null, onProgress: ((DownloadProgress) -> Unit)? = null): File {
        val folder = File(files, URLEncoder.encode(key(source), "UTF-8"))
        val file = File(folder, filename.replace('/', '-').trim().ifEmpty { "file" })
        if (file.exists()) return file
        val data = if (onProgress == null) {
            client.media(source)
        } else {
            // Cancelling the coroutine also stops the core's download, which would otherwise run on
            val token = UUID.randomUUID().toString()
            try {
                client.mediaDownload(source, sizeHint, token, onProgress)
            } catch (e: CancellationException) {
                withContext(NonCancellable) { runCatching { client.cancelMediaDownload(token) } }
                throw e
            }
        }
        withContext(Dispatchers.IO) {
            folder.mkdirs()
            file.writeBytes(data)
        }
        return file
    }

    private suspend fun load(key: String, maxSide: Int = MAX_FULL_SIDE, fetch: suspend (WizardClient) -> ByteArray): Bitmap? {
        cache.get(key)?.let { return it }
        inFlight[key]?.let { return it.await() }
        val deferred = CompletableDeferred<Bitmap?>()
        inFlight[key] = deferred
        val image = runCatching { fetch(client) }.getOrNull()?.let { data ->
            withContext(Dispatchers.Default) { decodeSampled(data, maxSide) }
        }
        inFlight.remove(key)
        if (image != null) store(image, key)
        deferred.complete(image)
        return image
    }

    companion object {
        /** Nothing is decoded larger than this on its longer side: a 48 MP photo would need ~190 MB and exceeds the GPU texture limit */
        const val MAX_FULL_SIDE = 4096

        /** The bitmap, decoded at a power-of-two fraction of its size so its longer side is not much over [maxSide] */
        fun decodeSampled(data: ByteArray, maxSide: Int): Bitmap? {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
            val longest = maxOf(bounds.outWidth, bounds.outHeight)
            var sample = 1
            while (longest / (sample * 2) >= maxSide) sample *= 2
            return BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
        }

        fun standardSize(size: Int): Int = listOf(96, 320, 640, 800).firstOrNull { it >= size } ?: 800

        fun key(source: MediaSource): String {
            val obj = source as? JsonObject ?: return source.toString()
            return obj["url"]?.jsonPrimitive?.content
                ?: (obj["file"] as? JsonObject)?.get("url")?.jsonPrimitive?.content
                ?: source.toString()
        }
    }
}
