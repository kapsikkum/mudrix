package org.wizardchat.android.ui.cosmetics

import android.graphics.Bitmap
import android.graphics.drawable.Drawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.ui.unit.dp
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ExtendedProfile
import org.wizardchat.android.matrix.ProfileFields
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.cosmetics.CosmeticCatalog.Cosmetics
import org.wizardchat.android.ui.cosmetics.CosmeticCatalog.FrameArt
import org.wizardchat.android.ui.cosmetics.CosmeticCatalog.Image as CosmeticImageSource
import org.wizardchat.android.ui.cosmetics.CosmeticCatalog.NameplateArt
import org.wizardchat.android.ui.room.AnimatedDrawable
import org.wizardchat.core.WizardClient

/** Other people's profiles, asked once per person for a few minutes (one request each) */
object ProfileCosmeticsCache {
    private const val TTL_MS = 5 * 60_000L
    private class Entry(val at: Long, val profile: ExtendedProfile)

    private val entries = ConcurrentHashMap<String, Entry>()
    private val pending = ConcurrentHashMap<String, Deferred<ExtendedProfile?>>()

    fun peek(userId: String): ExtendedProfile? = entries[userId]?.profile

    fun invalidate(userId: String) {
        entries.remove(userId)
    }

    suspend fun get(client: WizardClient, userId: String): ExtendedProfile? {
        entries[userId]?.takeIf { System.currentTimeMillis() - it.at < TTL_MS }?.let { return it.profile }
        val request = CompletableDeferred<ExtendedProfile?>()
        val existing = pending.putIfAbsent(userId, request)
        if (existing != null) return existing.await()
        try {
            val value = runCatching { client.profileFields(userId) }.getOrNull()?.let(ProfileFields::parse) ?: ExtendedProfile()
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

/** A profile resolved against the shipped art and the viewer's choice to show pack cosmetics */
@Composable
fun resolveCosmetics(profile: ExtendedProfile?): Cosmetics? {
    val context = LocalContext.current
    val prefs = LocalPrefs.current
    val showPacks = prefs.showCosmeticPacks
    return remember(profile, showPacks) {
        profile?.let { CosmeticCatalog.resolve(context, it, showPacks).takeIf { cosmetics -> !cosmetics.isEmpty } }
    }
}

/** A person's cosmetics, loading in the background; null until known (or when they have none to show) */
@Composable
fun rememberCosmetics(userId: String?): Cosmetics? {
    val session = LocalSession.current
    var profile by remember(userId) { mutableStateOf(userId?.let(ProfileCosmeticsCache::peek)) }
    LaunchedEffect(userId, session.client) {
        val client = session.client ?: return@LaunchedEffect
        if (userId != null) profile = ProfileCosmeticsCache.get(client, userId)
    }
    return resolveCosmetics(profile)
}

/** An avatar with the person's decoration around it */
@Composable
fun CosmeticAvatar(
    userId: String?,
    name: String,
    url: String?,
    size: Dp,
    modifier: Modifier = Modifier,
    animateDecoration: Boolean = false,
) {
    val cosmetics = rememberCosmetics(userId)
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Avatar(name, url, size)
        DecorationOverlay(cosmetics?.decoration, size, animateDecoration)
    }
}

/** The picture of a cosmetic, through the app's authenticated media loading; animated pictures play when asked */
@Composable
fun CosmeticImage(
    image: CosmeticImageSource?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Fit,
    animate: Boolean = false,
    width: Int = ART_WIDTH,
) {
    val media = LocalMedia.current
    val prefs = LocalPrefs.current
    val reduceMotion = prefs.reducesMotion(false)
    var drawable by remember(image, animate) { mutableStateOf<Drawable?>(null) }
    var bitmap by remember(image, width) {
        mutableStateOf((image as? CosmeticImageSource.Asset)?.path?.let { CosmeticArt.cached(it, width) })
    }
    LaunchedEffect(image, animate, media, reduceMotion) {
        when (image) {
            is CosmeticImageSource.Asset -> if (bitmap == null) bitmap = CosmeticArt.bitmap(image.path, width)
            is CosmeticImageSource.Media -> if (media != null) {
                if (animate && !reduceMotion) {
                    drawable = media.animated(JsonObject(mapOf("url" to JsonPrimitive(image.mxc))))
                    (drawable as? android.graphics.drawable.AnimatedImageDrawable)?.start()
                }
                if (drawable == null) bitmap = media.thumbnail(image.mxc, width)
            }
            null -> Unit
        }
    }
    when {
        drawable != null -> AnimatedDrawable(drawable!!, fit = true, modifier = modifier)
        bitmap != null -> Image(bitmap!!.asImageBitmap(), null, modifier, contentScale = contentScale)
    }
}

/** The decoration art, 120% of the avatar and centred on it (it may reach past the avatar's own bounds) */
@Composable
fun DecorationOverlay(image: CosmeticImageSource?, size: Dp, animate: Boolean = false) {
    if (image == null) return
    val px = with(LocalDensity.current) { (size * DECORATION_SCALE).roundToPx() }
    CosmeticImage(image, Modifier.requiredSize(size * DECORATION_SCALE), animate = animate, width = px)
}

private const val DECORATION_SCALE = 1.2f
private const val ART_WIDTH = 720

/** Content on top of a nameplate: its art fills the row and fades in from the left, like on the web */
@Composable
fun NameplateBox(nameplate: NameplateArt?, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val rgb = CosmeticCatalog.PALETTES[nameplate?.palette] ?: "0, 0, 0"
    val tint = numberList(rgb)
    Box(
        if (nameplate == null) {
            modifier
        } else {
            modifier.background(
                Brush.horizontalGradient(
                    listOf(Color(tint[0] / 255f, tint[1] / 255f, tint[2] / 255f, 0.2f), Color(tint[0] / 255f, tint[1] / 255f, tint[2] / 255f, 0.55f)),
                ),
            )
        },
    ) {
        if (nameplate != null) {
            CosmeticImage(
                nameplate.image,
                Modifier
                    .matchParentSize()
                    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                    .drawWithContent {
                        drawContent()
                        drawRect(Brush.horizontalGradient(0f to Color.Transparent, 0.55f to Color.Black), blendMode = BlendMode.DstIn)
                    },
                contentScale = ContentScale.Crop,
                animate = true,
            )
        }
        content()
    }
}

private fun numberList(rgb: String): List<Float> =
    rgb.split(',').mapNotNull { it.trim().toFloatOrNull() }.let { if (it.size == 3) it else listOf(0f, 0f, 0f) }

/** Content inside a profile frame: the back pieces behind it, the top and bottom ones over its edges */
@Composable
fun FrameBox(pieces: List<FrameArt>, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    Box(modifier) {
        pieces.filter { it.layer == "back" }.forEach { piece(it) }
        content()
        pieces.filter { it.layer != "back" }.forEach { piece(it) }
    }
}

@Composable
private fun BoxScope.piece(piece: FrameArt) {
    val alignment = when (piece.pos) {
        "top" -> Alignment.TopCenter
        "bottom" -> Alignment.BottomCenter
        else -> Alignment.Center
    }
    val fit = if (piece.pos == "center") Modifier.matchParentSize() else Modifier.fillMaxWidth().align(alignment)
    CosmeticImage(piece.image, fit, contentScale = if (piece.pos == "center") ContentScale.FillBounds else ContentScale.FillWidth, animate = true)
}

/** How long a pack effect's intro plays before its loop, when the intro cannot say */
private const val INTRO_MS = 3000L

/** The intro a pack effect opens with, looked up among the packs this account can see */
@Composable
fun rememberEffectIntro(effect: CosmeticImageSource?): String? {
    val session = LocalSession.current
    val mxc = (effect as? CosmeticImageSource.Media)?.mxc
    var intro by remember(mxc) { mutableStateOf<String?>(null) }
    LaunchedEffect(mxc, session.client) {
        intro = mxc?.let { org.wizardchat.android.matrix.CosmeticPackStore.effectIntro(session, it) }
    }
    return intro
}

/** A pack effect as a looping overlay over a profile, opening with its intro when the pack has one */
@Composable
fun EffectOverlay(effect: CosmeticImageSource?, intro: String?, modifier: Modifier = Modifier) {
    val media = effect as? CosmeticImageSource.Media ?: return
    val introMedia = intro?.let(CosmeticImageSource::Media)
    var introDone by remember(media.mxc) { mutableStateOf(introMedia == null) }
    LaunchedEffect(media.mxc, introMedia) {
        if (introMedia != null) {
            delay(INTRO_MS)
            introDone = true
        }
    }
    val source = if (introDone) media else introMedia ?: media
    CosmeticImage(source, modifier, contentScale = ContentScale.Crop, animate = true)
}
