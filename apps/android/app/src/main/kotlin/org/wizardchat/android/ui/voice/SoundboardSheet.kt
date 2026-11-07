package org.wizardchat.android.ui.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.rtc.PlayResult
import org.wizardchat.android.matrix.rtc.Soundboard
import org.wizardchat.android.matrix.rtc.SoundboardClip
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The call's soundboard: your own clips and the bundled ones, played for everyone in the call */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SoundboardSheet(roomId: String, onDismiss: () -> Unit) {
    val session = LocalSession.current
    var personal by remember { mutableStateOf<List<SoundboardClip>>(emptyList()) }
    LaunchedEffect(session.client) {
        val client = session.client ?: return@LaunchedEffect
        personal = Soundboard.personalBoard(client).map(Soundboard::toClip)
    }

    fun press(clip: SoundboardClip) {
        val message = when (Soundboard.press(roomId, clip)) {
            PlayResult.Ok -> null
            PlayResult.Disabled -> "soundboard.play.disabled"
            PlayResult.NotInCall -> "soundboard.play.notInCall"
            PlayResult.RateLimited, PlayResult.Cooldown -> "soundboard.play.rateLimited"
            PlayResult.Error -> "soundboard.play.error"
        }
        message?.let { CopyToast.show(L10n.format(it)) }
    }

    WizardSheet(onDismiss) {
        SheetTopBar(tr("soundboard.panel.title"), trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) })
        Column(
            Modifier
                .fillMaxWidth()
                .background(theme.bgSecondary)
                .heightIn(max = 520.dp)
                .verticalScroll(rememberScrollState())
                .padding(WZ.Space.space5),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            if (personal.isNotEmpty()) {
                Section(tr("soundboard.panel.yourSounds"))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    personal.forEach { ClipButton(it) { press(it) } }
                }
            }
            Section(tr("soundboard.panel.defaultSounds"))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                Soundboard.builtInClips.forEach { ClipButton(it) { press(it) } }
            }
            Spacer(Modifier.navigationBarsPadding())
        }
    }
}

@Composable
private fun Section(title: String) {
    Text(title, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
}

@Composable
private fun ClipButton(clip: SoundboardClip, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space3),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        clip.emoji?.let { Text(it, style = wizardFont(WZ.FontSize.xl)) }
        Text(clip.name, style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
