package org.wizardchat.android.ui.settings

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ImagePacks
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.accountDataJSON
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.setAccountDataJSON
import org.wizardchat.android.matrix.stateEvents
import org.wizardchat.android.matrix.uploadMedia
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.tokens.WZ

private const val USER_PACK_TYPE = "im.ponies.user_emotes"
private val EMOTE_ROOMS_TYPES = listOf("im.ponies.emote_rooms", "m.image_pack.rooms")

private data class Favorite(val roomId: String, val stateKey: String, val name: String? = null)

private val JsonObject.images: JsonObject get() = this["images"] as? JsonObject ?: JsonObject(emptyMap())

private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

/** The account's own emoji pack and favourite room packs */
@Composable
internal fun EmojisSettings(onBack: () -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var pack by remember { mutableStateOf(JsonObject(emptyMap())) }
    var favorites by remember { mutableStateOf(listOf<Favorite>()) }
    var pendingImage by remember { mutableStateOf<Pair<String, String>?>(null) }
    var shortcode by remember { mutableStateOf("") }
    var showSelectPacks by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val images = pack.images.mapNotNull { (key, value) -> (value as? JsonObject)?.string("url")?.let { key to it } }.sortedBy { it.first }

    fun roomName(roomId: String) = session.roomList?.room(roomId)?.name ?: roomId

    suspend fun reload() {
        pack = session.accountDataJSON(USER_PACK_TYPE) ?: JsonObject(emptyMap())
        val result = mutableListOf<Favorite>()
        for (type in EMOTE_ROOMS_TYPES) {
            val rooms = session.accountDataJSON(type)?.get("rooms") as? JsonObject ?: continue
            for ((roomId, keys) in rooms) {
                for (key in (keys as? JsonObject)?.keys.orEmpty()) {
                    if (result.none { it.roomId == roomId && it.stateKey == key }) result += Favorite(roomId, key)
                }
            }
        }
        favorites = result.map { it.copy(name = packName(it.roomId, it.stateKey)) }
    }

    suspend fun save(content: JsonObject) {
        try {
            session.setAccountDataJSON(USER_PACK_TYPE, content)
            pack = content
            ImagePacks.forget()
        } catch (failure: Exception) {
            error = L10n.format("settings.failedToSave", failure.text)
        }
    }

    suspend fun setFavorite(roomId: String, stateKey: String, on: Boolean) {
        try {
            for (type in EMOTE_ROOMS_TYPES) {
                val content = session.accountDataJSON(type) ?: JsonObject(emptyMap())
                val rooms = (content["rooms"] as? JsonObject).orEmpty().toMutableMap()
                val keys = (rooms[roomId] as? JsonObject).orEmpty().toMutableMap()
                if (on) keys[stateKey] = JsonObject(emptyMap()) else keys.remove(stateKey)
                if (keys.isEmpty()) rooms.remove(roomId) else rooms[roomId] = JsonObject(keys)
                session.setAccountDataJSON(type, JsonObject(content + ("rooms" to JsonObject(rooms))))
            }
            reload()
        } catch (failure: Exception) {
            error = L10n.format("settings.failedToSave", failure.text)
        }
    }

    fun addImage() = scope.launch {
        val (url, mime) = pendingImage ?: return@launch
        val code = shortcode.trim(':', ' ').replace(" ", "_")
        val images = pack.images.toMutableMap()
        images[code] = JsonObject(
            mapOf(
                "url" to JsonPrimitive(url),
                "body" to JsonPrimitive(code),
                "info" to JsonObject(mapOf("mimetype" to JsonPrimitive(mime))),
            ),
        )
        var content = pack + ("images" to JsonObject(images))
        if (pack["pack"] == null) {
            content = content + ("pack" to JsonObject(mapOf("usage" to JsonArray(listOf(JsonPrimitive("emoticon"), JsonPrimitive("sticker"))))))
        }
        save(JsonObject(content))
        pendingImage = null
    }

    fun removeImage(code: String) = scope.launch {
        save(JsonObject(pack + ("images" to JsonObject(pack.images - code))))
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val data = readBytes(context, uri) ?: return@launch
                val isGif = data.size >= 3 && data[0] == 0x47.toByte() && data[1] == 0x49.toByte() && data[2] == 0x46.toByte()
                val payload = if (isGif) data else reencode(data, Bitmap.CompressFormat.PNG, 100) ?: return@launch
                val mime = if (isGif) "image/gif" else "image/png"
                val url = session.uploadMedia(payload, mime)
                pendingImage = url to mime
                shortcode = ""
            } catch (failure: Exception) {
                error = failure.text
            }
        }
    }

    LaunchedEffect(Unit) { reload() }

    SettingsPage(tr("room.settings.emojis.title"), onBack) {
        SettingsSection(tr("settings.emojisStickers.defaultPack"), tr("settings.emojisStickers.defaultPackNote")) {
            SettingsItem(verticalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
                Text(
                    if (images.size == 1) tr("settings.oneImage") else tr("settings.images", images.size),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                )
                ImageGrid(
                    images,
                    onRemove = { removeImage(it) },
                    onUpload = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                )
                if (pendingImage != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                        WizardTextField(shortcode, { shortcode = it }, "shortcode", Modifier.weight(1f))
                        PrimaryButton(
                            tr("common.save"),
                            { addImage() },
                            Modifier.width(WZ.SizeAvatar.xl),
                            enabled = shortcode.trim(':', ' ').isNotEmpty(),
                        )
                    }
                }
                Text(tr("settings.longPressAnImage"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
        }

        SettingsSection(tr("settings.emojisStickers.favoritePacks"), tr("settings.emojisStickers.favoritePacksNote")) {
            if (favorites.isEmpty()) {
                SettingsItem {
                    Text(tr("settings.emojisStickers.noFavoritePacks"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                }
            }
            favorites.forEachIndexed { index, favorite ->
                if (index > 0) SettingsDivider()
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                        Text(
                            favorite.name ?: favorite.stateKey.ifEmpty { roomName(favorite.roomId) },
                            style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            roomName(favorite.roomId),
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    IconAction("star", tr("settings.emojisStickers.removeFavorite"), PhWeight.fill) {
                        scope.launch { setFavorite(favorite.roomId, favorite.stateKey, false) }
                    }
                }
            }
            SettingsDivider()
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = WZ.Space.space11)
                    .clickable { showSelectPacks = true }
                    .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                PhIcon("plus", size = WZ.SizeIcon.md, tint = theme.accent)
                Text(tr("settings.emojisStickers.selectPacks"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.accent)
            }
        }
        error?.let { StatusText(it) }
    }

    if (showSelectPacks) {
        SelectPacksSheet(
            isFavorite = { roomId, key -> favorites.any { it.roomId == roomId && it.stateKey == key } },
            setFavorite = { roomId, key, on -> setFavorite(roomId, key, on) },
            onDismiss = {
                showSelectPacks = false
                scope.launch { reload() }
            },
        )
    }
}

/** An adaptive grid (cells of at least 72dp) of the pack's images and the upload button */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ImageGrid(images: List<Pair<String, String>>, onRemove: (String) -> Unit, onUpload: () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val spacing = WZ.Space.space4
        val columns = maxOf(1, ((maxWidth + spacing) / (72.dp + spacing)).toInt())
        val cells: List<Pair<String, String>?> = images + null
        Column(verticalArrangement = Arrangement.spacedBy(spacing)) {
            cells.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(spacing)) {
                    row.forEach { cell ->
                        Box(Modifier.weight(1f), contentAlignment = Alignment.TopCenter) {
                            if (cell == null) {
                                Column(
                                    Modifier.clip(RoundedCornerShape(WZ.Radius.md)).clickable(onClick = onUpload),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                                ) {
                                    Box(
                                        Modifier
                                            .size(WZ.Space.space11)
                                            .clip(RoundedCornerShape(WZ.Radius.md))
                                            .background(theme.bgTertiary),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        PhIcon("plus", size = WZ.SizeIcon.md, tint = theme.textMuted)
                                    }
                                    Text(tr("settings.upload"), style = wizardFont(WZ.FontSize.xs), color = theme.textMuted)
                                }
                            } else {
                                var menuOpen by remember { mutableStateOf(false) }
                                Column(
                                    Modifier.combinedClickable(onClick = {}, onLongClick = { menuOpen = true }),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                                ) {
                                    PackImageThumb(cell.second)
                                    Text(
                                        ":${cell.first}:",
                                        style = wizardFont(WZ.FontSize.xs),
                                        color = theme.textMuted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                WizardMenu(
                                    menuOpen,
                                    { menuOpen = false },
                                    listOf(MenuItem(tr("common.remove"), "trash", destructive = true) { onRemove(cell.first) }),
                                )
                            }
                        }
                    }
                    repeat(columns - row.size) { Box(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun PackImageThumb(url: String) {
    val media = LocalMedia.current
    var image by remember(url) { mutableStateOf(media?.cachedThumbnail(url)) }
    LaunchedEffect(url, media) { if (image == null) image = media?.thumbnail(url, 168) }
    Box(
        Modifier
            .size(WZ.Space.space11)
            .clip(RoundedCornerShape(WZ.Radius.sm))
            .background(if (image == null) theme.bgTertiary else androidx.compose.ui.graphics.Color.Transparent),
    ) {
        image?.let { Image(it.asImageBitmap(), null, Modifier.size(WZ.Space.space11), contentScale = ContentScale.Fit) }
    }
}

private suspend fun MatrixSession.packName(roomId: String, stateKey: String): String? {
    for (type in listOf("im.ponies.room_emotes", "m.room.image_pack")) {
        val content = stateEvents(type, roomId).firstOrNull { it.first == stateKey }?.second ?: continue
        (content["pack"] as? JsonObject)?.string("display_name")?.takeIf { it.isNotEmpty() }?.let { return it }
    }
    return null
}

private data class FoundPack(val roomId: String, val roomName: String, val stateKey: String, val name: String, val count: Int) {
    val id get() = "$roomId|$stateKey"
}

@Composable
private fun SelectPacksSheet(
    isFavorite: (String, String) -> Boolean,
    setFavorite: suspend (String, String, Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var packs by remember { mutableStateOf(listOf<FoundPack>()) }
    var loading by remember { mutableStateOf(true) }
    var selected by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(Unit) {
        try {
            val rooms = session.roomList?.joinedRooms ?: return@LaunchedEffect
            val found = mutableListOf<FoundPack>()
            for (room in rooms) {
                for (type in listOf("im.ponies.room_emotes", "m.room.image_pack")) {
                    for ((key, content) in session.stateEvents(type, room.id)) {
                        val count = (content["images"] as? JsonObject)?.size ?: 0
                        if (count <= 0 || found.any { it.roomId == room.id && it.stateKey == key }) continue
                        val name = (content["pack"] as? JsonObject)?.string("display_name") ?: key.ifEmpty { room.displayName }
                        found += FoundPack(room.id, room.displayName, key, name, count)
                        if (isFavorite(room.id, key)) selected = selected + "${room.id}|$key"
                    }
                }
            }
            packs = found
        } finally {
            loading = false
        }
    }

    WizardSheet(onDismiss) {
        SheetTopBar(tr("settings.emojisStickers.selectPacks"), trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) })
        LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(0.85f).background(theme.bgSecondary).navigationBarsPadding()) {
            if (loading) {
                item { Box(Modifier.fillMaxWidth().padding(WZ.Space.space6), contentAlignment = Alignment.Center) { Spinner() } }
            } else if (packs.isEmpty()) {
                item {
                    Text(
                        tr("settings.emojisStickers.noPacksFound"),
                        Modifier.padding(WZ.Space.space6),
                        style = wizardFont(WZ.FontSize.lg),
                        color = theme.textMuted,
                    )
                }
            }
            itemsIndexed(packs, key = { _, pack -> pack.id }) { _, pack ->
                val isSelected = pack.id in selected
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(theme.bgPrimary)
                        .clickable {
                            val on = !isSelected
                            selected = if (on) selected + pack.id else selected - pack.id
                            scope.launch { setFavorite(pack.roomId, pack.stateKey, on) }
                        }
                        .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                        Text(pack.name, style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
                        Text(
                            "${pack.roomName} · ${trPlural("settings.emojisStickers.imageCount", pack.count, pack.count)}",
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                        )
                    }
                    PhIcon(
                        "star",
                        if (isSelected) PhWeight.fill else PhWeight.regular,
                        tint = if (isSelected) theme.accent else theme.textMuted,
                    )
                }
            }
        }
    }
}
