package chat.mudrix.android.ui.people

import android.graphics.Bitmap
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import chat.mudrix.android.LocalMedia
import chat.mudrix.android.LocalSession
import chat.mudrix.android.matrix.ImagePacks
import chat.mudrix.android.matrix.PackSize
import chat.mudrix.android.matrix.canSendState
import chat.mudrix.android.matrix.setStateEvent
import chat.mudrix.android.matrix.stateEvents
import chat.mudrix.android.matrix.PackUpload
import chat.mudrix.android.matrix.UploadedImage
import chat.mudrix.android.ui.CopyToast
import chat.mudrix.android.ui.BarTextButton
import chat.mudrix.android.ui.GroupedSection
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.MenuItem
import chat.mudrix.android.ui.PhIcon
import chat.mudrix.android.ui.RowDivider
import chat.mudrix.android.ui.WizardMenu
import chat.mudrix.android.ui.WizardTopBar
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ

internal const val PACK_TYPE = "im.ponies.room_emotes"

internal fun packDisplayName(content: JsonObject, key: String): String =
    (content["pack"] as? JsonObject)?.get("display_name").string ?: key.ifEmpty { L10n.format("room.settings.emojis.roomPack") }

/** A room's custom emoji and sticker packs */
@Composable
internal fun RoomPacksScreen(
    roomId: String,
    onBack: () -> Unit,
    onUploadPack: () -> Unit,
    onOpenPack: (key: String, content: JsonObject, canEdit: Boolean) -> Unit,
) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var packs by remember { mutableStateOf(listOf<Pair<String, JsonObject>>()) }
    var canEdit by remember { mutableStateOf(false) }
    var newPackName by remember { mutableStateOf("") }
    var showNewPack by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }

    suspend fun load() {
        packs = session.stateEvents(PACK_TYPE, roomId)
            .filter { it.second.isNotEmpty() }
            .sortedBy { packDisplayName(it.second, it.first) }
        canEdit = session.canSendState(PACK_TYPE, roomId)
        loaded = true
    }
    LaunchedEffect(roomId) { load() }

    fun create() {
        val name = newPackName.trim()
        newPackName = ""
        if (name.isEmpty()) return
        val key = name.lowercase().replace(" ", "_")
        val content = buildJsonObject {
            put("pack", buildJsonObject {
                put("display_name", name)
                put("usage", JsonArray(listOf(JsonPrimitive("emoticon"), JsonPrimitive("sticker"))))
            })
            put("images", JsonObject(emptyMap()))
        }
        scope.launch {
            runCatching { session.setStateEvent(PACK_TYPE, key, content, roomId) }
            load()
        }
    }

    SheetPage {
        WizardTopBar(tr("room.settings.emojis.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            if (loaded && packs.isEmpty() && !canEdit) {
                item { EmptyState(tr("room.settings.emojis.empty"), "smiley", Modifier.padding(top = WZ.Space.space12)) }
            } else {
                item {
                    GroupedSection(footer = tr("room.settings.emojis.packsHint")) {
                        packs.forEachIndexed { index, (key, content) ->
                            if (index > 0) RowDivider()
                            val images = (content["images"] as? JsonObject)?.size ?: 0
                            NavRow(packDisplayName(content, key), "smiley", { onOpenPack(key, content, canEdit) }, value = "$images")
                        }
                        if (canEdit) {
                            if (packs.isNotEmpty()) RowDivider()
                            ActionRow(tr("room.settings.emojis.newPack"), "plus", { showNewPack = true })
                            RowDivider()
                            ActionRow(tr("room.settings.emojis.uploadAndCreate"), "arrow-circle-up", onUploadPack)
                        }
                    }
                }
            }
            roomCosmeticPacks(roomId)
        }
    }

    if (showNewPack) {
        TextFieldDialog(
            tr("room.settings.emojis.newPack"),
            newPackName,
            { newPackName = it },
            tr("common.name"),
            tr("common.create"),
            onConfirm = ::create,
            onDismiss = { showNewPack = false },
        )
    }
}

private fun cleanCode(code: String) = code.trim(':', ' ').replace(" ", "_")

