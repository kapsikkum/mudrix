package org.wizardchat.android.ui.room

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.webkit.WebView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.viewinterop.AndroidView
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.matrix.YouTubeEmbeds
import org.wizardchat.android.media.YouTubeLink
import org.wizardchat.android.media.YouTubeVideo
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SecondaryButton
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** What YouTube's oEmbed endpoint says about a video */
private class YouTubeInfo(val title: String?, val channel: String?, val thumbnailUrl: String?)

private val oembedCache = HashMap<String, YouTubeInfo?>()

private suspend fun fetchOembed(videoId: String): YouTubeInfo? {
    if (oembedCache.containsKey(videoId)) return oembedCache[videoId]
    val info = withContext(Dispatchers.IO) {
        runCatching {
            val watch = URLEncoder.encode("https://www.youtube.com/watch?v=$videoId", "UTF-8")
            val connection = URL("https://www.youtube.com/oembed?format=json&url=$watch").openConnection() as HttpURLConnection
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            try {
                if (connection.responseCode != 200) return@runCatching null
                val json = Json.parseToJsonElement(connection.inputStream.bufferedReader().readText()).jsonObject
                YouTubeInfo(
                    json["title"]?.jsonPrimitive?.contentOrNull,
                    json["author_name"]?.jsonPrimitive?.contentOrNull,
                    // Only YouTube's own image host is ever loaded
                    json["thumbnail_url"]?.jsonPrimitive?.contentOrNull?.takeIf { it.startsWith("https://i.ytimg.com/") },
                )
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }
    oembedCache[videoId] = info
    return info
}

/**
 * A YouTube link as a card. Until the "show YouTube embeds?" question is answered only a small
 * prompt is shown. With embeds on, the title and picture come from the homeserver's link preview
 * (so YouTube does not see this device) or, without one (encrypted rooms), from YouTube's oEmbed.
 * The video itself loads from the privacy-enhanced youtube-nocookie.com only once play is tapped.
 */
@Composable
fun YouTubeCard(url: String, video: YouTubeVideo, loader: LinkPreviewLoader?) {
    val prefs = LocalPrefs.current
    val media = LocalMedia.current
    val uriHandler = LocalUriHandler.current
    val mode = prefs.youtubeEmbeds
    var preview by remember(url) { mutableStateOf<LinkPreviewData?>(null) }
    var info by remember(video.id) { mutableStateOf<YouTubeInfo?>(null) }
    var thumbnail by remember(url) { mutableStateOf<Bitmap?>(null) }
    var playing by remember(url) { mutableStateOf(false) }
    var previewDone by remember(url) { mutableStateOf(false) }

    LaunchedEffect(url, mode, loader) {
        if (mode != YouTubeEmbeds.on) return@LaunchedEffect
        preview = loader?.preview(url)
        previewDone = true
    }
    LaunchedEffect(video.id, mode, previewDone, preview) {
        if (mode == YouTubeEmbeds.on && previewDone && preview?.title == null) info = fetchOembed(video.id)
    }
    LaunchedEffect(url, mode, preview, info) {
        if (mode != YouTubeEmbeds.on) return@LaunchedEffect
        // The homeserver's copy of the picture (never a direct third-party image), else YouTube's own host
        val homeserverImage = preview?.imageUrl?.takeIf { it.startsWith("mxc://") }
        thumbnail = if (homeserverImage != null) {
            media?.thumbnail(homeserverImage, 480)
        } else {
            info?.thumbnailUrl?.let { thumb ->
                withContext(Dispatchers.IO) { runCatching { URL(thumb).openStream().use { BitmapFactory.decodeStream(it) } }.getOrNull() }
            }
        }
    }

    if (mode == YouTubeEmbeds.off) return
    val cardModifier = Modifier
        .padding(top = WZ.Space.space2)
        .widthIn(max = WZ.Size.sidebar)
        .clip(RoundedCornerShape(WZ.Radius.lg))
        .background(theme.fill)
        .padding(WZ.Space.space4)

    if (mode == YouTubeEmbeds.ask) {
        Column(cardModifier, verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            Text("YouTube", style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            Text(tr("timeline.youtube.consent"), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                PrimaryButton(tr("timeline.youtube.allow"), { prefs.youtubeEmbeds = YouTubeEmbeds.on }, Modifier.weight(1f))
                SecondaryButton(tr("timeline.youtube.deny"), { prefs.youtubeEmbeds = YouTubeEmbeds.off }, Modifier.weight(1f))
            }
        }
        return
    }

    val title = preview?.title ?: info?.title ?: tr("timeline.youtube.video")
    val play = tr("timeline.youtube.play")
    Column(cardModifier, verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
        Text("YouTube", style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
        info?.channel?.let { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        Text(
            title,
            Modifier.clickable { runCatching { uriHandler.openUri(url) } },
            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
            color = theme.linkColor,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(WZ.Radius.md))
                .background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            if (playing) {
                EmbeddedPlayer(video, Modifier.fillMaxWidth().aspectRatio(16f / 9f))
            } else {
                thumbnail?.let { Image(it.asImageBitmap(), null, Modifier.matchParentSize(), contentScale = ContentScale.Crop) }
                Box(
                    Modifier
                        .size(WZ.Space.space11)
                        .clip(CircleShape)
                        .background(theme.overlay)
                        .clickable { playing = true }
                        .semantics { contentDescription = play },
                    contentAlignment = Alignment.Center,
                ) {
                    PhIcon("play", PhWeight.fill, size = WZ.SizeIcon.lg, tint = theme.textOnAccent)
                }
            }
        }
    }
}

/** The privacy-enhanced YouTube player; it is given a referrer (an origin of ours) because it refuses to play without one */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun EmbeddedPlayer(video: YouTubeVideo, modifier: Modifier = Modifier) {
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.domStorageEnabled = true
                setBackgroundColor(android.graphics.Color.BLACK)
                loadDataWithBaseURL(
                    "https://app.wizardchat.org/",
                    """
                    <!doctype html><html><head><meta charset="utf-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1">
                    <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#000}</style>
                    </head><body><iframe src="${YouTubeLink.embedUrl(video)}" title="YouTube"
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
                      referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>
                    """.trimIndent(),
                    "text/html",
                    "utf-8",
                    null,
                )
            }
        },
        onRelease = { it.destroy() },
        modifier = modifier,
    )
}
