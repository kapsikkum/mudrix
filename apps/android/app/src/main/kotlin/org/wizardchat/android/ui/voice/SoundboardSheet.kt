package org.wizardchat.android.ui.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import org.wizardchat.android.matrix.rtc.RoomSoundboards
import org.wizardchat.android.matrix.rtc.Soundboard
import org.wizardchat.android.ui.space.LocalSpaceGraph
import org.wizardchat.android.matrix.rtc.SoundboardClip
import org.wizardchat.android.matrix.rtc.SoundboardEdit
import org.wizardchat.android.matrix.rtc.SoundboardSound
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
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
    val graph = LocalSpaceGraph.current
    var roomClips by remember { mutableStateOf<List<RoomSoundboards.RoomClip>>(emptyList()) }
    var origins by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var access by remember { mutableStateOf(RoomSoundboards.Access.ok) }
    var personalBoard by remember { mutableStateOf<List<SoundboardSound>>(emptyList()) }
    var ownBoard by remember { mutableStateOf<List<SoundboardSound>>(emptyList()) }
    var canEditRoom by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var reloads by remember { mutableIntStateOf(0) }
    var editor by remember { mutableStateOf<Pair<BoardTarget, SoundboardSound?>?>(null) }
    LaunchedEffect(session.client, reloads) {
        val client = session.client ?: return@LaunchedEffect
        personalBoard = Soundboard.personalBoard(client)
        personal = personalBoard.map(Soundboard::toClip)
    }
    // The boards of this room and of the spaces above it (read only), and whether this person may play here
    LaunchedEffect(session.client, roomId, graph, reloads) {
        val client = session.client ?: return@LaunchedEffect
        roomClips = RoomSoundboards.clips(client, graph, roomId)
        val own = RoomSoundboards.load(client, roomId)
        ownBoard = own.board
        canEditRoom = session.userId?.let { SoundboardEdit.canManage(own, it, Soundboard.BOARD_TYPE) } == true
        origins = roomClips.map { it.originRoomId }.distinct().filter { it != roomId }.associateWith { id ->
            runCatching { client.roomDetails(id).name }.getOrNull().orEmpty()
        }
        session.userId?.let { access = RoomSoundboards.access(client, graph, roomId, it) }
    }

    fun press(clip: SoundboardClip) {
        when (access) {
            RoomSoundboards.Access.roomDisabled -> return CopyToast.show(L10n.format("soundboard.play.roomDisabled"))
            RoomSoundboards.Access.forbidden -> return CopyToast.show(L10n.format("soundboard.play.forbidden"))
            RoomSoundboards.Access.ok -> Unit
        }
        val message = when (Soundboard.press(roomId, clip)) {
            PlayResult.Ok -> null
            PlayResult.Disabled -> "soundboard.play.disabled"
            PlayResult.NotInCall -> "soundboard.play.notInCall"
            PlayResult.RateLimited, PlayResult.Cooldown -> "soundboard.play.rateLimited"
            PlayResult.Error -> "soundboard.play.error"
        }
        message?.let { CopyToast.show(L10n.format(it)) }
    }

    /** Taps play a clip, or open it for editing while "Edit sounds" is on */
    fun tapPersonal(clip: SoundboardClip) {
        if (editing) personalBoard.firstOrNull { it.id == clip.id }?.let { editor = BoardTarget.Personal to it } else press(clip)
    }

    fun tapRoom(clip: SoundboardClip) {
        if (editing && canEditRoom) ownBoard.firstOrNull { it.id == clip.id }?.let { editor = BoardTarget.Room(roomId) to it } else press(clip)
    }

    WizardSheet(onDismiss) {
        SheetTopBar(
            tr("soundboard.panel.title"),
            leading = {
                BarTextButton(
                    tr(if (editing) "common.done" else "soundboard.panel.editSounds"),
                    { editing = !editing },
                    enabled = personal.isNotEmpty() || (canEditRoom && ownBoard.isNotEmpty()),
                )
            },
            trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) },
        )
        Column(
            Modifier
                .fillMaxWidth()
                .background(theme.bgSecondary)
                .heightIn(max = 520.dp)
                .verticalScroll(rememberScrollState())
                .padding(WZ.Space.space5),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            if (editing) Text(tr("soundboard.panel.editHint"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            SectionHeader(tr("soundboard.panel.yourSounds"), tr("soundboard.panel.addToYours")) { editor = BoardTarget.Personal to null }
            if (personal.isEmpty()) {
                Text(tr("soundboard.panel.emptyPersonal"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    personal.forEach { ClipButton(it, editing) { tapPersonal(it) } }
                }
            }
            // The room's own clips first, then each space's
            val groups = roomClips.groupBy { it.originRoomId }
            val own = groups[roomId].orEmpty()
            if (own.isNotEmpty() || canEditRoom) {
                SectionHeader(
                    tr("soundboard.panel.roomSounds"),
                    if (canEditRoom) tr("soundboard.panel.addToRoom") else null,
                ) { editor = BoardTarget.Room(roomId) to null }
                if (own.isEmpty()) {
                    Text(tr("soundboard.panel.emptyRoomManage"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                } else {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                        own.forEach { ClipButton(it.clip, editing && canEditRoom) { tapRoom(it.clip) } }
                    }
                }
            }
            groups.filterKeys { it != roomId }.forEach { (origin, list) ->
                Section(tr("soundboard.panel.fromSpace", origins[origin].orEmpty().ifEmpty { origin }))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    list.forEach { ClipButton(it.clip) { press(it.clip) } }
                }
            }
            Section(tr("soundboard.panel.defaultSounds"))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                Soundboard.builtInClips.forEach { ClipButton(it) { press(it) } }
            }
            Spacer(Modifier.navigationBarsPadding())
        }
    }
    editor?.let { (target, sound) ->
        SoundEditorSheet(target, sound, onDismiss = { editor = null }, onChanged = {
            reloads++
            RoomSoundboards.reset()
        })
    }
}

@Composable
private fun Section(title: String) {
    Text(title, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
}

/** A section title with, when allowed, a button to add a clip to it */
@Composable
private fun SectionHeader(title: String, addLabel: String?, onAdd: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
        if (addLabel != null) {
            Box(Modifier.clip(CircleShape).clickable(onClick = onAdd).padding(WZ.Space.space2)) {
                PhIcon("plus-circle", size = WZ.SizeIcon.lg, tint = theme.accent, contentDescription = addLabel)
            }
        }
    }
}

@Composable
private fun ClipButton(clip: SoundboardClip, editing: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(if (editing) theme.accent.copy(alpha = 0.18f) else theme.fill)
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space3),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        clip.emoji?.let { Text(it, style = wizardFont(WZ.FontSize.xl)) }
        Text(clip.name, style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