/** Edits one pack: its name, usage and images */
@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
internal fun PackEditorScreen(roomId: String, stateKey: String, initial: JsonObject, canEdit: Boolean, onBack: () -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var content by remember { mutableStateOf(initial) }
    // What the server has now, to put back if a split fails half-way
    var savedContent by remember { mutableStateOf(initial) }
    var renaming by remember { mutableStateOf<String?>(null) }
    var newCode by remember { mutableStateOf("") }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    val pack = content["pack"] as? JsonObject ?: JsonObject(emptyMap())
    val allImages = content["images"] as? JsonObject ?: JsonObject(emptyMap())
    val images = allImages.mapNotNull { (code, value) -> (value as? JsonObject)?.get("url").string?.let { code to it } }.sortedBy { it.first }
    val usage = (pack["usage"] as? JsonArray)?.mapNotNull { it.string }?.toSet() ?: setOf("emoticon", "sticker")

    fun withPack(change: MutableMap<String, JsonElement>.() -> Unit) {
        val updated = pack.toMutableMap().apply(change)
        content = JsonObject(content + ("pack" to JsonObject(updated)))
    }

    fun withImages(change: MutableMap<String, JsonElement>.() -> Unit) {
        val updated = allImages.toMutableMap().apply(change)
        content = JsonObject(content + ("images" to JsonObject(updated)))
    }

    fun save() {
        val snapshot = content
        // An event over the limit is refused by the server: the size meter says so, and Split pack is the way out
        if (PackSize.level(PackSize.contentBytes(snapshot)) == PackSize.Level.Over) {
            error = L10n.format("room.settings.emojis.sizeOver")
            return
        }
        scope.launch {
            try {
                session.setStateEvent(PACK_TYPE, stateKey, snapshot, roomId)
                savedContent = snapshot
                ImagePacks.forget()
                error = null
            } catch (e: Exception) {
                error = if (PackUpload.isTooLarge(e)) L10n.format("room.settings.emojis.serverTooLarge") else L10n.format("common.saveFailed", errorText(e))
            }
        }
    }

    fun setUsage(kind: String, on: Boolean) {
        val set = usage.toMutableSet()
        if (on) set.add(kind) else set.remove(kind)
        if (set.isEmpty()) return
        withPack { this["usage"] = JsonArray(set.sorted().map { JsonPrimitive(it) }) }
        save()
    }

    // Uploads that already finished, by file, so retry and resume only upload what is missing
    val uploaded = remember { mutableMapOf<String, UploadedImage>() }
    var progress by remember { mutableStateOf<UploadProgress?>(null) }
    var failed by remember { mutableStateOf(listOf<PickedImage>()) }
    var cancelled by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }

    fun runUpload(files: List<PickedImage>) {
        if (progress != null || files.isEmpty()) return
        cancelled = false
        failed = emptyList()
        error = null
        progress = UploadProgress(0, files.size, 0)
        scope.launch {
            try {
                val result = PackUpload.uploadPooled(
                    files,
                    key = { it.resumeKey },
                    upload = { uploadPicked(session, context, it) },
                    done = uploaded,
                    isCancelled = { cancelled },
                    onProgress = { done, total, bad -> progress = UploadProgress(done, total, bad) },
                )
                val used = allImages.keys.toMutableSet()
                val added = linkedMapOf<String, JsonElement>()
                files.forEachIndexed { i, file ->
                    val up = result.uploaded[i] ?: return@forEachIndexed
                    val code = PackUpload.uniqueShortcode(PackUpload.shortcodeFromFile(file.name), used)
                    added[code] = PackUpload.imageEntry(up.mxc, code, up.info)
                    uploaded.remove(file.resumeKey)
                }
                if (added.isNotEmpty()) withImages { putAll(added) }
                failed = files.filterIndexed { i, _ -> result.uploaded[i] == null }
                if (result.cancelled) {
                    error = L10n.format("room.settings.emojis.uploadCancelled", added.size, files.size)
                } else if (result.errors.isNotEmpty()) {
                    error = L10n.plural("room.settings.emojis.uploadFailedSome", result.errors.size, result.errors.size)
                }
                if (added.isNotEmpty()) save()
            } catch (e: Exception) {
                error = L10n.format("common.saveFailed", errorText(e))
            } finally {
                progress = null
            }
        }
    }

    val pickImages = rememberImagesPicker { uris ->
        scope.launch {
            val (picked, skipped) = describePicked(context, uris)
            if (picked.isEmpty()) {
                error = L10n.format("room.settings.emojis.unsupportedFormat")
                return@launch
            }
            runUpload(picked)
            if (skipped > 0) error = L10n.plural("room.settings.emojis.someSkipped", skipped, skipped)
        }
    }

    fun split() {
        if (saving) return
        val name = pack["display_name"].string ?: stateKey
        val parts = PackUpload.partContents(content, name, allImages)
        val before = savedContent
        saving = true
        scope.launch {
            try {
                // The new packs go first, so a failure part-way never leaves the images only in memory
                parts.drop(1).forEach { part ->
                    PackUpload.withRateLimitRetry { session.setStateEvent(PACK_TYPE, java.util.UUID.randomUUID().toString(), part, roomId) }
                }
                try {
                    PackUpload.withRateLimitRetry { session.setStateEvent(PACK_TYPE, stateKey, parts.first(), roomId) }
                } catch (e: Exception) {
                    if (!PackUpload.isTooLarge(e)) throw e
                    // Some servers count the event being replaced as well: empty this pack first, then write it
                    // (and put the old one back if that still fails)
                    PackUpload.withRateLimitRetry { session.setStateEvent(PACK_TYPE, stateKey, JsonObject(emptyMap()), roomId) }
                    try {
                        PackUpload.withRateLimitRetry { session.setStateEvent(PACK_TYPE, stateKey, parts.first(), roomId) }
                    } catch (second: Exception) {
                        runCatching { session.setStateEvent(PACK_TYPE, stateKey, before, roomId) }
                        throw second
                    }
                }
                content = parts.first()
                savedContent = parts.first()
                ImagePacks.forget()
                error = null
                CopyToast.show(L10n.plural("room.settings.emojis.splitDone", parts.size, parts.size))
            } catch (e: Exception) {
                error = if (PackUpload.isTooLarge(e)) L10n.format("room.settings.emojis.serverTooLarge") else L10n.format("room.settings.emojis.splitFailed", errorText(e))
            } finally {
                saving = false
            }
        }
    }

    fun rename(old: String, new: String) {
        val code = cleanCode(new)
        if (code.isEmpty() || code == old) return
        val image = allImages[old] as? JsonObject ?: return
        withImages {
            remove(old)
            this[code] = JsonObject(image + ("body" to JsonPrimitive(code)))
        }
        save()
    }

    fun remove(code: String) {
        withImages { remove(code) }
        save()
    }

    SheetPage {
        WizardTopBar(packDisplayName(content, stateKey), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            if (canEdit) {
                item {
                    GroupedSection(header = tr("room.settings.emojis.pack")) {
                        FormField(
                            pack["display_name"].string ?: stateKey,
                            { value -> withPack { this["display_name"] = JsonPrimitive(value) } },
                            tr("common.name"),
                            onSubmit = ::save,
                        )
                        RowDivider()
                        ToggleRow(tr("room.settings.emojis.useAsEmoji"), "emoticon" in usage, { setUsage("emoticon", it) })
                        RowDivider()
                        ToggleRow(tr("room.settings.emojis.useAsStickers"), "sticker" in usage, { setUsage("sticker", it) })
                    }
                }
            }
            item {
                GroupedSection(
                    header = L10n.plural("settings.emojisStickers.imageCount", images.size, images.size),
                    footer = if (canEdit) tr("room.settings.emojis.imageActionsHint") else null,
                ) {
                    FlowRow(
                        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space5),
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                        verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                    ) {
                        images.forEach { (code, url) ->
                            Box {
                                Column(
                                    Modifier
                                        .width(72.dp)
                                        .combinedClickable(onClick = {}, onLongClick = { if (canEdit) menuFor = code }),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                                ) {
                                    RoomPackThumb(url)
                                    Text(
                                        ":$code:",
                                        style = wizardFont(WZ.FontSize.xs),
                                        color = theme.textMuted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                WizardMenu(
                                    menuFor == code,
                                    { menuFor = null },
                                    listOf(
                                        MenuItem(tr("common.rename"), "pencil-simple") {
                                            renaming = code
                                            newCode = code
                                        },
                                        MenuItem(tr("common.remove"), "trash", destructive = true) { remove(code) },
                                    ),
                                )
                            }
                        }
                        if (canEdit) {
                            Column(
                                Modifier.width(72.dp).clickable(enabled = progress == null, onClick = pickImages),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                            ) {
                                Box(
                                    Modifier
                                        .size(WZ.Space.space11)
                                        .clip(RoundedCornerShape(WZ.Radius.lg))
                                        .background(theme.fill),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    PhIcon("plus", size = WZ.SizeIcon.md, tint = theme.textMuted)
                                }
                                Text(tr("settings.emojisStickers.upload"), style = wizardFont(WZ.FontSize.xs), color = theme.textMuted)
                            }
                        }
                    }
                    progress?.let { current ->
                        RowDivider()
                        UploadProgressRow(current) { cancelled = true }
                    }
                    if (progress == null && failed.isNotEmpty()) {
                        RowDivider()
                        ActionRow(
                            if (cancelled) tr("room.settings.emojis.resumeUpload") else L10n.plural("room.settings.emojis.retryFailed", failed.size, failed.size),
                            "arrow-counter-clockwise",
                            { runUpload(failed) },
                        )
                    }
                }
            }
            if (images.isNotEmpty()) {
                item { PackSizeMeter(PackSize.contentBytes(content)) }
                if (canEdit && PackSize.level(PackSize.contentBytes(content)) == PackSize.Level.Over) {
                    item {
                        GroupedSection {
                            ActionRow(tr("room.settings.emojis.splitPack"), "stack-plus", ::split, enabled = !saving)
                        }
                    }
                }
            }
            item { ErrorText(error) }
        }
    }

    renaming?.let { old ->
        TextFieldDialog(
            tr("common.rename"),
            newCode,
            { newCode = it },
            "shortcode",
            tr("common.save"),
            onConfirm = { rename(old, newCode) },
            onDismiss = { renaming = null },
            plain = true,
        )
    }
}

