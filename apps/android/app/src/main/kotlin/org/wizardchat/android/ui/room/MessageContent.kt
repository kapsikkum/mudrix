package org.wizardchat.android.ui.room

import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.drawable.Animatable
import android.graphics.drawable.Drawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.ImageView
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.matrix.MediaVisibility
import org.wizardchat.android.matrix.memberProfile
import org.wizardchat.android.media.TextFile
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.composer.PackThumb
import org.wizardchat.android.ui.space.LocalRoomRoles
import org.wizardchat.android.ui.theme.nameColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.MediaSource
import org.wizardchat.core.ThreadSummaryView
import org.wizardchat.tokens.WZ

/** Whether media should start covered: spoilers always, otherwise by the "Show media" setting */
@Composable
internal fun mediaHidden(revealed: Boolean, spoiler: String?, isPrivateRoom: Boolean): Boolean {
    if (revealed) return false
    if (spoiler != null) return true
    return when (LocalPrefs.current.mediaVisibility) {
        MediaVisibility.always -> false
        MediaVisibility.private -> !isPrivateRoom
        MediaVisibility.never -> true
    }
}

/** A frosted cover over hidden media */
@Composable
internal fun BoxScope.MaterialCover() {
    Box(Modifier.matchParentSize().background(theme.bgSecondary.copy(alpha = 0.82f)))
}

/** Taps that leave long presses to the message menu */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.messageTap(
    interactionSource: MutableInteractionSource? = null,
    onClick: () -> Unit,
): Modifier = combinedClickable(
    interactionSource = interactionSource,
    indication = null,
    onLongClick = LocalMessageLongPress.current,
    onClick = onClick,
)

/** A full-screen page over everything */
@Composable
internal fun FullScreenDialog(onDismiss: () -> Unit, content: @Composable () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
        content = content,
    )
}

/** A `content://` URI other apps can read */
internal fun shareableUri(context: Context, file: File): Uri =
    FileProvider.getUriForFile(context, "${context.packageName}.files", file)

/** Opens a downloaded file in another app */
internal fun openFile(context: Context, file: File, mimetype: String?) {
    try {
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(shareableUri(context, file), mimetype ?: "*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(Intent.createChooser(intent, file.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
        CopyToast.show(L10n.format("common.somethingWentWrong"))
    }
}

internal fun shareFile(context: Context, file: File, mimetype: String) {
    try {
        val intent = Intent(Intent.ACTION_SEND)
            .setType(mimetype)
            .putExtra(Intent.EXTRA_STREAM, shareableUri(context, file))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(intent, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
        CopyToast.show(L10n.format("common.somethingWentWrong"))
    }
}

internal suspend fun saveToPhotos(context: Context, file: File, mimetype: String) {
    val saved = withContext(Dispatchers.IO) {
        runCatching {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, file.name)
                put(MediaStore.Images.Media.MIME_TYPE, mimetype)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/WizardChat")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: error("insert failed")
            resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            }
        }.isSuccess
    }
    CopyToast.show(L10n.format(if (saved) "common.savedToPhotos" else "common.somethingWentWrong"))
}

/** Shows a playing GIF/WebP drawable */
@Composable
internal fun AnimatedDrawable(drawable: Drawable, fit: Boolean, modifier: Modifier = Modifier) {
    AndroidView(
        factory = { ImageView(it) },
        modifier = modifier,
        update = { view ->
            view.scaleType = if (fit) ImageView.ScaleType.FIT_CENTER else ImageView.ScaleType.CENTER_CROP
            if (view.drawable !== drawable) {
                view.setImageDrawable(drawable)
                (drawable as? Animatable)?.start()
            }
        },
    )
}

