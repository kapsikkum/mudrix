package org.wizardchat.android.ui.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ExtendedProfile
import org.wizardchat.android.matrix.ProfileFields
import org.wizardchat.android.matrix.writeProfileField
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.people.SheetBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.cosmetics.CosmeticCatalog
import org.wizardchat.android.ui.cosmetics.DecorationOverlay
import org.wizardchat.android.ui.cosmetics.FrameBox
import org.wizardchat.android.ui.cosmetics.NameplateBox
import org.wizardchat.android.ui.cosmetics.ProfileCosmeticsCache
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

private enum class CosmeticKind { decoration, nameplate, frame }

/** "Profile cosmetics": pick the avatar decoration, nameplate and frame other Mudrix users see */
@Composable
internal fun CosmeticsSection() {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf(ExtendedProfile()) }
    var picking by remember { mutableStateOf<CosmeticKind?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val me = session.userId ?: return

    LaunchedEffect(session.client, me) {
        val client = session.client ?: return@LaunchedEffect
        runCatching { client.profileFields(me) }.getOrNull()?.let { profile = ProfileFields.parse(it) }
    }

    fun choose(kind: CosmeticKind, id: String?) {
        scope.launch {
            try {
                val value = id?.let { JsonPrimitive(it) }
                when (kind) {
                    CosmeticKind.decoration -> session.writeProfileField(ProfileFields.DECORATION_KEYS, value)
                    CosmeticKind.nameplate -> session.writeProfileField(ProfileFields.NAMEPLATE_KEYS, value)
                    CosmeticKind.frame -> session.writeProfileField(ProfileFields.FRAME_KEYS, value)
                }
                profile = when (kind) {
                    CosmeticKind.decoration -> profile.copy(avatarDecoration = id)
                    CosmeticKind.nameplate -> profile.copy(nameplate = id)
                    CosmeticKind.frame -> profile.copy(profileFrame = id)
                }
                ProfileCosmeticsCache.invalidate(me)
                picking = null
            } catch (e: Exception) {
                error = L10n.format("common.saveFailed", e.message ?: "")
            }
        }
    }

    val current = CosmeticCatalog.resolve(context, profile)
    SettingsSection(tr("profile.cosmetics.title"), note = tr("profile.cosmetics.mudrixOnly")) {
        CosmeticRow(tr("profile.decoration.title"), current.decoration?.let { decorationName(it) }) { picking = CosmeticKind.decoration }
        SettingsDivider()
        CosmeticRow(tr("settings.account.styleNameplate"), current.nameplate?.name) { picking = CosmeticKind.nameplate }
        SettingsDivider()
        CosmeticRow(tr("settings.account.styleFrame"), current.frame?.name) { picking = CosmeticKind.frame }
        error?.let {
            SettingsItem { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.error) }
        }
    }

    picking?.let { kind ->
        WizardSheet({ picking = null }) {
            SheetBar(
                when (kind) {
                    CosmeticKind.decoration -> tr("profile.decoration.chooseTitle")
                    CosmeticKind.nameplate -> tr("settings.account.styleNameplate")
                    CosmeticKind.frame -> tr("settings.account.styleFrame")
                },
                trailing = { BarTextButton(tr("common.done"), { picking = null }, bold = true) },
            )
            CosmeticGrid(kind, profile, session.displayName ?: me, session.avatarUrl, ::choose)
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

/** The name the web gives a built-in decoration (`profile.decoration.<camelCaseId>`), or the id made readable */
internal fun decorationName(id: String): String {
    val camel = id.split('-').mapIndexed { i, part -> if (i == 0) part else part.replaceFirstChar { it.uppercase() } }.joinToString("")
    val key = "profile.decoration.$camel"
    val text = L10n.format(key)
    return if (text == key || text.isEmpty()) id.replace('-', ' ').replaceFirstChar { it.uppercase() } else text
}

@Composable
private fun CosmeticGrid(
    kind: CosmeticKind,
    profile: ExtendedProfile,
    name: String,
    avatarUrl: String?,
    onChoose: (CosmeticKind, String?) -> Unit,
) {
    val context = LocalContext.current
    val ids: List<String> = remember(kind) {
        when (kind) {
            CosmeticKind.decoration -> CosmeticCatalog.decorations(context)
            CosmeticKind.nameplate -> CosmeticCatalog.nameplates(context).map { it.id }
            CosmeticKind.frame -> CosmeticCatalog.frames(context).map { it.id }
        }
    }
    val selected = when (kind) {
        CosmeticKind.decoration -> profile.avatarDecoration
        CosmeticKind.nameplate -> profile.nameplate
        CosmeticKind.frame -> profile.profileFrame
    }
    LazyVerticalGrid(
        GridCells.Adaptive(if (kind == CosmeticKind.decoration) 96.dp else 150.dp),
        Modifier.fillMaxWidth().background(theme.groupedBackground),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(WZ.Space.space5),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        items(listOf<String?>(null) + ids) { id ->
            Tile(selected = id == selected, onClick = { onChoose(kind, id) }) {
                when {
                    id == null -> Text(tr("profile.decoration.none"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                    kind == CosmeticKind.decoration -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                        Box(contentAlignment = Alignment.Center) {
                            Avatar(name, avatarUrl, WZ.SizeAvatar.md)
                            DecorationOverlay(id, WZ.SizeAvatar.md)
                        }
                        Text(decorationName(id), style = wizardFont(WZ.FontSize.xs), color = theme.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    kind == CosmeticKind.nameplate -> {
                        val plate = CosmeticCatalog.nameplates(context).firstOrNull { it.id == id }
                        NameplateBox(plate, Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(WZ.Radius.md))) {
                            Text(plate?.name ?: id, Modifier.align(Alignment.CenterStart).padding(start = WZ.Space.space4), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1)
                        }
                    }
                    else -> {
                        val frame = CosmeticCatalog.frames(context).firstOrNull { it.id == id }
                        FrameBox(frame, Modifier.fillMaxWidth().height(72.dp)) {
                            Text(frame?.name ?: id, Modifier.align(Alignment.Center), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textPrimary, textAlign = TextAlign.Center, maxLines = 1)
                        }
                    }
                }
            }
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