/** The read-only size of a pack against the Matrix limit, with the web's warning and over-limit notes */
@Composable
private fun PackSizeMeter(bytes: Int) {
    val level = PackSize.level(bytes)
    val text = L10n.format("room.settings.emojis.sizeMeter", PackSize.formatKb(bytes), PackSize.formatKb(PackSize.BUDGET_BYTES))
    val color = when (level) {
        PackSize.Level.Over -> theme.danger
        PackSize.Level.Near -> theme.warningColor
        PackSize.Level.Ok -> theme.textSecondary
    }
    Column(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
    ) {
        Text(text, style = wizardFont(WZ.FontSize.sm), color = color)
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
                    .fillMaxWidth((bytes.toFloat() / PackSize.BUDGET_BYTES).coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .background(
                        when (level) {
                            PackSize.Level.Over -> theme.danger
                            PackSize.Level.Near -> theme.warningColor
                            PackSize.Level.Ok -> theme.accent
                        },
                    ),
            )
        }
        when (level) {
            PackSize.Level.Over -> Text(tr("room.settings.emojis.sizeOver"), style = wizardFont(WZ.FontSize.sm), color = theme.danger)
            PackSize.Level.Near -> Text(tr("room.settings.emojis.sizeWarn"), style = wizardFont(WZ.FontSize.sm), color = theme.warningColor)
            PackSize.Level.Ok -> Unit
        }
    }
}

@Composable
private fun RoomPackThumb(url: String) {
    val media = LocalMedia.current
    var image by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url, media) { image = media?.thumbnail(url, 112) }
    Box(
        Modifier.size(WZ.Space.space11).clip(RoundedCornerShape(WZ.Radius.lg)).background(if (image == null) theme.fill else theme.groupedRow),
        contentAlignment = Alignment.Center,
    ) {
        image?.let { Image(it.asImageBitmap(), null, Modifier.size(WZ.Space.space11), contentScale = ContentScale.Fit) }
    }
}
