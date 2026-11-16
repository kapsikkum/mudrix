package chat.mudrix.android.ui.people

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import chat.mudrix.android.LocalSession
import chat.mudrix.android.matrix.ImagePacks
import chat.mudrix.android.matrix.MatrixSession
import chat.mudrix.android.matrix.setStateEvent
import chat.mudrix.android.ui.CopyToast
import chat.mudrix.android.ui.GroupedSection
import chat.mudrix.android.ui.RowDivider
import chat.mudrix.android.ui.WizardTopBar
import chat.mudrix.android.matrix.PackUpload
import chat.mudrix.android.matrix.UploadedImage
import chat.mudrix.android.matrix.uploadMedia
import chat.mudrix.android.ui.BarTextButton
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** An image picked for a pack: where it is, what it's called and its type */
internal data class PickedImage(val uri: Uri, val name: String, val mime: String, val size: Long?) {
    val resumeKey: String get() = PackUpload.resumeKey(uri.toString(), size)
}

/** How far a bulk upload has got */
internal data class UploadProgress(val done: Int, val total: Int, val failed: Int)

/** Opens the photo picker for several images at once */
@Composable
internal fun rememberImagesPicker(onPicked: (List<Uri>) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        if (uris.isNotEmpty()) onPicked(uris)
    }
    return { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
}

/** The pack formats among [uris], and how many other files were left out */
internal suspend fun describePicked(context: Context, uris: List<Uri>): Pair<List<PickedImage>, Int> = withContext(Dispatchers.IO) {
    val picked = mutableListOf<PickedImage>()
    for (uri in uris) {
        var name: String? = null
        var size: Long? = null
        runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    name = cursor.getString(0)
                    size = if (cursor.isNull(1)) null else cursor.getLong(1)
                }
            }
        }
        val mime = context.contentResolver.getType(uri)
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.orEmpty().substringAfterLast('.', "").lowercase())
        if (mime == null || mime !in PackUpload.ALLOWED_MIME) continue
        picked.add(PickedImage(uri, name ?: "image", mime, size))
    }
    picked to (uris.size - picked.size)
}

/** Uploads one picked image as it is and reads its size, retrying while the server rate-limits */
internal suspend fun uploadPicked(session: MatrixSession, context: Context, image: PickedImage): UploadedImage {
    val data = readBytes(context, image.uri) ?: error(L10n.format("common.somethingWentWrong"))
    val mxc = PackUpload.withRateLimitRetry { session.uploadMedia(data, image.mime) }
    val bounds = withContext(Dispatchers.Default) {
        BitmapFactory.Options().apply {
            inJustDecodeBounds = true
            BitmapFactory.decodeByteArray(data, 0, data.size, this)
        }
    }
    val info = JsonObject(
        buildMap {
            if (bounds.outWidth > 0 && bounds.outHeight > 0) {
                put("w", JsonPrimitive(bounds.outWidth))
                put("h", JsonPrimitive(bounds.outHeight))
            }
            put("size", JsonPrimitive(data.size))
            put("mimetype", JsonPrimitive(image.mime))
            if (image.mime == "image/gif") put("is_animated", JsonPrimitive(PackUpload.isAnimatedGif(data)))
        },
    )
    return UploadedImage(mxc, image.mime, info)
}

/** "Uploading 3 of 10", how many failed, a bar and a Cancel button */
@Composable
internal fun UploadProgressRow(progress: UploadProgress, onCancel: () -> Unit) {
    val text = L10n.format("room.settings.emojis.uploadingProgress", progress.done, progress.total) +
        if (progress.failed > 0) " · " + L10n.plural("room.settings.emojis.uploadFailedSome", progress.failed, progress.failed) else ""
    Column(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text, Modifier.weight(1f), style = wizardFont(WZ.FontSize.sm), color = theme.textSecondary)
            BarTextButton(tr("common.cancel"), onCancel)
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(WZ.Space.space1)
                .clip(CircleShape)
                .background(theme.fill)
                .semantics { contentDescription = text },
        ) {
            Box(
                Modifier
                    .fillMaxWidth((progress.done.toFloat() / maxOf(progress.total, 1)).coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .background(theme.accent),
            )
        }
    }
}