@Composable
fun ImageMessageView(
    media: ChatEntry.MediaContent,
    isSticker: Boolean = false,
    isPrivateRoom: Boolean = true,
    spoiler: String? = null,
    onStickerTap: (() -> Unit)? = null,
    radius: Dp = 14.dp,
) {
    val prefs = LocalPrefs.current
    val loader = LocalMedia.current
    val animatesMedia = LocalAnimatesMedia.current
    var revealed by remember { mutableStateOf(false) }
    var playing by remember { mutableStateOf(false) }
    var showViewer by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val holding by interaction.collectIsPressedAsState()
    val hidden = mediaHidden(revealed, spoiler, isPrivateRoom)
    val canAnimate = media.isAnimated || isSticker || media.mimetype in listOf("image/gif", "image/webp", "image/apng")
    val animate = canAnimate && (prefs.autoplayGifs || playing || holding || animatesMedia)

    var image by remember(media.source) { mutableStateOf<Bitmap?>(null) }
    var animated by remember(media.source) { mutableStateOf<Drawable?>(null) }
    var failed by remember(media.source) { mutableStateOf(false) }
    var attempt by remember(media.source) { mutableIntStateOf(0) }
    LaunchedEffect(animate, hidden, loader, attempt) {
        if (hidden || loader == null) return@LaunchedEffect
        if (animate) animated = loader.animated(media.source)
        if (image == null) image = loader.image(media.source, if (animate) null else 800)
        failed = image == null && animated == null
    }

    val maxWidth = if (isSticker) 160f else 260f
    val maxHeight = if (isSticker) 160f else 320f
    val width = media.width ?: maxWidth
    val height = media.height ?: (maxWidth * 0.75f)
    val scale = minOf(maxWidth / maxOf(width, 1f), maxHeight / maxOf(height, 1f), 1f)
    val shape = RoundedCornerShape(if (isSticker) 0.dp else radius)

    Box(
        Modifier
            .size(maxOf(width * scale, 60f).dp, maxOf(height * scale, 60f).dp)
            .clip(shape)
            .messageTap(interaction) {
                when {
                    hidden -> revealed = true
                    failed -> {
                        failed = false
                        attempt += 1
                    }
                    canAnimate && !animate && !isSticker -> playing = true
                    isSticker -> onStickerTap?.invoke()
                    !isSticker -> showViewer = true
                }
            }
            .semantics { contentDescription = media.body },
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = image
        val drawable = animated
        val blur = if (hidden) Modifier.blur(24.dp) else Modifier
        when {
            animate && drawable != null && !hidden -> AnimatedDrawable(drawable, fit = isSticker, modifier = Modifier.fillMaxSize())
            bitmap != null -> Image(
                bitmap.asImageBitmap(),
                null,
                Modifier.fillMaxSize().then(blur),
                contentScale = if (isSticker) ContentScale.Fit else ContentScale.Crop,
            )
            failed && !hidden -> FailedPicture()
            else -> {
                Box(Modifier.fillMaxSize().background(theme.fill))
                if (!hidden) Spinner(color = theme.textMuted)
            }
        }
        if (hidden) {
            MaterialCover()
            if (spoiler != null) {
                SpoilerCover(spoiler)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    PhIcon("eye", tint = theme.textPrimary, size = WZ.SizeIcon.sm)
                    Text(tr("timeline.showMedia"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
                }
            }
        } else if (media.isAnimated && !animate) {
            Text(
                tr("composer.gif"),
                Modifier.background(theme.overlay, CircleShape).padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space2),
                style = wizardFont(WZ.FontSize.sm, FontWeight.Bold),
                color = theme.textOnAccent,
            )
        }
    }
    if (showViewer) {
        ImageViewer(image, animated.takeIf { canAnimate }, media.caption ?: media.filename, media.source, media.filename, media.mimetype) {
            showViewer = false
        }
    }
}

