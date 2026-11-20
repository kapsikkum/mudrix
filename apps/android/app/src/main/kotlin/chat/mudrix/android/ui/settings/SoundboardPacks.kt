package chat.mudrix.android.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import chat.mudrix.android.LocalPrefs
import chat.mudrix.android.matrix.rtc.Soundboard
import chat.mudrix.android.matrix.rtc.SoundboardSound
import chat.mudrix.android.ui.BarTextButton
import chat.mudrix.android.ui.CopyToast
import chat.mudrix.android.ui.GroupedSection
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.PhIcon
import chat.mudrix.android.ui.PhWeight
import chat.mudrix.android.ui.SheetTopBar
import chat.mudrix.android.ui.Spinner
import chat.mudrix.android.ui.WizardSheet
import chat.mudrix.android.ui.people.ErrorText
import chat.mudrix.android.ui.people.FormField
import chat.mudrix.android.ui.people.FormList
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.android.ui.voice.BoardTarget
import chat.mudrix.android.ui.voice.SoundEditorSheet
import chat.mudrix.core.MudrixClient
import chat.mudrix.core.SoundPack
import chat.mudrix.tokens.WZ

private sealed interface PackSheet {
    data object Details : PackSheet
    data class Sound(val sound: SoundboardSound?) : PackSheet
}

private fun soundCount(count: Int) = L10n.plural("settings.soundboard.soundCount", count, count)

