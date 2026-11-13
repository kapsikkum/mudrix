package org.wizardchat.android.ui.people

import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ImagePacks
import org.wizardchat.android.matrix.PackSize
import org.wizardchat.android.matrix.canSendState
import org.wizardchat.android.matrix.setStateEvent
import org.wizardchat.android.matrix.stateEvents
import org.wizardchat.android.matrix.uploadMedia
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

internal const val PACK_TYPE = "im.ponies.room_emotes"

internal fun packDisplayName(content: JsonObject, key: String): String =
    (content["pack"] as? JsonObject)?.get("display_name").string ?: key.ifEmpty { L10n.format("room.settings.emojis.roomPack") }

/** A room's custom emoji and sticker packs */
@Composable
internal fun RoomPacksScreen(roomId: String, onBack: () -> Unit, onOpenPack: (key: String, content: JsonObject, canEdit: Boolean) -> Unit) {
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

private data class PendingImage(val url: String, val mime: String)

private fun cleanCode(code: String) = code.trim(':', ' ').replace(" ", "_")

/** Edits one pack: its name, usage and images */
@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
internal fun PackEditorScreen(roomId: String, stateKey: String, initial: JsonObject, canEdit: Boolean, onBack: () -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var content by remember { mutableStateOf(initial) }
    var pending by remember { mutableStateOf<PendingImage?>(null) }
    var shortcode by remember { mutableStateOf("") }
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
        scope.launch {
            try {
                session.setStateEvent(PACK_TYPE, stateKey, snapshot, roomId)
                ImagePacks.forget()
                error = null
            } catch (e: Exception) {
                error = L10n.format("common.saveFailed", errorText(e))
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

    val pickImage = rememberImagePicker { uri ->
        scope.launch {
            try {
                val data = readBytes(context, uri) ?: return@launch
                val isGif = data.size >= 3 && data[0] == 0x47.toByte() && data[1] == 0x49.toByte() && data[2] == 0x46.toByte()
                val payload = if (isGif) data else withContext(Dispatchers.Default) { pngData(data) } ?: data
                val mime = if (isGif) "image/gif" else "image/png"
                pending = PendingImage(session.uploadMedia(payload, mime), mime)
                shortcode = ""
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    fun addImage() {
        val image = pending ?: return
        val code = cleanCode(shortcode)
        withImages {
            this[code] = buildJsonObject {
                put("url", image.url)
                put("body", code)
                put("info", buildJsonObject { put("mimetype", image.mime) })
            }
        }
        pending = null
        save()
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
                                Modifier.width(72.dp).clickable(onClick = pickImage),
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
                    if (pending != null) {
                        RowDivider()
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            FormField(shortcode, { shortcode = it }, "shortcode", Modifier.weight(1f), plain = true)
                            BarTextButton(tr("common.add"), ::addImage, enabled = cleanCode(shortcode).isNotEmpty())
                        }
                    }
                }
            }
            if (images.isNotEmpty()) {
                item { PackSizeMeter(PackSize.contentBytes(content)) }
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

private fun pngData(data: ByteArray): ByteArray? {
    val image = BitmapFactory.decodeByteArray(data, 0, data.size) ?: return null
    return ByteArrayOutputStream().use { out ->
        image.compress(Bitmap.CompressFormat.PNG, 100, out)
        out.toByteArray()
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
