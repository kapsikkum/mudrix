package chat.mudrix.android.ui.room

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import chat.mudrix.android.media.FilePreview
import chat.mudrix.android.media.FilePreviewKind
import chat.mudrix.android.ui.BarButton
import chat.mudrix.android.ui.BarTextButton
import chat.mudrix.android.ui.CopyToastView
import chat.mudrix.android.ui.SheetTopBar
import chat.mudrix.android.ui.Spinner
import chat.mudrix.android.ui.copyToClipboard
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A downloaded PDF, text or Markdown file in the app, without handing it to another app first.
 * [onFallback] is called when the file can't be shown here (a damaged or password-protected PDF),
 * so the caller can open it in another app instead.
 */
@Composable
internal fun FilePreviewDialog(
    kind: FilePreviewKind,
    file: File,
    filename: String,
    mimetype: String?,
    onFallback: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    FullScreenDialog(onDismiss) {
        Column(Modifier.fillMaxSize().background(theme.bgPrimary)) {
            SheetTopBar(
                title = filename,
                statusBarPadding = true,
                leading = { BarButton("x", tr("common.close"), onDismiss) },
                trailing = {
                    BarButton("export", tr("desktopPicker.share"), { shareFile(context, file, mimetype ?: "*/*") })
                    BarButton("arrow-square-out", tr("common.open"), { openFile(context, file, mimetype) })
                },
            )
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (kind) {
                    FilePreviewKind.pdf -> PdfPages(file, onFallback)
                    FilePreviewKind.text -> TextPages(file)
                }
                CopyToastView(Modifier.align(Alignment.TopCenter).padding(top = WZ.Space.space2))
            }
        }
    }
}

private fun readHead(file: File, limit: Int): ByteArray {
    val buffer = ByteArray(minOf(file.length(), limit.toLong()).toInt())
    java.io.DataInputStream(file.inputStream()).use { it.readFully(buffer) }
    return buffer
}

@Composable
private fun TextPages(file: File) {
    val text by produceState<String?>(null, file) {
        value = withContext(Dispatchers.IO) {
            runCatching { readHead(file, FilePreview.MAX_TEXT_BYTES + 4) }
                .getOrNull()?.let(FilePreview::decodeText).orEmpty()
        }
    }
    Box(Modifier.fillMaxSize()) {
        val shown = text
        if (shown == null) {
            Spinner(Modifier.align(Alignment.Center))
        } else {
            SelectionContainer {
                androidx.compose.material3.Text(
                    shown,
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(WZ.Space.space6)
                        .navigationBarsPadding(),
                    style = wizardFont(WZ.FontSize.sm).copy(fontFamily = FontFamily.Monospace),
                    color = theme.textPrimary,
                )
            }
            Box(Modifier.align(Alignment.BottomEnd).padding(WZ.Space.space6).navigationBarsPadding()) {
                BarTextButton(tr("common.copy"), { copyToClipboard(shown) }, bold = true)
            }
        }
    }
}

/** One open PDF; the renderer shows a single page at a time, so renders take turns */
private class PdfDocument(file: File) {
    private val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    private val renderer = PdfRenderer(descriptor)
    private val turn = Mutex()
    val pageCount: Int = renderer.pageCount

    suspend fun render(index: Int, width: Int): Bitmap? = turn.withLock {
        withContext(Dispatchers.IO) {
            runCatching {
                val page = renderer.openPage(index)
                try {
                    val bitmap = Bitmap.createBitmap(width, FilePreview.pageHeight(width, page.width, page.height), Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(AndroidColor.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bitmap
                } finally {
                    page.close()
                }
            }.getOrNull()
        }
    }

    suspend fun close() = withContext(NonCancellable) {
        turn.withLock {
            runCatching { renderer.close() }
            runCatching { descriptor.close() }
        }
    }
}

@Composable
private fun PdfPages(file: File, onFallback: () -> Unit) {
    val document = remember(file) { runCatching { PdfDocument(file) }.getOrNull() }
    if (document == null || document.pageCount == 0) {
        androidx.compose.runtime.LaunchedEffect(file) { onFallback() }
        return
    }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    DisposableEffect(document) { onDispose { scope.launch(NonCancellable) { document.close() } } }
    var zoom by remember { mutableFloatStateOf(1f) }
    val zoomLabel = tr("timeline.filePreview.zoom")
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val pageWidth = maxWidth * zoom
        val widthPx = with(density) { pageWidth.roundToPx() }
        Box(Modifier.fillMaxSize().horizontalScroll(rememberScrollState())) {
            LazyColumn(
                Modifier.width(pageWidth).fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                items((0 until document.pageCount).toList()) { index ->
                    val bitmap by produceState<Bitmap?>(null, index, widthPx) { value = document.render(index, widthPx) }
                    val shown = bitmap
                    if (shown == null) {
                        Box(Modifier.fillMaxWidth().height(320.dp), contentAlignment = Alignment.Center) { Spinner() }
                    } else {
                        Image(
                            shown.asImageBitmap(),
                            contentDescription = null,
                            Modifier.fillMaxWidth().semantics { contentDescription = "${index + 1} / ${document.pageCount}" },
                            contentScale = ContentScale.FillWidth,
                        )
                    }
                }
            }
        }
        BarButton(
            "magnifying-glass",
            zoomLabel,
            { zoom = FilePreview.nextZoom(zoom) },
            Modifier.align(Alignment.BottomEnd).padding(WZ.Space.space6).navigationBarsPadding().background(theme.bgSecondary, androidx.compose.foundation.shape.CircleShape),
        )
    }
}