@Composable
private fun LoadFailed() {
    SettingsItem { Text(tr("settings.soundboard.loadFailed"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted) }
}

@Composable
private fun Loading() {
    SettingsItem(horizontalAlignment = Alignment.CenterHorizontally) { Spinner() }
}

/** The person's own pack, which is used in every call */
@Composable
internal fun DefaultPackSection(client: MudrixClient) {
    val prefs = LocalPrefs.current
    var pack by remember { mutableStateOf<SoundPack?>(null) }
    var failed by remember { mutableStateOf(false) }
    var reloads by remember { mutableIntStateOf(0) }
    var sheet by remember { mutableStateOf<PackSheet?>(null) }

    LaunchedEffect(client, reloads) {
        runCatching { client.mySounds() }
            .onSuccess {
                pack = it
                failed = false
            }
            .onFailure { failed = true }
    }

    SettingsSection(tr("settings.soundboard.defaultPack"), tr("settings.soundboard.defaultPackNote")) {
        val current = pack
        if (failed) {
            LoadFailed()
        } else if (current == null) {
            Loading()
        } else {
            val count = current.sounds.size
            val note = listOfNotNull(soundCount(count), current.attribution?.takeIf { it.isNotBlank() }).joinToString(" · ")
            SettingRow(current.name?.takeIf { it.isNotBlank() } ?: tr("settings.soundboard.defaultPackName"), note) {
                IconAction("pencil-simple", tr("common.edit")) { sheet = PackSheet.Details }
            }
            if (count == 0) {
                SettingsDivider()
                SettingsItem { Text(tr("settings.soundboard.noSounds"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted) }
            }
            current.sounds.forEach { sound ->
                SettingsDivider()
                val clip = Soundboard.toClip(sound)
                RowFrame(onClick = { sheet = PackSheet.Sound(Soundboard.toSound(sound)) }) {
                    Box(Modifier.size(WZ.Space.space9), contentAlignment = Alignment.Center) {
                        val emoji = clip.emoji
                        if (emoji != null) {
                            Text(emoji, style = wizardFont(WZ.FontSize.xl))
                        } else {
                            PhIcon("speaker-high", tint = theme.textMuted)
                        }
                    }
                    RowLabel(clip.name, null, Modifier.weight(1f))
                    IconAction("play", tr("settings.soundboard.preview"), PhWeight.fill) {
                        if (prefs.soundboardEnabled) Soundboard.preview(client, clip) else CopyToast.show(L10n.format("soundboard.play.disabled"))
                    }
                }
            }
            SettingsDivider()
            SettingsItem {
                LabelButton(
                    tr("settings.soundboard.addSounds"),
                    "plus",
                    { sheet = PackSheet.Sound(null) },
                    enabled = count < Soundboard.MAX_SOUNDS,
                )
            }
        }
    }

    when (val open = sheet) {
        PackSheet.Details -> pack?.let { PackDetailsSheet(client, it, { sheet = null }) { reloads++ } }
        is PackSheet.Sound -> SoundEditorSheet(BoardTarget.Personal, open.sound, onDismiss = { sheet = null }, onChanged = { reloads++ })
        null -> Unit
    }
}

/** The pack's name and attribution; its sounds stay as they are */
@Composable
private fun PackDetailsSheet(client: MudrixClient, pack: SoundPack, onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    val fallback = tr("settings.soundboard.defaultPackName")
    var name by remember { mutableStateOf(pack.name?.takeIf { it.isNotBlank() } ?: fallback) }
    var attribution by remember { mutableStateOf(pack.attribution.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun save() {
        scope.launch {
            busy = true
            error = null
            try {
                client.saveSoundPack(null, "", name.trim(), attribution.trim().ifEmpty { null }, pack.sounds)
                onSaved()
                onDismiss()
            } catch (e: Exception) {
                error = e.message ?: e.toString()
            } finally {
                busy = false
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetTopBar(
            tr("settings.soundboard.defaultPack"),
            leading = { BarTextButton(tr("common.cancel"), onDismiss) },
            trailing = { BarTextButton(tr("common.save"), ::save, enabled = !busy && name.isNotBlank(), bold = true) },
        )
        FormList {
            item {
                GroupedSection(header = tr("settings.soundboard.packName")) {
                    FormField(name, { name = it.take(64) }, tr("settings.soundboard.packNamePlaceholder"))
                }
            }
            item {
                GroupedSection(header = tr("settings.soundboard.attribution")) {
                    FormField(attribution, { attribution = it.take(200) }, tr("settings.soundboard.attributionPlaceholder"))
                }
            }
            item { ErrorText(error) }
        }
    }
}

/** Packs favourited from rooms, which apply in every call */
@Composable
internal fun FavoritePacksSection(client: MudrixClient) {
    val scope = rememberCoroutineScope()
    var packs by remember { mutableStateOf<List<SoundPack>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var selecting by remember { mutableStateOf(false) }

    LaunchedEffect(client) {
        runCatching { client.favoriteSoundPacks() }
            .onSuccess { packs = it }
            .onFailure {
                packs = emptyList()
                failed = true
            }
    }

    fun setEverywhere(pack: SoundPack, everywhere: Boolean) {
        val roomId = pack.roomId
        val stateKey = pack.stateKey
        if (roomId.isNullOrEmpty() || stateKey.isNullOrEmpty()) return
        val before = packs.orEmpty()
        packs = before.filter { it.id != pack.id } + if (everywhere) listOf(pack.copy(everywhere = true)) else emptyList()
        scope.launch {
            try {
                client.setSoundPackEverywhere(roomId, stateKey, everywhere)
            } catch (e: Exception) {
                packs = before
                CopyToast.show(L10n.format("common.saveFailed", e.message ?: e.toString()))
            }
        }
    }

    SettingsSection(tr("settings.soundboard.favoritePacks"), tr("settings.soundboard.favoritePacksNote")) {
        val favorites = packs
        if (failed) {
            LoadFailed()
        } else if (favorites == null) {
            Loading()
        } else if (favorites.isEmpty()) {
            SettingsItem { Text(tr("settings.soundboard.noFavoritePacks"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted) }
        } else {
            favorites.forEach { pack ->
                val name = pack.name.orEmpty()
                SettingRow(name, "${pack.roomName ?: pack.roomId.orEmpty()} · ${soundCount(pack.sounds.size)}") {
                    IconAction("x", tr("settings.soundboard.removeFavorite", name)) { setEverywhere(pack, false) }
                }
                SettingsDivider()
            }
        }
        SettingsItem { LabelButton(tr("settings.soundboard.selectPacks"), "plus", { selecting = true }) }
    }

    if (selecting) SelectPacksSheet(client, ::setEverywhere) { selecting = false }
}

/** Every sound pack in the person's rooms, grouped by room, to tick the ones that apply in every call */
@Composable
private fun SelectPacksSheet(client: MudrixClient, onToggle: (SoundPack, Boolean) -> Unit, onDismiss: () -> Unit) {
    var all by remember { mutableStateOf<List<SoundPack>?>(null) }
    var failed by remember { mutableStateOf(false) }

    LaunchedEffect(client) {
        runCatching { client.allSoundPacks() }
            .onSuccess { all = it }
            .onFailure {
                all = emptyList()
                failed = true
            }
    }

    fun toggle(pack: SoundPack) {
        val everywhere = !pack.everywhere
        all = all?.map { if (it.id == pack.id) it.copy(everywhere = everywhere) else it }
        onToggle(pack, everywhere)
    }

    WizardSheet(onDismiss) {
        SheetTopBar(tr("settings.soundboard.selectPacks"), trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) })
        FormList {
            val list = all
            if (list == null) {
                item { Box(Modifier.fillMaxWidth().padding(WZ.Space.space6), contentAlignment = Alignment.Center) { Spinner() } }
            } else if (failed || list.isEmpty()) {
                item {
                    Text(
                        tr(if (failed) "settings.soundboard.loadFailed" else "settings.soundboard.noPacksFound"),
                        Modifier.padding(WZ.Space.space6),
                        style = wizardFont(WZ.FontSize.lg),
                        color = theme.textMuted,
                    )
                }
            } else {
                list.groupBy { it.roomName ?: it.roomId.orEmpty() }.forEach { (room, packs) ->
                    item(key = room) {
                        SettingsSection(room) {
                            packs.forEachIndexed { index, pack ->
                                if (index > 0) SettingsDivider()
                                CheckRow(pack.name.orEmpty(), pack.everywhere) { toggle(pack) }
                            }
                        }
                    }
                }
            }
        }
    }
}
