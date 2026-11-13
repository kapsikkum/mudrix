package org.wizardchat.android.ui.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.CosmeticKind
import org.wizardchat.android.matrix.CosmeticPackStore
import org.wizardchat.android.matrix.CosmeticPacks
import org.wizardchat.android.matrix.ExtendedProfile
import org.wizardchat.android.matrix.ProfileFields
import org.wizardchat.android.matrix.writeProfileField
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.cosmetics.CosmeticCatalog
import org.wizardchat.android.ui.cosmetics.CosmeticImage
import org.wizardchat.android.ui.cosmetics.DecorationOverlay
import org.wizardchat.android.ui.cosmetics.FrameBox
import org.wizardchat.android.ui.cosmetics.NameplateBox
import org.wizardchat.android.ui.cosmetics.ProfileCosmeticsCache
import org.wizardchat.android.ui.people.SheetBar
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.tokens.WZ

private val KINDS = CosmeticPacks.KINDS

/** The profile field a kind is stored under, written under both of its key names */
private fun keysOf(kind: CosmeticKind) = when (kind) {
    CosmeticKind.decoration -> ProfileFields.DECORATION_KEYS
    CosmeticKind.effect -> ProfileFields.EFFECT_KEYS
    CosmeticKind.nameplate -> ProfileFields.NAMEPLATE_KEYS
    CosmeticKind.profile_frame -> ProfileFields.FRAME_KEYS
}

private fun valueOf(profile: ExtendedProfile, kind: CosmeticKind): CosmeticPacks.Value? = when (kind) {
    CosmeticKind.decoration -> profile.avatarDecoration
    CosmeticKind.effect -> profile.profileEffect
    CosmeticKind.nameplate -> profile.nameplate
    CosmeticKind.profile_frame -> profile.profileFrame
}

private fun withValue(profile: ExtendedProfile, kind: CosmeticKind, value: CosmeticPacks.Value?) = when (kind) {
    CosmeticKind.decoration -> profile.copy(avatarDecoration = value)
    CosmeticKind.effect -> profile.copy(profileEffect = value)
    CosmeticKind.nameplate -> profile.copy(nameplate = value)
    CosmeticKind.profile_frame -> profile.copy(profileFrame = value)
}

/** The stored key a pick is compared with: the id of shipped art, or a pack item's media URL */
private fun storedKey(value: CosmeticPacks.Value?): String? = when (value) {
    is CosmeticPacks.Value.Id -> value.id
    is CosmeticPacks.Value.Media -> value.url.takeIf { it.isNotEmpty() }
    null -> null
}

