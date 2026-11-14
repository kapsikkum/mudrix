package org.wizardchat.android.ui.cosmetics

import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.LruCache
import com.caverock.androidsvg.SVG
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.wizardchat.android.WizardApplication

/**
 * Draws the SVG art to bitmaps once and keeps them. AndroidSVG covers shapes, gradients, clips and styles; it
 * has no filters (blur, noise), so glows come out as plain shapes.
 */
object CosmeticArt {
    private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    private fun key(path: String, width: Int) = "$path@$width"

    fun cached(path: String, width: Int): Bitmap? = cache.get(key(path, width))

    /** The art at `width` pixels wide, as tall as its own shape says; null when it cannot be drawn */
    suspend fun bitmap(path: String, width: Int): Bitmap? = withContext(Dispatchers.Default) {
        cached(path, width) ?: render(path, width)?.also { cache.put(key(path, width), it) }
    }

    private fun render(path: String, width: Int): Bitmap? = runCatching {
        val svg = SVG.getFromAsset(WizardApplication.instance.assets, path)
        val box = svg.documentViewBox
        val sourceWidth = if (box != null && box.width() > 0f) box.width() else svg.documentWidth
        val sourceHeight = if (box != null && box.height() > 0f) box.height() else svg.documentHeight
        val ratio = if (sourceWidth > 0f && sourceHeight > 0f) sourceHeight / sourceWidth else 1f
        val height = (width * ratio).toInt().coerceIn(1, width * 4)
        svg.documentWidth = width.toFloat()
        svg.documentHeight = height.toFloat()
        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { svg.renderToCanvas(Canvas(it)) }
    }.getOrNull()
}
