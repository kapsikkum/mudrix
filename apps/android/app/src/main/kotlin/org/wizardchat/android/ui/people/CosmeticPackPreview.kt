package org.wizardchat.android.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.CosmeticKind
import org.wizardchat.android.matrix.CosmeticPackStore
import org.wizardchat.android.matrix.CosmeticPacks
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.cosmetics.CosmeticCatalog
import org.wizardchat.android.ui.cosmetics.CosmeticImage
import org.wizardchat.android.ui.cosmetics.DecorationOverlay
import org.wizardchat.android.ui.cosmetics.FrameBox
import org.wizardchat.android.ui.cosmetics.NameplateBox
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The cosmetic packs a room or space holds, each opening a look at its items (read-only) */
internal fun LazyListScope.roomCosmeticPacks(roomId: String) {
    item {
        val showPacks = org.wizardchat.android.LocalPrefs.current.showCosmeticPacks
        var packs by remember(roomId, showPacks) { mutableStateOf(listOf<CosmeticPacks.Pack>()) }
        var preview by remember { mutableStateOf<CosmeticPacks.Pack?>(null) }
        val session = LocalSession.current
        LaunchedEffect(roomId, showPacks) {
            if (showPacks) packs = CosmeticPackStore.roomPacks(session, roomId)
        }
        if (showPacks && packs.isNotEmpty()) {
            GroupedSection(header = tr("room.settings.cosmetics.title"), footer = tr("room.settings.cosmetics.description")) {
                packs.forEachIndexed { index, pack ->
                    if (index > 0) RowDivider()
                    NavRow(pack.displayName, "sparkle", { preview = pack }, value = "${pack.items.size}")
                }
            }
        }
        preview?.let { pack -> CosmeticPackPreviewSheet(pack) { preview = null } }
    }
}

/** Every item of a cosmetic pack at its own size, grouped by kind, on a plain backdrop */
@Composable
private fun CosmeticPackPreviewSheet(pack: CosmeticPacks.Pack, onDismiss: () -> Unit) {
    WizardSheet(onDismiss) {
        SheetBar(pack.displayName, trailing = { BarTextButton(tr("common.close"), onDismiss, bold = true) })
        if (pack.items.isEmpty()) {
            Text(tr("room.settings.cosmetics.previewEmpty"), Modifier.fillMaxWidth().padding(WZ.Space.space6), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
        } else {
            val kinds = CosmeticPacks.KINDS.mapNotNull { kind -> CosmeticPacks.itemsOfKind(pack, kind).takeIf { it.isNotEmpty() }?.let { kind to it } }
            LazyVerticalGrid(
                GridCells.Adaptive(120.dp),
                Modifier.fillMaxWidth().background(theme.groupedBackground),
                contentPadding = PaddingValues(WZ.Space.space5),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                kinds.forEach { (kind, items) ->
                    item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                        Text(tr("settings.cosmetics.kindPlural.${kind.name}"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
                    }
                    items(items, key = { "${kind.name}/${it.shortcode}" }) { item -> CosmeticPackItem(item) }
                }
            }
        }
    }
}

@Composable
private fun CosmeticPackItem(item: CosmeticPacks.Item) {
    val context = LocalContext.current
    val art = CosmeticCatalog.Image.Media(item.url)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
        Box(Modifier.fillMaxWidth().height(96.dp), contentAlignment = Alignment.Center) {
            when (item.kind) {
                CosmeticKind.decoration -> Box(contentAlignment = Alignment.Center) {
                    Avatar(item.name, null, WZ.SizeAvatar.md)
                    DecorationOverlay(art, WZ.SizeAvatar.md, animate = true)
                }
                CosmeticKind.nameplate -> NameplateBox(CosmeticCatalog.NameplateArt(art, item.palette ?: "none"), Modifier.fillMaxWidth().height(56.dp)) {
                    Text(item.name, Modifier.align(Alignment.CenterStart).padding(start = WZ.Space.space4), style = wizardFont(WZ.FontSize.sm), color = theme.textPrimary, maxLines = 1)
                }
                CosmeticKind.profile_frame -> FrameBox(CosmeticCatalog.frame(context, CosmeticPacks.parseValue(CosmeticPacks.valueOf(item))), Modifier.fillMaxWidth().height(80.dp)) {
                    Text(item.name, Modifier.align(Alignment.Center), style = wizardFont(WZ.FontSize.sm), color = theme.textPrimary, maxLines = 1)
                }
                CosmeticKind.effect -> CosmeticImage(art, Modifier.size(96.dp), animate = true, width = 240)
            }
        }
        Text(item.name, style = wizardFont(WZ.FontSize.xs), color = theme.textSecondary, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}
