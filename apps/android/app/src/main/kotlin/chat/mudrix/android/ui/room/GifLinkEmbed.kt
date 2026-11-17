package chat.mudrix.android.ui.room

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import chat.mudrix.android.media.GifApi
import chat.mudrix.android.media.GifItem
import chat.mudrix.android.media.GifLink
import chat.mudrix.android.ui.composer.RemoteAnimatedImage
import chat.mudrix.android.ui.composer.composerDefaults
import chat.mudrix.android.ui.composer.download
import chat.mudrix.android.ui.composer.gifApiKey
import chat.mudrix.tokens.WZ

/**
 * A message whose text is nothing but a GIPHY or KLIPY link shows the GIF itself, the web's `GifLinkEmbed`. Only after
 * the person agreed to contact the GIF services (the picker's consent); until then, and when the GIF cannot be
 * fetched, [content] is shown unchanged.
 */
@Composable
fun GifLinkEmbed(body: String, content: @Composable () -> Unit) {
    val target = remember(body) { GifLink.parse(body) }
    var gif by remember(target) { mutableStateOf<GifItem?>(null) }
    var failed by remember(target) { mutableStateOf(false) }

    LaunchedEffect(target) {
        gif = null
        failed = false
        val link = target ?: return@LaunchedEffect
        if (!composerDefaults.getBoolean("gifConsent", false)) return@LaunchedEffect
        val resolved = resolve(link)
        if (resolved != null) gif = resolved else failed = true
    }

    val shown = gif
    if (shown == null || failed) {
        content()
        return
    }
    val width = shown.width.toFloat().takeIf { it > 0f }
    val height = shown.height.toFloat().takeIf { it > 0f }
    val ratio = if (width != null && height != null) (width / height).coerceIn(0.5f, 2.5f) else 1.6f
    Box(
        Modifier
            .widthIn(max = 260.dp)
            .fillMaxWidth()
            .aspectRatio(ratio)
            .clip(RoundedCornerShape(WZ.Radius.lg)),
    ) {
        RemoteAnimatedImage(shown.previewUrl, Modifier.fillMaxSize())
    }
}

/** A GIPHY link has a stable media URL; a KLIPY page link needs its API (and a key in this build) */
private suspend fun resolve(target: GifLink.Target): GifItem? {
    GifLink.direct(target)?.let { return it }
    val slug = (target as? GifLink.KlipySlug)?.slug ?: return null
    val key = gifApiKey(GifItem.KLIPY)
    if (key.isEmpty()) return null
    val data = download(GifApi.klipyItemUrl(key, slug)) ?: return null
    return GifApi.parseKlipy(data.decodeToString()).firstOrNull()
}