/** A picture that could not be loaded: a warning tile; tapping it tries again */
@Composable
internal fun FailedPicture(modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().background(theme.fill).padding(WZ.Space.space4),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space2, Alignment.CenterVertically),
    ) {
        PhIcon("warning-circle", size = WZ.SizeIcon.xl, tint = theme.warningColor)
        Text(tr("mobile.imageFailed"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/** The full-screen picture with zoom */
@Composable
fun ImageViewer(
    image: Bitmap?,
    animated: Drawable?,
    title: String,
    source: MediaSource?,
    filename: String,
    mimetype: String?,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val loader = LocalMedia.current
    val scope = rememberCoroutineScope()
    var dim by remember { mutableFloatStateOf(0f) }
    var bars by remember { mutableStateOf(true) }
    var menu by remember { mutableStateOf(false) }
    FullScreenDialog(onDismiss) {
        // The black fades as the picture is dragged away; `dim` is read while drawing only
        Box(Modifier.fillMaxSize().drawBehind { drawRect(Color.Black.copy(alpha = 1f - dim * 0.85f)) }) {
            ZoomableBox(
                Modifier.fillMaxSize().navigationBarsPadding(),
                onDismissDrag = { dim = it },
                onDismiss = onDismiss,
                onTap = { bars = !bars },
                onLongPress = { if (image != null && source != null) menu = true },
            ) {
                when {
                    animated != null -> AnimatedDrawable(animated, fit = true, modifier = Modifier.fillMaxSize())
                    image != null -> Image(image.asImageBitmap(), title, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                }
            }
            AnimatedVisibility(bars && dim < 0.05f, Modifier.align(Alignment.TopCenter), enter = fadeIn(), exit = fadeOut()) {
                Row(
                    Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.55f)).statusBarsPadding().height(WZ.Space.space11)
                        .padding(horizontal = WZ.Space.space3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BarTextButton(tr("common.done"), onDismiss)
                    Text(
                        title,
                        Modifier.weight(1f),
                        style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                    )
                    if (image != null && source != null && loader != null) {
                        BarButton("dots-three", tr("common.more"), { menu = true }, weight = PhWeight.bold)
                        BarButton("export", tr("desktopPicker.share"), {
                            scope.launch {
                                val file = runCatching { loader.file(source, filename) }.getOrNull() ?: return@launch
                                shareFile(context, file, mimetype ?: "image/*")
                            }
                        })
                    } else {
                        Spacer(Modifier.size(WZ.Space.space11))
                    }
                }
            }
        }
        if (menu && source != null) LocalMediaMenu(source, filename, mimetype, isImage = true) { menu = false }
    }
}

/** A started download is given up after this long */
private const val DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000L

@Composable
fun VideoMessageView(media: ChatEntry.MediaContent, spoiler: String? = null, radius: Dp = WZ.Radius.lg) {
    val loader = LocalMedia.current
    val scope = rememberCoroutineScope()
    var revealed by remember { mutableStateOf(false) }
    var thumbnail by remember(media.source) { mutableStateOf<Bitmap?>(null) }
    var loading by remember { mutableStateOf(false) }
    var playing by remember { mutableStateOf<File?>(null) }
    var download by remember { mutableStateOf<Job?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    val width = 260f
    val ratio = (media.height ?: 9f) / maxOf(media.width ?: 16f, 1f)
    LaunchedEffect(media.thumbnail, loader) {
        val source = media.thumbnail ?: return@LaunchedEffect
        thumbnail = loader?.image(source, 600)
    }
    val description = tr("timeline.summary.video")
    Box(
        Modifier
            .size(width.dp, minOf(width * ratio, 340f).dp)
            .clip(RoundedCornerShape(radius))
            .background(theme.fill)
            .messageTap {
                if (spoiler != null && !revealed) {
                    revealed = true
                } else if (!loading && loader != null) {
                    // Nothing is downloaded until now; the video plays as soon as it is ready
                    download = scope.launch {
                        loading = true
                        progress = null
                        try {
                            // The core reports how much has arrived; a stalled download needs a cap
                            playing = withTimeout(DOWNLOAD_TIMEOUT_MS) {
                                loader.file(media.source, media.filename, media.size) { p ->
                                    val total = p.total ?: media.size
                                    progress = if (total != null && total > 0) (p.received.toFloat() / total).coerceIn(0f, 1f) else null
                                }
                            }
                        } catch (e: TimeoutCancellationException) {
                            CopyToast.show(L10n.format("timeline.video.downloadFailed", e.message ?: ""))
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            CopyToast.show(L10n.format("timeline.video.downloadFailed", e.message ?: ""))
                        } finally {
                            loading = false
                        }
                    }
                }
            }
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        val covered = spoiler != null && !revealed
        thumbnail?.let {
            Image(it.asImageBitmap(), null, Modifier.fillMaxSize().then(if (covered) Modifier.blur(24.dp) else Modifier), contentScale = ContentScale.Crop)
        }
        when {
            covered -> {
                MaterialCover()
                SpoilerCover(spoiler ?: "")
            }
            loading -> {
                val shown = progress
                if (shown == null) {
                    Spinner(color = theme.textOnAccent)
                } else {
                    CircularProgressIndicator(
                        progress = { shown },
                        color = theme.textOnAccent,
                        trackColor = theme.overlay,
                        strokeWidth = 3.dp,
                        modifier = Modifier.size(WZ.Space.space11),
                    )
                    Text(
                        "${(shown * 100).toInt()}%",
                        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                        color = theme.textOnAccent,
                    )
                }
                val cancel = tr("timeline.video.cancelDownload")
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(WZ.Space.space3)
                        .clip(CircleShape)
                        .background(theme.overlay)
                        .clickable { download?.cancel() }
                        .semantics { contentDescription = cancel },
                ) {
                    PhIcon("x-circle", size = WZ.SizeIcon.md, tint = theme.textOnAccent)
                }
            }
            else -> {
                val play = tr("timeline.video.play")
                Box(
                    Modifier.size(WZ.Space.space11).background(theme.overlay, CircleShape).semantics { contentDescription = play },
                    contentAlignment = Alignment.Center,
                ) {
                    PhIcon("play", PhWeight.fill, size = WZ.SizeIcon.lg, tint = theme.textOnAccent)
                }
            }
        }
        // Size and length, so a big video is known before it is downloaded
        val details = listOfNotNull(
            media.size?.let { Formats.fileSize(it) },
            media.duration?.takeIf { it > 0 }?.let { Formats.duration(it) },
        ).joinToString(" · ")
        if (details.isNotEmpty()) {
            Text(
                details,
                Modifier.align(Alignment.BottomEnd).padding(WZ.Space.space4)
                    .background(theme.overlay, CircleShape)
                    .padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space1),
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.textOnAccent,
            )
        }
    }
    playing?.let { file -> VideoPlayer(file) { playing = null } }
}

/** Plays a downloaded video full screen */
@Composable
fun VideoPlayer(file: File, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val player = remember(file) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))
            prepare()
            playWhenReady = true
        }
    }
    DisposableEffect(player) { onDispose { player.release() } }
    FullScreenDialog(onDismiss) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(
                factory = { PlayerView(it).apply { this.player = player } },
                modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(),
            )
            Box(Modifier.statusBarsPadding().padding(WZ.Space.space3)) {
                BarTextButton(tr("common.done"), onDismiss)
            }
        }
    }
}