/** "Profile cosmetics": pick the avatar decoration, nameplate, frame and effect other Mudrix users see */
@Composable
internal fun CosmeticsSection() {
    val session = LocalSession.current
    val context = LocalContext.current
    val prefs = LocalPrefs.current
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf(ExtendedProfile()) }
    var packs by remember { mutableStateOf(listOf<CosmeticPacks.Pack>()) }
    var picking by remember { mutableStateOf<CosmeticKind?>(null) }
    var selectingPacks by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val me = session.userId ?: return
    val showPacks = prefs.showCosmeticPacks

    suspend fun reloadProfile() {
        val client = session.client ?: return
        runCatching { client.profileFields(me) }.getOrNull()?.let { profile = ProfileFields.parse(it) }
    }

    suspend fun reloadPacks() {
        if (!showPacks) {
            packs = emptyList()
            return
        }
        packs = listOfNotNull(CosmeticPackStore.personal(session)) + CosmeticPackStore.subscribed(session)
    }

    LaunchedEffect(session.client, me) { reloadProfile() }
    LaunchedEffect(session.client, showPacks) { reloadPacks() }

    fun choose(kind: CosmeticKind, value: CosmeticPacks.Value?, stored: JsonPrimitive? = null) {
        scope.launch {
            try {
                val content = when {
                    value == null -> null
                    stored != null -> stored
                    value is CosmeticPacks.Value.Id -> JsonPrimitive(value.id)
                    else -> JsonPrimitive((value as CosmeticPacks.Value.Media).url)
                }
                session.writeProfileField(keysOf(kind), content)
                profile = withValue(profile, kind, value)
                ProfileCosmeticsCache.invalidate(me)
                picking = null
            } catch (e: Exception) {
                error = L10n.format("common.saveFailed", e.message ?: "")
            }
        }
    }

    fun chooseItem(item: CosmeticPacks.Item) {
        scope.launch {
            try {
                session.writeProfileField(keysOf(item.kind), CosmeticPacks.valueOf(item))
                profile = withValue(profile, item.kind, CosmeticPacks.parseValue(CosmeticPacks.valueOf(item)))
                ProfileCosmeticsCache.invalidate(me)
                picking = null
            } catch (e: Exception) {
                error = L10n.format("common.saveFailed", e.message ?: "")
            }
        }
    }

    fun togglePack(pack: CosmeticPacks.Pack, on: Boolean) {
        val roomId = pack.roomId ?: return
        scope.launch {
            try {
                val existing = CosmeticPackStore.subscriptions(session)
                CosmeticPackStore.saveSubscriptions(session, CosmeticPacks.withSubscription(existing, roomId, pack.stateKey, on))
                reloadPacks()
            } catch (e: Exception) {
                error = L10n.format("common.saveFailed", e.message ?: "")
            }
        }
    }

    fun selectionName(kind: CosmeticKind): String? {
        val value = valueOf(profile, kind) ?: return null
        val key = storedKey(value) ?: return null
        for (pack in packs) {
            for (item in CosmeticPacks.itemsOfKind(pack, kind)) if (item.url == key) return item.name
        }
        return when (value) {
            is CosmeticPacks.Value.Id -> builtinName(kind, value.id)
            is CosmeticPacks.Value.Media -> L10n.format("profile.cosmetics.unsubscribedPackItem")
        }
    }

    SettingsSection(tr("profile.cosmetics.title"), note = tr("settings.cosmetics.note")) {
        ToggleRow(tr("settings.cosmetics.showPacks"), showPacks, { prefs.showCosmeticPacks = it }, note = tr("settings.cosmetics.showPacksDescription"))
        if (!showPacks) {
            SettingsItem { Text(tr("settings.cosmetics.packsOff"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted) }
        } else {
            SettingsDivider()
            RowFrame(onClick = { selectingPacks = true }) {
                RowLabel(tr("settings.emojisStickers.selectPacks"), tr("settings.cosmetics.hint"), Modifier.weight(1f))
                PhIcon("caret-right", size = WZ.SizeIcon.sm, tint = theme.textMuted)
            }
        }
        for (kind in KINDS) {
            SettingsDivider()
            CosmeticRow(tr("settings.cosmetics.kindPlural.${kind.name}"), selectionName(kind)) { picking = kind }
        }
        if (showPacks && packs.isNotEmpty()) {
            SettingsDivider()
            SettingsItem {
                Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    Text(tr("settings.emojisStickers.favoritePacks"), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
                    for (pack in packs) {
                        Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space0)) {
                            Text(pack.displayName, style = wizardFont(WZ.FontSize.md), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                (pack.roomId?.let { session.roomList?.room(it)?.name } ?: tr("profile.cosmetics.myUploads")) +
                                    " · " + trPlural("settings.emojisStickers.imageCount", pack.items.size, pack.items.size),
                                style = wizardFont(WZ.FontSize.sm),
                                color = theme.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
        error?.let {
            SettingsItem { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.error) }
        }
    }

    selectingPacks.takeIf { it && showPacks }?.let {
        SelectPacksSheet({ selectingPacks = false }, ::togglePack)
    }

    picking?.let { kind ->
        WizardSheet({ picking = null }) {
            SheetBar(
                tr("settings.cosmetics.kindPlural.${kind.name}"),
                trailing = { BarTextButton(tr("common.done"), { picking = null }, bold = true) },
            )
            CosmeticGrid(
                kind,
                profile,
                packs,
                session.displayName ?: me,
                session.avatarUrl,
                ::choose,
                ::chooseItem,
            )
        }
    }
}

@Composable
private fun CosmeticRow(label: String, value: String?, onClick: () -> Unit) {
    RowFrame(onClick = onClick) {
        RowLabel(label, value ?: tr("profile.decoration.none"), Modifier.weight(1f))
        PhIcon("caret-right", size = WZ.SizeIcon.sm, tint = theme.textMuted)
    }
}

/** The name shipped art is shown under: a decoration's `profile.decoration.<camelCaseId>`, or the web's effect keys */
internal fun decorationName(id: String): String = builtinName(CosmeticKind.decoration, id)

private fun builtinName(kind: CosmeticKind, id: String): String {
    val prefix = if (kind == CosmeticKind.effect) "profile.effect" else "profile.decoration"
    val camel = id.split('-').mapIndexed { i, part -> if (i == 0) part else part.replaceFirstChar { it.uppercase() } }.joinToString("")
    val key = "$prefix.$camel"
    val text = L10n.format(key)
    return if (text == key || text.isEmpty()) id.replace('-', ' ').replaceFirstChar { it.uppercase() } else text
}

/** One row in the picker: a group's heading, or a cosmetic to pick */
private sealed interface GridEntry {
    data class Header(val name: String, val source: String?) : GridEntry
    data class Item(val url: String, val label: String, val value: CosmeticPacks.Value?) : GridEntry
    data class Pick(val item: CosmeticPacks.Item) : GridEntry
}

@Composable
private fun CosmeticGrid(
    kind: CosmeticKind,
    profile: ExtendedProfile,
    packs: List<CosmeticPacks.Pack>,
    name: String,
    avatarUrl: String?,
    onChoose: (CosmeticKind, CosmeticPacks.Value?, JsonPrimitive?) -> Unit,
    onChooseItem: (CosmeticPacks.Item) -> Unit,
) {
    val context = LocalContext.current
    val session = LocalSession.current
    val selected = storedKey(valueOf(profile, kind))
    val roomName = { roomId: String -> session.roomList?.room(roomId)?.name ?: roomId }

    val builtins: List<GridEntry.Item> = remember(kind) {
        when (kind) {
            CosmeticKind.decoration -> CosmeticCatalog.decorations(context).map { id ->
                GridEntry.Item(id, decorationName(id), CosmeticPacks.Value.Id(id))
            }
            CosmeticKind.effect -> emptyList()
            CosmeticKind.nameplate -> CosmeticCatalog.nameplates(context).map { plate ->
                GridEntry.Item(plate.id, plate.name, CosmeticPacks.Value.Id(plate.id))
            }
            CosmeticKind.profile_frame -> CosmeticCatalog.frames(context).map { frame ->
                GridEntry.Item(frame.id, frame.name, CosmeticPacks.Value.Id(frame.id))
            }
        }
    }

    val entries = ArrayList<GridEntry>()
    entries += GridEntry.Item("", tr("profile.decoration.none"), null)
    if (builtins.isNotEmpty()) {
        entries += GridEntry.Header(tr("profile.cosmetics.builtin"), null)
        entries += builtins
    }
    for (pack in packs) {
        val items = CosmeticPacks.itemsOfKind(pack, kind)
        if (items.isEmpty()) continue
        val source = if (pack.roomId == null) tr("profile.cosmetics.myUploads") else roomName(pack.roomId)
        entries += GridEntry.Header(pack.displayName, source)
        items.forEach { entries += GridEntry.Pick(it) }
    }

    LazyVerticalGrid(
        GridCells.Adaptive(if (kind == CosmeticKind.decoration) 96.dp else 150.dp),
        Modifier.fillMaxWidth().background(theme.groupedBackground),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(WZ.Space.space5),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        items(
            entries,
            span = { entry -> if (entry is GridEntry.Header) GridItemSpan(maxLineSpan) else GridItemSpan(1) },
        ) { entry ->
            when (entry) {
                is GridEntry.Header -> Column(Modifier.fillMaxWidth().padding(top = WZ.Space.space3)) {
                    Text(entry.name, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    entry.source?.let {
                        Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                is GridEntry.Item -> Tile(selected = entry.url.isNotEmpty() && entry.url == selected, onClick = {
                    onChoose(kind, entry.value, entry.url.takeIf { it.isNotEmpty() }?.let(::JsonPrimitive))
                }) {
                    Preview(kind, entry.value, name, avatarUrl, entry.label)
                }
                is GridEntry.Pick -> Tile(selected = entry.item.url == selected, onClick = { onChooseItem(entry.item) }) {
                    Preview(kind, CosmeticPacks.parseValue(CosmeticPacks.valueOf(entry.item)), name, avatarUrl, entry.item.name)
                }
            }
        }
    }
}

@Composable
private fun Preview(kind: CosmeticKind, value: CosmeticPacks.Value?, name: String, avatarUrl: String?, label: String) {
    val context = LocalContext.current
    when (kind) {
        CosmeticKind.decoration -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            Box(contentAlignment = Alignment.Center) {
                Avatar(name, avatarUrl, WZ.SizeAvatar.md)
                DecorationOverlay(CosmeticCatalog.decoration(context, value), WZ.SizeAvatar.md, animate = true)
            }
            Text(label, style = wizardFont(WZ.FontSize.xs), color = theme.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        CosmeticKind.nameplate -> {
            NameplateBox(CosmeticCatalog.nameplate(context, value), Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(WZ.Radius.md))) {
                Text(label, Modifier.align(Alignment.CenterStart).padding(start = WZ.Space.space4), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1)
            }
        }
        CosmeticKind.profile_frame -> FrameBox(
            CosmeticCatalog.frame(context, value),
            Modifier.fillMaxWidth().height(72.dp),
        ) {
            Text(label, Modifier.align(Alignment.Center), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textPrimary, textAlign = TextAlign.Center, maxLines = 1)
        }
        CosmeticKind.effect -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            Box(Modifier.size(WZ.SizeAvatar.md).clip(RoundedCornerShape(WZ.Radius.md)).background(theme.fill), contentAlignment = Alignment.Center) {
                val art = CosmeticCatalog.effect(value)
                if (art != null) {
                    CosmeticImage(art, Modifier.size(WZ.SizeAvatar.md), animate = true, width = 240)
                } else {
                    PhIcon("sparkle", size = WZ.SizeIcon.md, tint = theme.accent)
                }
            }
            Text(label, style = wizardFont(WZ.FontSize.xs), color = theme.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Tile(selected: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(WZ.Radius.lg)
    Box(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(theme.fill)
            .border(BorderStroke(if (selected) WZ.BorderWidth.thick else WZ.BorderWidth.thin, if (selected) theme.accent else theme.border), shape)
            .clickable(onClick = onClick)
            .padding(WZ.Space.space3),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun SelectPacksSheet(onDismiss: () -> Unit, onToggle: (CosmeticPacks.Pack, Boolean) -> Unit) {
    val session = LocalSession.current
    var packs by remember { mutableStateOf(listOf<CosmeticPacks.Pack>()) }
    var subscribed by remember { mutableStateOf(setOf<String>()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        try {
            subscribed = CosmeticPacks.subscribedRefs(CosmeticPackStore.subscriptions(session))
                .map { "${it.roomId}|${it.stateKey}" }
                .toSet()
            packs = CosmeticPackStore.discoverable(session)
        } finally {
            loading = false
        }
    }

    WizardSheet(onDismiss) {
        SheetBar(tr("settings.emojisStickers.selectPacks"), trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) })
        LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(0.85f).background(theme.bgSecondary).navigationBarsPadding()) {
            if (loading) {
                item { Box(Modifier.fillMaxWidth().padding(WZ.Space.space6), contentAlignment = Alignment.Center) { Spinner() } }
            } else if (packs.isEmpty()) {
                item {
                    Text(tr("settings.emojisStickers.noPacksFound"), Modifier.padding(WZ.Space.space6), style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
                }
            }
            itemsIndexed(packs, key = { _, pack -> "${pack.roomId}|${pack.stateKey}" }) { _, pack ->
                val roomId = pack.roomId ?: return@itemsIndexed
                val id = "$roomId|${pack.stateKey}"
                val isSubscribed = id in subscribed
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(theme.bgPrimary)
                        .clickable {
                            val on = !isSubscribed
                            subscribed = if (on) subscribed + id else subscribed - id
                            onToggle(pack, on)
                        }
                        .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                        Text(pack.displayName, style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${session.roomList?.room(roomId)?.name ?: roomId} · ${trPlural("settings.emojisStickers.imageCount", pack.items.size, pack.items.size)}",
                            style = wizardFont(WZ.FontSize.sm),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    PhIcon(
                        "star",
                        if (isSubscribed) PhWeight.fill else PhWeight.regular,
                        tint = if (isSubscribed) theme.accent else theme.textMuted,
                    )
                }
            }
        }
    }
}