/** Upload & create: pick many images, name the pack, and it is uploaded, split to fit and saved as one or more packs */
@Composable
internal fun UploadPackScreen(roomId: String, onBack: () -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var asEmoji by remember { mutableStateOf(true) }
    var asSticker by remember { mutableStateOf(true) }
    var files by remember { mutableStateOf(listOf<PickedImage>()) }
    val uploaded = remember { mutableMapOf<String, UploadedImage>() }
    // The state keys of the packs this plan makes, so a retried save writes the same packs
    val planKeys = remember { mutableListOf<String>() }
    var progress by remember { mutableStateOf<UploadProgress?>(null) }
    var saving by remember { mutableStateOf<UploadProgress?>(null) }
    var failed by remember { mutableStateOf(0) }
    var cancelled by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val busy = progress != null || saving != null

    val plan = remember(files) {
        val used = mutableSetOf<String>()
        files.map { PackUpload.uniqueShortcode(PackUpload.shortcodeFromFile(it.name, "item"), used) }
    }
    val domain = session.userId?.substringAfter(':', "")?.ifEmpty { null } ?: "matrix.org"
    val packCount = remember(plan, name, domain) { if (plan.isEmpty()) 0 else PackUpload.plannedPackCount(plan, domain, name.ifBlank { "Pack" }) }

    fun resetPlan() {
        uploaded.clear()
        planKeys.clear()
        failed = 0
        cancelled = false
    }

    val pick = rememberImagesPicker { uris ->
        scope.launch {
            val (picked, skipped) = describePicked(context, uris)
            resetPlan()
            files = picked
            error = when {
                picked.isEmpty() -> L10n.format("room.settings.emojis.unsupportedFormat")
                skipped > 0 -> L10n.plural("room.settings.emojis.someSkipped", skipped, skipped)
                else -> null
            }
        }
    }

    fun start() {
        val title = name.trim()
        if (busy || title.isEmpty() || files.isEmpty() || !(asEmoji || asSticker)) return
        val snapshot = files
        val codes = plan
        cancelled = false
        failed = 0
        error = null
        progress = UploadProgress(0, snapshot.size, 0)
        scope.launch {
            try {
                val result = PackUpload.uploadPooled(
                    snapshot,
                    key = { it.resumeKey },
                    upload = { uploadPicked(session, context, it) },
                    done = uploaded,
                    isCancelled = { cancelled },
                    onProgress = { done, total, bad -> progress = UploadProgress(done, total, bad) },
                )
                if (result.cancelled) {
                    error = L10n.format("room.settings.emojis.uploadCancelled", result.uploaded.count { it != null }, snapshot.size)
                    return@launch
                }
                if (result.errors.isNotEmpty()) {
                    failed = result.errors.size
                    error = L10n.plural("room.settings.emojis.uploadFailedSome", failed, failed)
                    return@launch
                }
                val images = linkedMapOf<String, kotlinx.serialization.json.JsonElement>()
                snapshot.forEachIndexed { i, file ->
                    val up = result.uploaded[i] ?: return@forEachIndexed
                    images[codes[i]] = PackUpload.imageEntry(up.mxc, file.name.substringBeforeLast('.'), up.info)
                }
                val usage = buildList {
                    if (asEmoji) add(JsonPrimitive("emoticon"))
                    if (asSticker) add(JsonPrimitive("sticker"))
                }
                val base = buildJsonObject {
                    put("pack", buildJsonObject {
                        put("display_name", title)
                        put("usage", JsonArray(usage))
                    })
                }
                val parts = PackUpload.partContents(base, title, images, iconFromFirst = true)
                while (planKeys.size < parts.size) planKeys.add(java.util.UUID.randomUUID().toString())
                progress = null
                parts.forEachIndexed { i, part ->
                    saving = UploadProgress(i, parts.size, 0)
                    PackUpload.withRateLimitRetry { session.setStateEvent(PACK_TYPE, planKeys[i], part, roomId) }
                }
                ImagePacks.forget()
                val isSpace = session.roomList?.spaces?.any { it.id == roomId } == true
                CopyToast.show(
                    L10n.format(
                        "room.settings.emojis.uploadPackDone",
                        title,
                        snapshot.size,
                        parts.size,
                        L10n.format(if (isSpace) "room.settings.emojis.targetSpace" else "room.settings.emojis.targetRoom"),
                    ),
                )
                resetPlan()
                onBack()
            } catch (e: Exception) {
                error = if (PackUpload.isTooLarge(e)) L10n.format("room.settings.emojis.serverTooLarge") else L10n.format("room.settings.emojis.createFailed", errorText(e))
            } finally {
                progress = null
                saving = null
            }
        }
    }

    SheetPage {
        WizardTopBar(tr("room.settings.emojis.uploadAndCreate"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            item {
                GroupedSection(header = tr("room.settings.emojis.pack")) {
                    FormField(name, { name = it }, tr("room.settings.emojis.packNamePlaceholder"))
                    RowDivider()
                    ToggleRow(tr("room.settings.emojis.useAsEmoji"), asEmoji, { if (it || asSticker) asEmoji = it })
                    RowDivider()
                    ToggleRow(tr("room.settings.emojis.useAsStickers"), asSticker, { if (it || asEmoji) asSticker = it })
                }
            }
            item {
                GroupedSection(
                    header = L10n.plural("settings.emojisStickers.imageCount", files.size, files.size),
                    footer = if (packCount > 1) L10n.format("room.settings.emojis.willSplit", packCount, (files.size + packCount - 1) / packCount) else null,
                ) {
                    ActionRow(tr("room.settings.emojis.addImages"), "plus", pick, enabled = !busy)
                    progress?.let {
                        RowDivider()
                        UploadProgressRow(it) { cancelled = true }
                    }
                    saving?.let {
                        RowDivider()
                        Text(
                            L10n.format("room.settings.emojis.savingPacksProgress", it.done + 1, it.total),
                            Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textSecondary,
                        )
                    }
                }
            }
            item {
                GroupedSection {
                    val retry = !busy && (failed > 0 || cancelled)
                    ActionRow(
                        when {
                            retry && failed > 0 -> L10n.plural("room.settings.emojis.retryFailed", failed, failed)
                            retry -> tr("room.settings.emojis.resumeUpload")
                            else -> tr("room.settings.emojis.uploadAndCreate")
                        },
                        "arrow-circle-up",
                        ::start,
                        enabled = !busy && name.isNotBlank() && files.isNotEmpty(),
                    )
                }
            }
            item { ErrorText(error) }
        }
    }
}