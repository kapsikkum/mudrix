package chat.mudrix.android.ui.room

import android.graphics.Bitmap
import android.net.Uri
import android.util.LruCache
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import chat.mudrix.android.LocalPrefs
import chat.mudrix.android.media.EmbedLine
import chat.mudrix.android.media.EmbedMarkdown
import chat.mudrix.android.media.EmbedSpan
import chat.mudrix.android.media.LinkEmbedLoader
import chat.mudrix.android.media.LinkEmbedMatch
import chat.mudrix.android.media.LinkEmbedMode
import chat.mudrix.android.ui.BarTextButton
import chat.mudrix.android.ui.PhIcon
import chat.mudrix.android.ui.PhWeight
import chat.mudrix.android.ui.PrimaryButton
import chat.mudrix.android.ui.SecondaryButton
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.core.LinkEmbedBlock
import chat.mudrix.core.LinkEmbedCard
import chat.mudrix.core.LinkEmbedMedia
import chat.mudrix.core.LinkEmbedMediaKind
import chat.mudrix.tokens.WZ
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Most pictures and videos one card shows; the grid itself draws four, the rest sit behind a "+N" */
private const val MAX_MEDIA = 10
private const val GRID_CELLS = 4

private sealed interface EmbedState {
    data object Loading : EmbedState
    data object Missing : EmbedState
    data object Failed : EmbedState
    class Ready(val card: LinkEmbedCard) : EmbedState
}

/**
 * A link embeds.now can make a card for. With the service on, the card loads at once (that is the
 * consent, encrypted room or not); asked, only a prompt shows. When there is no card, or the
 * request fails, [fallback] (the plain link preview) is drawn instead.
 */
@Composable
fun EmbedsNowLink(match: LinkEmbedMatch, mode: LinkEmbedMode, fallback: @Composable () -> Unit) {
    var dismissed by remember(match.url) { mutableStateOf(false) }
    when {
        mode == LinkEmbedMode.off || dismissed -> fallback()
        mode == LinkEmbedMode.ask -> EmbedConsent(match, onDeny = { dismissed = true })
        else -> EmbedsNowCard(match, fallback)
    }
}

@Composable
private fun embedCardModifier() = Modifier
    .padding(top = WZ.Space.space2)
    .widthIn(max = WZ.SizeDialog.sm)
    .fillMaxWidth()
    .clip(RoundedCornerShape(WZ.Radius.lg))
    .background(theme.fill)

