package org.wizardchat.android.ui.people

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.tokens.WZ

/** Banners are shown in a 3:1 frame */
internal const val BANNER_RATIO = 3f

/** A person's profile banner, if they set one; nothing is drawn (and no space taken) without it */
@Composable
internal fun ProfileBanner(userId: String, reload: Int = 0, modifier: Modifier = Modifier, onLoaded: (Boolean) -> Unit = {}) {
    val session = LocalSession.current
    val media = LocalMedia.current
    var image by remember(userId) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(userId, reload) {
        val client = session.client
        val mxc = if (client != null) runCatching { client.banner(userId) }.getOrNull() else null
        image = if (mxc != null && media != null) media.thumbnail(mxc, BANNER_THUMBNAIL) else null
        onLoaded(mxc != null)
    }
    val bitmap = image ?: return
    Box(
        modifier
            .fillMaxWidth()
            .aspectRatio(BANNER_RATIO)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill),
    ) {
        Image(bitmap.asImageBitmap(), null, Modifier.fillMaxWidth().aspectRatio(BANNER_RATIO), contentScale = ContentScale.Crop)
    }
}

private const val BANNER_THUMBNAIL = 640

internal data class CropRect(val x: Int, val y: Int, val width: Int, val height: Int)

/** The biggest 3:1 strip from the middle of a picture */
internal fun bannerCropRect(width: Int, height: Int): CropRect {
    val cropHeight = minOf(height, (width / BANNER_RATIO).toInt()).coerceAtLeast(1)
    val cropWidth = minOf(width, (cropHeight * BANNER_RATIO).toInt()).coerceAtLeast(1)
    return CropRect((width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight)
}

/** A picked picture cropped from the middle to a 3:1 strip, at most 1200 pixels wide */
internal fun cropBanner(source: Bitmap, maxWidth: Int = 1200): Bitmap {
    val rect = bannerCropRect(source.width, source.height)
    val cropped = Bitmap.createBitmap(source, rect.x, rect.y, rect.width, rect.height)
    if (cropped.width <= maxWidth) return cropped
    return Bitmap.createScaledBitmap(cropped, maxWidth, (maxWidth / BANNER_RATIO).toInt().coerceAtLeast(1), true)
}