@Composable
fun FileMessageView(media: ChatEntry.MediaContent, bubble: Boolean = false, ownBubble: Boolean = false) {
    if (TextFile.showsCard(media.filename, media.mimetype, media.size)) {
        TextFileCard(media, bubble, ownBubble)
    } else {
        FileRow(media, bubble, ownBubble)
    }
}

@Composable
private fun FileRow(media: ChatEntry.MediaContent, bubble: Boolean, ownBubble: Boolean) {
    val loader = LocalMedia.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(false) }
    Row(
        Modifier
            .widthIn(max = WZ.Size.sidebar)
            .clip(RoundedCornerShape(if (bubble) WZ.Radius.sm else WZ.Radius.lg))
            .background(theme.fill)
            .messageTap {
                if (loader == null || loading) return@messageTap
                scope.launch {
                    loading = true
                    val file = runCatching { loader.file(media.source, media.filename) }.getOrNull()
                    loading = false
                    if (file != null) openFile(context, file, media.mimetype)
                }
            }
            .padding(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Box(
            Modifier.size(WZ.Space.space10).background(theme.accent.copy(alpha = 0.14f), RoundedCornerShape(WZ.Radius.lg)),
            contentAlignment = Alignment.Center,
        ) {
            PhIcon("file", size = WZ.SizeIcon.lg, tint = theme.accent)
        }
        Column(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(
                media.filename,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = if (ownBubble) theme.textOnAccent else theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            media.size?.let {
                Text(Formats.fileSize(it), style = wizardFont(WZ.FontSize.sm), color = if (ownBubble) theme.textOnAccent.copy(alpha = 0.75f) else theme.textMuted)
            }
        }
        Spacer(Modifier.weight(0.001f))
        if (loading) Spinner(size = WZ.SizeIcon.md) else PhIcon("download-simple", tint = theme.textMuted)
    }
}

/** The start of a small text file in a monospace card, with the whole file one tap away */
@Composable
private fun TextFileCard(media: ChatEntry.MediaContent, bubble: Boolean, ownBubble: Boolean) {
    val session = LocalSession.current
    val loader = LocalMedia.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var head by remember(media.source) { mutableStateOf<String?>(null) }
    var full by remember(media.source) { mutableStateOf<String?>(null) }
    var expanded by remember(media.source) { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(media.source, session.client) {
        val client = session.client ?: return@LaunchedEffect
        head = withContext(Dispatchers.IO) {
            runCatching { client.mediaHead(media.source, TextFile.PREVIEW_BYTES.toLong()) }
                .getOrNull()?.let(TextFile::decodeHead)
        }
    }

    fun open() {
        if (loader == null || loading) return
        scope.launch {
            loading = true
            val file = runCatching { loader.file(media.source, media.filename) }.getOrNull()
            loading = false
            if (file != null) openFile(context, file, media.mimetype)
        }
    }

    fun toggle() {
        if (loading) return
        if (expanded) {
            expanded = false
            return
        }
        val size = media.size
        if (full != null || (size != null && size <= TextFile.PREVIEW_BYTES)) {
            expanded = true
            return
        }
        scope.launch {
            loading = true
            val text = withContext(Dispatchers.IO) {
                runCatching { loader?.file(media.source, media.filename)?.readText() }
                    .getOrNull()?.let(TextFile::clampForCard)
            }
            loading = false
            if (text != null) {
                full = text
                expanded = true
            }
        }
    }

    Column(
        Modifier
            .widthIn(max = WZ.Size.sidebar)
            .clip(RoundedCornerShape(if (bubble) WZ.Radius.sm else WZ.Radius.lg))
            .background(theme.fill)
            .padding(WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(max = if (expanded) 360.dp else 108.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Text(
                (if (expanded) full ?: head else head).orEmpty(),
                style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = WZ.FontSize.sm),
                color = if (ownBubble) theme.textOnAccent else theme.textPrimary,
                maxLines = if (expanded) Int.MAX_VALUE else 5,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
            Column(
                Modifier.weight(1f).clickable { open() },
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
            ) {
                Text(
                    media.filename,
                    style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                    color = if (ownBubble) theme.textOnAccent else theme.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                media.size?.let {
                    Text(Formats.fileSize(it), style = wizardFont(WZ.FontSize.sm), color = if (ownBubble) theme.textOnAccent.copy(alpha = 0.75f) else theme.textMuted)
                }
            }
            if (head != null) {
                Text(
                    tr(if (expanded) "common.collapse" else "common.expand"),
                    Modifier.clickable { toggle() },
                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                    color = if (ownBubble) theme.textOnAccent else theme.accent,
                    maxLines = 1,
                )
            }
            if (loading) {
                Spinner(size = WZ.SizeIcon.md)
            } else {
                PhIcon(
                    "download-simple",
                    tint = theme.textMuted,
                    contentDescription = tr("common.download"),
                    modifier = Modifier.clickable { open() },
                )
            }
        }
    }
}

/** Plays one audio file */
class AudioPlayback {
    var isPlaying by mutableStateOf(false)
        private set
    var progress by mutableFloatStateOf(0f)
        private set
    private var player: MediaPlayer? = null

    fun toggle(file: File) {
        if (isPlaying) {
            pause()
            return
        }
        val player = player ?: runCatching {
            MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                setDataSource(file.path)
                prepare()
                setOnCompletionListener {
                    this@AudioPlayback.isPlaying = false
                    progress = 0f
                }
            }
        }.getOrNull()?.also { player = it } ?: return
        player.start()
        isPlaying = true
    }

    fun pause() {
        player?.pause()
        isPlaying = false
    }

    /** Called while playing to move the waveform along */
    fun tick() {
        val player = player ?: return
        if (isPlaying && player.duration > 0) progress = player.currentPosition.toFloat() / player.duration
    }

    fun release() {
        player?.release()
        player = null
        isPlaying = false
    }
}

@Composable
fun AudioMessageView(media: ChatEntry.MediaContent, isVoice: Boolean, waveform: List<Float>) {
    val loader = LocalMedia.current
    val scope = rememberCoroutineScope()
    val playback = remember { AudioPlayback() }
    var file by remember(media.source) { mutableStateOf<File?>(null) }
    var loading by remember { mutableStateOf(false) }
    DisposableEffect(playback) { onDispose { playback.release() } }
    LaunchedEffect(playback.isPlaying) {
        while (playback.isPlaying && isActive) {
            playback.tick()
            delay(50)
        }
    }
    Row(
        Modifier.background(theme.fill, CircleShape).padding(WZ.Space.space4).padding(end = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        val label = if (playback.isPlaying) tr("voiceMessagePlayer.pause") else tr("voiceMessagePlayer.play")
        Box(
            Modifier.size(WZ.Space.space10).clip(CircleShape).background(theme.accent)
                .messageTap {
                    scope.launch {
                        if (file == null && loader != null) {
                            loading = true
                            file = runCatching { loader.file(media.source, media.filename) }.getOrNull()
                            loading = false
                        }
                        file?.let { playback.toggle(it) }
                    }
                }
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) {
            if (loading) {
                Spinner(size = WZ.SizeIcon.sm, color = theme.textOnAccent)
            } else {
                PhIcon(if (playback.isPlaying) "pause" else "play", PhWeight.fill, size = WZ.SizeIcon.sm, tint = theme.textOnAccent)
            }
        }
        if (isVoice || waveform.isNotEmpty()) {
            WaveformView(
                if (waveform.isEmpty()) List(32) { 0.3f } else waveform,
                playback.progress,
                Modifier.size(WZ.SizeAvatar.xxl, WZ.Space.space8),
            )
        } else {
            Text(
                media.filename,
                Modifier.widthIn(max = WZ.SizeAvatar.xxl),
                style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        media.duration?.let {
            Text(Formats.duration(it), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }
    }
}

/** Loudness bars of a voice message, filled up to [progress] */
@Composable
fun WaveformView(samples: List<Float>, progress: Float = 0f, modifier: Modifier = Modifier) {
    val played = theme.accent
    val rest = theme.textMuted.copy(alpha = 0.6f)
    androidx.compose.foundation.Canvas(modifier) {
        val barWidth = WZ.Space.space1.toPx()
        val step = 4.dp.toPx()
        val count = maxOf((size.width / step).toInt(), 1)
        val bars = resample(samples, count)
        bars.forEachIndexed { index, value ->
            val height = maxOf(3.dp.toPx(), value * size.height)
            drawRoundRect(
                color = if (index.toFloat() / bars.size < progress) played else rest,
                topLeft = Offset(index * step, (size.height - height) / 2),
                size = Size(barWidth, height),
                cornerRadius = CornerRadius(barWidth / 2),
            )
        }
    }
}

internal fun resample(samples: List<Float>, count: Int): List<Float> {
    if (samples.isEmpty()) return List(count) { 0.1f }
    return (0 until count).map { index ->
        val start = index * samples.size / count
        val end = maxOf(start + 1, (index + 1) * samples.size / count)
        minOf(1f, samples.subList(start, minOf(end, samples.size)).maxOrNull() ?: 0f)
    }
}

/**
 * A shared location. Android has no built-in map view, so it shows a pin card that opens the
 * location in the user's maps app.
 */
@Composable
fun LocationMessageView(geoUri: String, description: String?) {
    val context = LocalContext.current
    val parts = geoUri.removePrefix("geo:").split(';').firstOrNull()?.split(',')?.mapNotNull { it.toDoubleOrNull() }.orEmpty()
    if (parts.size < 2) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            PhIcon("map-pin", tint = theme.textPrimary)
            Text(description ?: geoUri, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
        }
        return
    }
    val (lat, lon) = parts
    Column(
        Modifier
            .width(WZ.Size.sidebar)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .messageTap {
                val label = Uri.encode(description ?: "")
                val uri = Uri.parse("geo:$lat,$lon?q=$lat,$lon${if (label.isEmpty()) "" else "($label)"}")
                try {
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (_: ActivityNotFoundException) {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://www.openstreetmap.org/?mlat=$lat&mlon=$lon#map=16/$lat/$lon"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            },
    ) {
        Box(
            Modifier.fillMaxWidth().height(WZ.SizeAvatar.xxl).background(theme.accent.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                PhIcon("map-pin", PhWeight.fill, size = WZ.SizeIcon.xl, tint = theme.accent)
                Text(
                    String.format(java.util.Locale.ROOT, "%.5f, %.5f", lat, lon),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                )
            }
        }
        Row(
            Modifier.fillMaxWidth().background(theme.fill).padding(WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        ) {
            PhIcon("map-pin", tint = theme.textPrimary)
            Text(
                description ?: tr("timeline.location"),
                Modifier.weight(1f),
                style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            PhIcon("arrow-square-out", tint = theme.textMuted)
        }
    }
}

@Composable
fun PollMessageView(poll: ChatEntry.PollContent, isOwn: Boolean, onVote: (String) -> Unit, onEnd: () -> Unit) {
    val hasVoted = poll.answers.any { it.votedByMe }
    val showsResults = poll.hasEnded || (poll.isDisclosed && hasVoted)
    Column(
        Modifier.widthIn(max = WZ.Size.panel).background(theme.fill, RoundedCornerShape(WZ.Radius.xl)).padding(WZ.Space.space5),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            PhIcon("chart-bar-horizontal", tint = theme.textPrimary)
            Text(poll.question, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary)
        }
        poll.answers.forEach { answer ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(WZ.Radius.lg))
                    .background(theme.fill.copy(alpha = theme.fill.alpha * 0.6f))
                    .then(if (poll.hasEnded) Modifier else Modifier.messageTap { onVote(answer.id) })
                    .padding(WZ.Space.space4),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    PhIcon(
                        if (answer.votedByMe) "check-circle" else "circle",
                        if (answer.votedByMe) PhWeight.fill else PhWeight.regular,
                        tint = if (answer.votedByMe) theme.accent else theme.textMuted,
                    )
                    Text(answer.text, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    if (showsResults) {
                        Text("${answer.votes}", style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
                    }
                }
                if (showsResults) {
                    Box(Modifier.fillMaxWidth().height(WZ.Space.space3).clip(CircleShape).background(theme.fill)) {
                        Box(
                            Modifier.fillMaxHeight()
                                .fillMaxWidth(answer.votes.toFloat() / maxOf(poll.totalVotes, 1))
                                .clip(CircleShape)
                                .background(theme.accent),
                        )
                    }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                when {
                    poll.hasEnded -> tr("timeline.finalResultsVotes", "${poll.totalVotes}")
                    showsResults || hasVoted -> tr("timeline.votes", "${poll.totalVotes}")
                    else -> tr("timeline.tapAnOptionTo")
                },
                Modifier.weight(1f),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
            )
            if (isOwn && !poll.hasEnded) {
                Text(
                    tr("timeline.poll.end"),
                    Modifier.messageTap(onClick = onEnd),
                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                    color = theme.accent,
                )
            }
        }
    }
}

/** The fill behind a bubble: yours a deep accent, others' a light tint of it on the raised surface */
@Composable
internal fun bubbleFill(own: Boolean): Color =
    if (own) lerp(Color.Black, theme.accent, 0.78f) else lerp(theme.bgTertiary, theme.accent, 0.14f)

/** A quoted message on one line: the sender's colour, then the text. Tapping it jumps to the original. */
@Composable
fun ReplyQuoteView(quote: ChatEntry.ReplyQuote, end: Boolean = false, bubble: Boolean = false, onJump: (() -> Unit)? = null) {
    val scale = LocalPrefs.current.chatScale
    val roles = LocalRoomRoles.current
    val bar = if (bubble) 2.dp else 3.dp
    Row(
        Modifier
            .then(if (end) Modifier else Modifier.fillMaxWidth())
            .height(IntrinsicSize.Min)
            .padding(bottom = WZ.Space.space2)
            .then(if (onJump != null) Modifier.clickable(onClick = onJump) else Modifier),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        if (!end) Box(Modifier.width(bar).fillMaxHeight().background(theme.accent, RoundedCornerShape(2.dp)))
        Text(
            buildAnnotatedString {
                if (quote.senderName.isNotEmpty()) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = if (bubble) theme.textMuted else (roles.colorOf(quote.sender) ?: nameColor(quote.sender)))) {
                        append(quote.senderName)
                    }
                    append(": ")
                }
                append(quote.text.ifEmpty { tr("timeline.originalMessage") })
            },
            style = wizardFont((if (bubble) WZ.FontSize.sm else WZ.FontSize.md) * scale),
            color = theme.textMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = if (end) TextAlign.End else TextAlign.Start,
        )
        if (end) Box(Modifier.width(bar).fillMaxHeight().background(theme.accent, RoundedCornerShape(2.dp)))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReactionsBar(reactions: List<ChatEntry.ReactionGroup>, roomId: String? = null, bubble: Boolean = false, onToggle: (String) -> Unit) {
    var reactors by remember { mutableStateOf<ChatEntry.ReactionGroup?>(null) }
    val chipShape = if (bubble) RoundedCornerShape(WZ.Radius.lg) else CircleShape
    FlowRow(
        Modifier.padding(top = WZ.Space.space2),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        reactions.forEach { reaction ->
            val mine = reaction.reactedByMe
            // The chip is 24 dp tall but its touch area is 44 dp, like the web's touch layer
            val messageLongPress = LocalMessageLongPress.current
            Box(
                Modifier
                    .heightIn(min = 44.dp)
                    .combinedClickable(
                        interactionSource = null,
                        indication = null,
                        // A long press lists who reacted; a chip without known senders keeps opening the message menu
                        onLongClick = if (roomId != null && reaction.senders.isNotEmpty()) ({ reactors = reaction }) else messageLongPress,
                        onClick = { onToggle(reaction.key) },
                    )
                    .semantics { contentDescription = "${reaction.key} ${reaction.count}" },
                contentAlignment = Alignment.Center,
            ) {
                Row(
                    Modifier
                        .then(if (bubble) Modifier else Modifier.height(WZ.Space.space8))
                        .clip(chipShape)
                        .background(if (mine) theme.accent.copy(alpha = 0.18f) else theme.fill)
                        .border(WZ.BorderWidth.thin, if (mine) theme.accent else Color.Transparent, chipShape)
                        .padding(horizontal = WZ.Space.space4, vertical = if (bubble) WZ.Space.space1 else 0.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                ) {
                    if (reaction.key.startsWith("mxc://")) {
                        PackThumb(reaction.key, Modifier.size(WZ.Space.space6))
                    } else {
                        Text(reaction.key, fontSize = WZ.SizeIcon.sm.value.sp)
                    }
                    if (!bubble || reaction.count != 1) Text(
                        "${reaction.count}",
                        style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                        color = if (mine) theme.accent else theme.textMuted,
                    )
                }
            }
        }
    }
    reactors?.let { group -> ReactorsSheet(roomId ?: "", group) { reactors = null } }
}

/** Who reacted with one emoji (a long press on its chip) */
@Composable
private fun ReactorsSheet(roomId: String, group: ChatEntry.ReactionGroup, onDismiss: () -> Unit) {
    WizardSheet(onDismiss) {
        Row(
            Modifier.fillMaxWidth().padding(bottom = WZ.Space.space4),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (group.key.startsWith("mxc://")) {
                PackThumb(group.key, Modifier.size(WZ.Space.space9))
            } else {
                Text(group.key, fontSize = WZ.SizeIcon.xl.value.sp)
            }
            Text(
                L10n.format("timeline.reactions"),
                style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                color = theme.textPrimary,
            )
        }
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 560.dp).navigationBarsPadding()) {
            items(group.senders, key = { it }) { userId ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                ) {
                    ReceiptAvatar(roomId, userId, 32.dp)
                    ReceiptName(roomId, userId, Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
fun ReadReceiptsView(roomId: String, userIds: List<String>, readAt: Map<String, java.time.Instant> = emptyMap(), modifier: Modifier = Modifier) {
    var showList by remember { mutableStateOf(false) }
    val label = L10n.format("timeline.seenBy", userIds.size)
    Row(
        modifier
            .clickable { showList = true }
            .padding(vertical = WZ.Space.space1)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        userIds.take(4).forEachIndexed { index, userId ->
            Box(
                Modifier
                    .offset(x = (-WZ.Space.space2) * index)
                    .border(WZ.BorderWidth.thin, theme.bgPrimary, CircleShape),
            ) {
                ReceiptAvatar(roomId, userId, 16.dp)
            }
        }
        if (userIds.size > 4) {
            Text(
                "+${userIds.size - 4}",
                Modifier.offset(x = (-WZ.Space.space2) * 4).padding(start = WZ.Space.space4),
                style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
                color = theme.textMuted,
            )
        }
    }
    if (showList) {
        WizardSheet({ showList = false }) {
            Text(
                tr("timeline.seenByTitle"),
                Modifier.fillMaxWidth().padding(bottom = WZ.Space.space4),
                style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                color = theme.textPrimary,
                textAlign = TextAlign.Center,
            )
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 560.dp).navigationBarsPadding()) {
                items(userIds, key = { it }) { userId ->
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                    ) {
                        ReceiptAvatar(roomId, userId, 32.dp)
                        ReceiptName(roomId, userId, Modifier.weight(1f))
                        readAt[userId]?.let { date ->
                            Text(
                                if (Formats.isToday(date)) Formats.time(date) else Formats.abbreviatedDateTime(date),
                                style = wizardFont(WZ.FontSize.sm),
                                color = theme.textMuted,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ThreadSummaryBadge(thread: ThreadSummaryView, roomId: String, bubble: Boolean = false, onOpen: () -> Unit) {
    val latest = thread.latestSummary?.lineSequence()?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }
    val preview = when {
        thread.latestRedacted -> tr("timeline.messageDeleted")
        latest != null -> thread.latestSenderName?.let { "$it: $latest" } ?: latest
        thread.latestUndecryptable -> tr("timeline.couldNotDecrypt")
        else -> null
    }
    val hint = tr("timeline.openThread")
    Row(
        Modifier
            .then(if (bubble) Modifier.fillMaxWidth() else Modifier.widthIn(max = WZ.Size.panel))
            .clip(RoundedCornerShape(if (bubble) WZ.Radius.xl else WZ.Radius.lg))
            .background(theme.fill)
            .messageTap(onClick = onOpen)
            .semantics { onClick(label = hint) { onOpen(); true } }
            .padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        thread.latestSender?.let { ReceiptAvatar(roomId, it, WZ.SizeAvatar.xs) }
        Text(
            trPlural("timeline.threadReplies", thread.replies.toInt(), thread.replies.toInt()),
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.accent,
        )
        preview?.let {
            Text(
                it,
                Modifier.weight(1f, fill = false),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        PhIcon("caret-right", size = WZ.SizeIcon.xs, tint = theme.textMuted, weight = PhWeight.bold)
    }
}

@Composable
private fun ReceiptAvatar(roomId: String, userId: String, size: Dp) {
    val session = LocalSession.current
    var name by remember(userId) { mutableStateOf<String?>(null) }
    var url by remember(userId) { mutableStateOf<String?>(null) }
    LaunchedEffect(userId) {
        val profile = session.memberProfile(userId, roomId)
        name = profile.name
        url = profile.avatarUrl
    }
    Avatar(name ?: userId, url, size)
}

@Composable
private fun ReceiptName(roomId: String, userId: String, modifier: Modifier = Modifier) {
    val session = LocalSession.current
    var name by remember(userId) { mutableStateOf<String?>(null) }
    LaunchedEffect(userId) { name = session.memberProfile(userId, roomId).name }
    Column(modifier) {
        Text(name ?: userId, style = wizardFont(WZ.FontSize.lg, FontWeight.Medium), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (name != null) {
            Text(userId, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
