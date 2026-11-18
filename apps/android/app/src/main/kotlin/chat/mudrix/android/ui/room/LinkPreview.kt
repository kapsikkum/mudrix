package chat.mudrix.android.ui.room

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import java.net.URI
import java.net.URISyntaxException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import chat.mudrix.android.LocalMedia
import chat.mudrix.android.integrations.IntegrationNetwork
import chat.mudrix.android.ui.tr
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.core.MudrixClient
import chat.mudrix.tokens.WZ

data class LinkPreviewData(
    val url: String,
    val title: String,
    val description: String?,
    val siteName: String,
    val imageUrl: String?,
)

/**
 * Fetches and caches link previews from the homeserver through the core. Only used in unencrypted
 * rooms, so the server never sees links from encrypted chats.
 */
class LinkPreviewLoader(val client: MudrixClient) {
    /** Call from the main thread */
    suspend fun preview(url: String): LinkPreviewData? {
        if (cache.containsKey(url)) return cache[url]
        inFlight[url]?.let { return it.await() }
        val deferred = CompletableDeferred<LinkPreviewData?>()
        inFlight[url] = deferred
        val result = runCatching { client.urlPreview(url) }.getOrNull()?.let { preview ->
            val title = preview.title?.trim()?.takeIf { it.isNotEmpty() } ?: return@let null
            val host = (Uri.parse(preview.url).host ?: Uri.parse(url).host ?: "").removePrefix("www.")
            LinkPreviewData(url, title, preview.description?.trim(), preview.siteName ?: host, preview.imageUrl)
        }
        inFlight.remove(url)
        cache[url] = result
        deferred.complete(result)
        return result
    }

    private companion object {
        val cache = HashMap<String, LinkPreviewData?>()
        val inFlight = HashMap<String, CompletableDeferred<LinkPreviewData?>>()
    }
}

/** Longest side kept when decoding a preview, so a small file cannot ask for a huge bitmap */
private const val MAX_PREVIEW_SIDE = 2048

/**
 * Loads a public https preview image through [IntegrationNetwork], so it gets the same rules as
 * every other third-party request: https only, no IP literals or local-looking names, only the one
 * host the preview named (and redirects may not leave it), a 5 MiB cap, a timeout, and no request
 * while streamer mode blocks passive traffic. Only the returned bytes are decoded. Anything else
 * (an `http` image, a local host, an answer that failed a rule) simply yields no image.
 */
private suspend fun fetchPreviewImage(imageUrl: String): Bitmap? {
    val uri = try {
        URI(imageUrl)
    } catch (_: URISyntaxException) {
        return null
    }
    if (!uri.scheme.equals("https", ignoreCase = true)) return null
    val host = uri.host?.lowercase() ?: return null
    if (IntegrationNetwork.isForbiddenHost(host)) return null
    val result = IntegrationNetwork.fetch(
        IntegrationNetwork.Request(
            url = imageUrl,
            allow = listOf(host),
            expect = IntegrationNetwork.Expect.image,
            maxBytes = IntegrationNetwork.MAX_IMAGE_BYTES,
            passive = true,
        ),
    ) as? IntegrationNetwork.Success ?: return null
    return decodePreviewImage(result.bytes)
}

private fun decodePreviewImage(bytes: ByteArray): Bitmap? {
    if (bytes.isEmpty()) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds) }.getOrNull() ?: return null
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_PREVIEW_SIDE) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) }.getOrNull()
}

@Composable
fun LinkPreviewCard(url: String, loader: LinkPreviewLoader) {
    val media = LocalMedia.current
    val uriHandler = LocalUriHandler.current
    var data by remember(url) { mutableStateOf<LinkPreviewData?>(null) }
    var image by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) {
        data = loader.preview(url)
        val imageUrl = data?.imageUrl ?: return@LaunchedEffect
        image = if (imageUrl.startsWith("mxc://")) {
            media?.thumbnail(imageUrl, 400)
        } else {
            withContext(Dispatchers.IO) { fetchPreviewImage(imageUrl) }
        }
    }
    val preview = data ?: return
    val hint = tr("timeline.opensTheLink")
    Row(
        Modifier
            .padding(top = WZ.Space.space2)
            .widthIn(max = WZ.Size.panel)
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .clickable { runCatching { uriHandler.openUri(preview.url) } }
            .semantics { contentDescription = "${preview.siteName} ${preview.title} $hint" }
            .padding(WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box(Modifier.width(WZ.Space.space1).fillMaxHeight().background(theme.linkColor, RoundedCornerShape(WZ.Radius.xs)))
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(preview.siteName, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            Text(
                preview.title,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.linkColor,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            preview.description?.takeIf { it.isNotEmpty() }?.let {
                Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textSecondary, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            image?.let {
                Image(
                    it.asImageBitmap(),
                    null,
                    Modifier
                        .padding(top = WZ.Space.space2)
                        .widthIn(max = WZ.Size.sidebar)
                        .heightIn(max = WZ.SizeAvatar.xxl)
                        .clip(RoundedCornerShape(WZ.Radius.md)),
                    contentScale = ContentScale.Crop,
                )
            }
        }
    }
}
