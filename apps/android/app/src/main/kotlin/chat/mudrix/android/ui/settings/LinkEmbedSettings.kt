package chat.mudrix.android.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import chat.mudrix.android.LocalPrefs
import chat.mudrix.android.media.LinkEmbedMode
import chat.mudrix.android.media.LinkEmbedService
import chat.mudrix.android.ui.PhIcon
import chat.mudrix.android.ui.PhWeight
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ

/** The Link embeds section: a bulk row, then the players of the services themselves and the cards embeds.now makes */
@Composable
internal fun LinkEmbedSettings() {
    val prefs = LocalPrefs.current
    val all = LinkEmbedService.entries
    val everyone = all.map { prefs.linkEmbedMode(it) }.distinct().singleOrNull()
    SettingsSection(tr("settings.media.linkEmbeds.title"), note = tr("settings.media.linkEmbeds.note")) {
        SettingsItem(verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
            Text(tr("settings.media.linkEmbeds.bulk"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
            ModeControl(
                selected = everyone,
                labels = listOf(
                    LinkEmbedMode.on to tr("settings.media.linkEmbeds.allowAll"),
                    LinkEmbedMode.ask to tr("settings.media.linkEmbeds.askAll"),
                    LinkEmbedMode.off to tr("settings.media.linkEmbeds.hideAll"),
                ),
            ) { mode -> all.forEach { prefs.setLinkEmbedMode(it, mode) } }
        }
    }
    SettingsSection(tr("settings.media.linkEmbeds.groupPlayers")) {
        ServiceRows(LinkEmbedService.players)
    }
    SettingsSection(tr("settings.media.linkEmbeds.groupCards"), note = tr("settings.media.linkEmbeds.via")) {
        ServiceRows(LinkEmbedService.cards)
    }
}

@Composable
private fun ServiceRows(services: List<LinkEmbedService>) {
    services.forEachIndexed { index, service ->
        if (index > 0) SettingsDivider()
        ServiceRow(service)
    }
}

@Composable
private fun ServiceRow(service: LinkEmbedService) {
    val prefs = LocalPrefs.current
    SettingsItem(verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5), verticalAlignment = Alignment.Top) {
            val (icon, weight) = serviceIcon(service)
            PhIcon(icon, weight, size = WZ.SizeIcon.lg, tint = theme.textMuted, modifier = Modifier.padding(top = WZ.Space.space1))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                Text(service.label, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
                Text(tr("settings.media.linkEmbeds.desc.${service.id}"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
        }
        ModeControl(
            selected = prefs.linkEmbedMode(service),
            labels = listOf(
                LinkEmbedMode.ask to tr("settings.media.linkEmbeds.ask"),
                LinkEmbedMode.on to tr("settings.media.linkEmbeds.on"),
                LinkEmbedMode.off to tr("settings.media.linkEmbeds.off"),
            ),
        ) { prefs.setLinkEmbedMode(service, it) }
    }
}

/** No brand logos ship with the icon set, so services share a few generic pictures by what they show */
private fun serviceIcon(service: LinkEmbedService): Pair<String, PhWeight> = when (service) {
    LinkEmbedService.youtube -> "play" to PhWeight.fill
    LinkEmbedService.spotify -> "speaker-high" to PhWeight.regular
    LinkEmbedService.tiktok -> "video-camera" to PhWeight.regular
    LinkEmbedService.instagram, LinkEmbedService.pinterest -> "image" to PhWeight.regular
    else -> "chat-circle" to PhWeight.regular
}

/** Three choices side by side, full width so a large font only grows the buttons taller */
@Composable
private fun ModeControl(
    selected: LinkEmbedMode?,
    labels: List<Pair<LinkEmbedMode, String>>,
    onSelect: (LinkEmbedMode) -> Unit,
) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        labels.forEachIndexed { index, (mode, label) ->
            SegmentedButton(
                selected = selected == mode,
                onClick = { onSelect(mode) },
                shape = SegmentedButtonDefaults.itemShape(index, labels.size),
                colors = SegmentedButtonDefaults.colors(
                    activeContainerColor = theme.accent,
                    activeContentColor = theme.textOnAccent,
                    inactiveContainerColor = theme.fill,
                    inactiveContentColor = theme.textPrimary,
                    activeBorderColor = theme.accent,
                    inactiveBorderColor = theme.border,
                ),
                icon = {},
            ) {
                Text(
                    label,
                    style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                )
            }
        }
    }
}
