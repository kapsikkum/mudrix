package org.wizardchat.android.ui.cosmetics

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Deferred
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ProfileFields
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.cosmetics.CosmeticCatalog.Cosmetics
import org.wizardchat.core.WizardClient

/** Other people's cosmetics, asked once per person for a few minutes (one request each) */
object ProfileCosmeticsCache {
    private const val TTL_MS = 5 * 60_000L
    private class Entry(val at: Long, val value: Cosmetics)

    private val entries = ConcurrentHashMap<String, Entry>()
    private val pending = ConcurrentHashMap<String, Deferred<Cosmetics?>>()

    fun peek(userId: String): Cosmetics? = entries[userId]?.value

    fun invalidate(userId: String) {
        entries.remove(userId)
    }

    suspend fun get(client: WizardClient, userId: String, context: android.content.Context): Cosmetics? {
        entries[userId]?.takeIf { System.currentTimeMillis() - it.at < TTL_MS }?.let { return it.value }
        val request = CompletableDeferred<Cosmetics?>()
        val existing = pending.putIfAbsent(userId, request)
        if (existing != null) return existing.await()
        try {
            val value = runCatching { client.profileFields(userId) }.getOrNull()
                ?.let { CosmeticCatalog.resolve(context, ProfileFields.parse(it)) }
                ?: Cosmetics()
            entries[userId] = Entry(System.currentTimeMillis(), value)
            request.complete(value)
            return value
        } catch (error: Throwable) {
            request.complete(null)
            throw error
        } finally {
            pending.remove(userId)
        }
    }
}

/** "🎮 Playing Game" or "🎧 Listening to Song by Band", for a status line under a name */
fun activityLine(activity: org.wizardchat.android.matrix.ProfileActivity): String {
    val text = when {
        activity.type == "playing" -> org.wizardchat.android.ui.L10n.format("profile.activity.playing", activity.name)
        activity.details.isNotEmpty() -> org.wizardchat.android.ui.L10n.format("profile.activity.listeningBy", activity.name, activity.details)
        else -> org.wizardchat.android.ui.L10n.format("profile.activity.listening", activity.name)
    }
    return (if (activity.type == "playing") "🎮 " else "🎧 ") + text
}

/** A person's cosmetics, loading in the background; null until known (or when they have none to show) */
@Composable
fun rememberCosmetics(userId: String?): Cosmetics? {
    val session = LocalSession.current
    val context = LocalContext.current
    var value by remember(userId) { mutableStateOf(userId?.let(ProfileCosmeticsCache::peek)) }
    LaunchedEffect(userId, session.client) {
        val client = session.client ?: return@LaunchedEffect
        if (userId != null) value = ProfileCosmeticsCache.get(client, userId, context)
    }
    return value?.takeIf { !it.isEmpty }
}

/** An avatar with the person's decoration around it */
@Composable
fun CosmeticAvatar(userId: String?, name: String, url: String?, size: Dp, modifier: Modifier = Modifier) {
    val cosmetics = rememberCosmetics(userId)
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Avatar(name, url, size)
        DecorationOverlay(cosmetics?.decoration, size)
    }
}

/** The decoration art, 120% of the avatar and centred on it (it may reach past the avatar's own bounds) */
@Composable
fun DecorationOverlay(id: String?, size: Dp) {
    if (id == null) return
    val path = "cosmetics/decorations/$id.svg"
    val px = with(LocalDensity.current) { (size * DECORATION_SCALE).roundToPx() }
    var bitmap by remember(path, px) { mutableStateOf(CosmeticArt.cached(path, px)) }
    LaunchedEffect(path, px) {
        if (bitmap == null) bitmap = CosmeticArt.bitmap(path, px)
    }
    bitmap?.let { Image(it.asImageBitmap(), null, Modifier.requiredSize(size * DECORATION_SCALE)) }
}

private const val DECORATION_SCALE = 1.2f
private const val ART_WIDTH = 720

@Composable
private fun rememberArt(path: String?, width: Int = ART_WIDTH): androidx.compose.ui.graphics.ImageBitmap? {
    var bitmap by remember(path, width) { mutableStateOf(path?.let { CosmeticArt.cached(it, width) }) }
    LaunchedEffect(path, width) {
        if (path != null && bitmap == null) bitmap = CosmeticArt.bitmap(path, width)
    }
    return bitmap?.asImageBitmap()
}

/** Content on top of a nameplate: its art fills the row and fades in from the left, like on the web */
@Composable
fun NameplateBox(nameplate: CosmeticCatalog.Nameplate?, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    Box(modifier) {
        val art = rememberArt(nameplate?.file?.let(CosmeticCatalog::assetPath))
        if (art != null) {
            Image(
                art,
                null,
                Modifier
                    .matchParentSize()
                    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                    .drawWithContent {
                        drawContent()
                        drawRect(Brush.horizontalGradient(0f to Color.Transparent, 0.55f to Color.Black), blendMode = BlendMode.DstIn)
                    },
                contentScale = ContentScale.Crop,
                alignment = Alignment.Center,
            )
        }
        content()
    }
}

/** Content inside a profile frame: the back piece behind it, the top and bottom pieces over its edges */
@Composable
fun FrameBox(frame: CosmeticCatalog.Frame?, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    Box(modifier) {
        fun piece(pos: String, layer: String) = frame?.pieces?.firstOrNull { it.pos == pos && it.layer == layer }?.file?.let(CosmeticCatalog::assetPath)
        val back = rememberArt(piece("center", "back"))
        val top = rememberArt(piece("top", "front"))
        val bottom = rememberArt(piece("bottom", "front"))
        val centerFront = rememberArt(piece("center", "front"))
        if (back != null) Image(back, null, Modifier.matchParentSize(), contentScale = ContentScale.FillBounds)
        content()
        if (centerFront != null) Image(centerFront, null, Modifier.matchParentSize(), contentScale = ContentScale.FillBounds)
        if (top != null) Image(top, null, Modifier.fillMaxWidth().align(Alignment.TopCenter), contentScale = ContentScale.FillWidth)
        if (bottom != null) Image(bottom, null, Modifier.fillMaxWidth().align(Alignment.BottomCenter), contentScale = ContentScale.FillWidth)
    }
}