@Composable
private fun EmbedConsent(match: LinkEmbedMatch, onDeny: () -> Unit) {
    val prefs = LocalPrefs.current
    val service = match.service
    Column(
        embedCardModifier().padding(WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Text(service.label, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
        Text(tr("timeline.linkEmbed.consentCard", service.label), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            PrimaryButton(tr("timeline.linkEmbed.allow"), { prefs.setLinkEmbedMode(service, LinkEmbedMode.on) }, Modifier.weight(1f))
            SecondaryButton(tr("timeline.linkEmbed.deny"), onDeny, Modifier.weight(1f))
        }
    }
}

/** Loads the card (kept in memory per link) and draws it, a skeleton meanwhile */
@Composable
fun EmbedsNowCard(match: LinkEmbedMatch, fallback: @Composable () -> Unit) {
    val loader = LinkEmbedLoader.shared
    var state by remember(match.url) {
        mutableStateOf<EmbedState>(
            loader.cached(match.url).let { (known, card) ->
                if (!known) EmbedState.Loading else if (card == null) EmbedState.Missing else EmbedState.Ready(card)
            },
        )
    }
    LaunchedEffect(match.url) {
        if (state != EmbedState.Loading) return@LaunchedEffect
        state = try {
            loader.load(match.url)?.let { EmbedState.Ready(it) } ?: EmbedState.Missing
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            EmbedState.Failed
        }
    }
    when (val current = state) {
        EmbedState.Loading -> EmbedSkeleton(match.service.label)
        EmbedState.Missing, EmbedState.Failed -> fallback()
        is EmbedState.Ready -> EmbedCardContent(current.card, match.service.label)
    }
}

@Composable
private fun EmbedSkeleton(label: String) {
    val description = tr("timeline.linkEmbed.loading", label)
    Column(
        embedCardModifier().padding(WZ.Space.space4).semantics { contentDescription = description },
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        for (fraction in listOf(0.45f, 0.9f, 0.7f)) {
            Box(Modifier.fillMaxWidth(fraction).height(WZ.Space.space5).clip(RoundedCornerShape(WZ.Radius.sm)).background(theme.bgActive))
        }
    }
}

/** The card's accent, kept visible against the card (a black brand colour would vanish on a dark theme) */
@Composable
private fun accentColor(accent: Long?): Color {
    if (accent == null) return theme.linkColor
    val color = Color(0xFF000000L or (accent and 0xFFFFFFL))
    return if (kotlin.math.abs(color.luminance() - theme.fill.luminance()) < 0.08f) theme.textMuted else color
}

@Composable
private fun EmbedCardContent(card: LinkEmbedCard, serviceLabel: String) {
    val uriHandler = LocalUriHandler.current
    val open: (String) -> Unit = { url -> if (EmbedMarkdown.isSafeLink(url)) runCatching { uriHandler.openUri(url) } }
    var viewing by remember(card.url) { mutableStateOf<Pair<List<LinkEmbedMedia>, Int>?>(null) }
    Row(embedCardModifier().height(IntrinsicSize.Min)) {
        Box(Modifier.width(WZ.Space.space2).fillMaxHeight().background(accentColor(card.accent)))
        Column(
            Modifier.weight(1f).padding(WZ.Space.space4),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        ) {
            for (block in card.blocks) {
                when (block) {
                    is LinkEmbedBlock.Text -> EmbedTextBlock(block, open)
                    is LinkEmbedBlock.Gallery -> {
                        val items = block.items.filter { it.kind != LinkEmbedMediaKind.audio && EmbedMarkdown.isSafeLink(it.url) }.take(MAX_MEDIA)
                        if (items.isNotEmpty()) EmbedGallery(items, serviceLabel) { index -> viewing = items to index }
                    }
                    LinkEmbedBlock.Separator -> Box(Modifier.fillMaxWidth().height(1.dp).background(theme.border.copy(alpha = 0.6f)))
                    is LinkEmbedBlock.Buttons -> EmbedButtons(block, open)
                }
            }
            Text(tr("timeline.linkEmbed.via"), style = wizardFont(WZ.FontSize.xs), color = theme.textMuted)
        }
    }
    viewing?.let { (items, index) -> EmbedMediaViewer(items, index) { viewing = null } }
}

@Composable
private fun EmbedTextBlock(block: LinkEmbedBlock.Text, open: (String) -> Unit) {
    val lines = remember(block.markdown) { EmbedMarkdown.parse(block.markdown) }
    val linkColor = theme.linkColor
    Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            for (line in lines) {
                val text = remember(line, linkColor) { annotate(line, linkColor, open) }
                if (line.small) {
                    Text(text, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                } else {
                    Text(text, style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                }
            }
        }
        val thumbnail = block.thumbnail?.takeIf { EmbedMarkdown.isSafeLink(it.url) }
        if (thumbnail != null) {
            EmbedImage(
                thumbnail.url,
                thumbnail.description,
                Modifier.size(WZ.SizeAvatar.md).clip(RoundedCornerShape(WZ.Radius.lg)),
                maxSide = 256,
            )
        }
    }
}

private fun annotate(line: EmbedLine, linkColor: Color, open: (String) -> Unit): AnnotatedString = buildAnnotatedString {
    for (span in line.spans) {
        val weight = if (span.bold) FontWeight.Bold else null
        val link = span.link
        if (link != null) {
            val style = TextLinkStyles(SpanStyle(color = linkColor, fontWeight = weight))
            withLink(LinkAnnotation.Clickable(link, style) { open(link) }) { append(span.text) }
        } else {
            withStyle(SpanStyle(fontWeight = weight)) { append(span.text) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EmbedButtons(block: LinkEmbedBlock.Buttons, open: (String) -> Unit) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        for (button in block.buttons) {
            if (!EmbedMarkdown.isSafeLink(button.url)) continue
            Box(
                Modifier
                    .clip(RoundedCornerShape(WZ.Radius.md))
                    .background(theme.bgActive)
                    .clickable(role = Role.Button) { open(button.url) }
                    .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                contentAlignment = Alignment.Center,
            ) {
                Text(button.label, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.linkColor)
            }
        }
    }
}

/** Pictures and videos: one fills the width, two sit side by side, three or more make a mosaic of up to four cells */
@Composable
private fun EmbedGallery(items: List<LinkEmbedMedia>, serviceLabel: String, onOpen: (Int) -> Unit) {
    val gap = WZ.Space.space1
    val extra = (items.size - GRID_CELLS).coerceAtLeast(0)
    @Composable
    fun Cell(index: Int, modifier: Modifier) {
        EmbedMediaCell(items[index], serviceLabel, if (index == GRID_CELLS - 1) extra else 0, modifier) { onOpen(index) }
    }
    val shape = Modifier.fillMaxWidth().clip(RoundedCornerShape(WZ.Radius.md))
    when (items.size) {
        1 -> Cell(0, shape.aspectRatio(16f / 10f))
        2 -> Row(shape.aspectRatio(2f), horizontalArrangement = Arrangement.spacedBy(gap)) {
            Cell(0, Modifier.weight(1f).fillMaxHeight())
            Cell(1, Modifier.weight(1f).fillMaxHeight())
        }
        3 -> Row(shape.aspectRatio(4f / 3f), horizontalArrangement = Arrangement.spacedBy(gap)) {
            Cell(0, Modifier.weight(1f).fillMaxHeight())
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(gap)) {
                Cell(1, Modifier.weight(1f).fillMaxWidth())
                Cell(2, Modifier.weight(1f).fillMaxWidth())
            }
        }
        else -> Column(shape.aspectRatio(4f / 3f), verticalArrangement = Arrangement.spacedBy(gap)) {
            Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap)) {
                Cell(0, Modifier.weight(1f).fillMaxHeight())
                Cell(1, Modifier.weight(1f).fillMaxHeight())
            }
            Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap)) {
                Cell(2, Modifier.weight(1f).fillMaxHeight())
                Cell(3, Modifier.weight(1f).fillMaxHeight())
            }
        }
    }
}

@Composable
private fun EmbedMediaCell(media: LinkEmbedMedia, serviceLabel: String, more: Int, modifier: Modifier, onClick: () -> Unit) {
    val video = media.kind == LinkEmbedMediaKind.video
    val play = tr("timeline.linkEmbed.play", serviceLabel)
    Box(
        modifier
            .background(theme.bgActive)
            .clickable(role = Role.Button, onClick = onClick)
            .then(if (video) Modifier.semantics { contentDescription = play } else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (!video) EmbedImage(media.url, media.description, Modifier.fillMaxSize())
        if (video) {
            Box(
                Modifier.size(WZ.Space.space11).clip(CircleShape).background(theme.overlay),
                contentAlignment = Alignment.Center,
            ) {
                PhIcon("play", PhWeight.fill, size = WZ.SizeIcon.lg, tint = theme.textOnAccent)
            }
        }
        if (more > 0) {
            Box(Modifier.matchParentSize().background(theme.overlay), contentAlignment = Alignment.Center) {
                Text(tr("timeline.linkEmbed.moreMedia", more), style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textOnAccent)
            }
        }
    }
}

/** Decoded pictures kept for scrolling back; one big photo costs several MB, so the cap is in bytes */
private object EmbedBitmaps {
    private val cache = object : LruCache<String, Bitmap>(32 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    fun peek(url: String): Bitmap? = cache.get(url)

    suspend fun load(url: String, maxSide: Int): Bitmap? {
        cache.get(url)?.let { return it }
        return fetchPreviewImage(url, maxSide)?.also { cache.put(url, it) }
    }
}

/** A picture from an https host, fetched with the app's third-party request rules; a grey box until it arrives or if it never does */
@Composable
private fun EmbedImage(
    url: String,
    description: String?,
    modifier: Modifier,
    maxSide: Int = 1280,
    contentScale: ContentScale = ContentScale.Crop,
) {
    var bitmap by remember(url) { mutableStateOf(EmbedBitmaps.peek(url)) }
    LaunchedEffect(url) {
        if (bitmap == null) bitmap = withContext(Dispatchers.IO) { EmbedBitmaps.load(url, maxSide) }
    }
    Box(modifier.background(theme.bgActive)) {
        bitmap?.let { shown ->
            val image = remember(shown) { shown.asImageBitmap() }
            Image(image, description, Modifier.matchParentSize(), contentScale = contentScale)
        }
    }
}

/** Full-screen pictures to page through; a video page has the player's own controls and starts only when asked to */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun EmbedMediaViewer(items: List<LinkEmbedMedia>, start: Int, onDismiss: () -> Unit) {
    val pager = rememberPagerState(initialPage = start) { items.size }
    FullScreenDialog(onDismiss) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(pager, Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) { page ->
                val item = items[page]
                if (item.kind == LinkEmbedMediaKind.video) {
                    EmbedVideo(item.url, active = pager.currentPage == page, playNow = page == start)
                } else {
                    EmbedImage(item.url, item.description, Modifier.fillMaxSize().clickable(onClick = onDismiss), maxSide = 2048, contentScale = ContentScale.Fit)
                }
            }
            Box(Modifier.statusBarsPadding().padding(WZ.Space.space3)) {
                BarTextButton(tr("common.done"), onDismiss)
            }
        }
    }
}

/** A streamed video; [playNow] is true only for the one the person tapped to play */
@Composable
private fun EmbedVideo(url: String, active: Boolean, playNow: Boolean) {
    if (!active) return
    val context = LocalContext.current
    val player = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(Uri.parse(url)))
            prepare()
            playWhenReady = playNow
        }
    }
    DisposableEffect(player) { onDispose { player.release() } }
    AndroidView(factory = { PlayerView(it).apply { this.player = player } }, modifier = Modifier.fillMaxSize())
}
