package org.wizardchat.android.ui.voice

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MediaMetadata
import org.wizardchat.android.matrix.rtc.RoomSoundboards
import org.wizardchat.android.matrix.rtc.Soundboard
import org.wizardchat.android.matrix.rtc.SoundboardEdit
import org.wizardchat.android.matrix.rtc.SoundboardSound
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.people.ActionRow
import org.wizardchat.android.ui.people.ErrorText
import org.wizardchat.android.ui.people.FormField
import org.wizardchat.android.ui.people.FormList
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** Which board a clip belongs to */
sealed interface BoardTarget {
    data object Personal : BoardTarget
    data class Room(val roomId: String) : BoardTarget
}

private class PickedSound(val uri: Uri, val mimetype: String, val durationMs: Long, val size: Long, val fileName: String)

/** Adding a clip to a board, or changing or deleting one of its clips (volume, name, emoji, file) */
@Composable
fun SoundEditorSheet(target: BoardTarget, existing: SoundboardSound?, onDismiss: () -> Unit, onChanged: () -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var picked by remember { mutableStateOf<PickedSound?>(null) }
    var name by remember { mutableStateOf(existing?.name.orEmpty()) }
    var emoji by remember { mutableStateOf(existing?.emoji.orEmpty()) }
    var volume by remember { mutableFloatStateOf(existing?.volume ?: 1f) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    DisposableEffect(Unit) { onDispose { runCatching { player?.release() } } }

    val chooser = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            error = null
            val resolver = context.contentResolver
            val (fileName, size) = withContext(Dispatchers.IO) {
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) cursor.getString(0) to cursor.getLong(1) else null
                } ?: ("" to 0L)
            }
            val mimetype = SoundboardEdit.mimetypeOf(resolver.getType(uri), fileName)
            val durationMs = ((MediaMetadata.duration(uri) ?: 0.0) * 1000).toLong()
            val problem = SoundboardEdit.check(mimetype, size, durationMs)
            if (problem != null) {
                error = L10n.format(problem.key)
                return@launch
            }
            picked = PickedSound(uri, mimetype!!, durationMs, size, fileName)
            if (name.isEmpty()) name = SoundboardEdit.cleanName(fileName.substringBeforeLast('.'))
        }
    }

    fun preview() {
        val current = picked
        runCatching { player?.release() }
        if (current != null) {
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                runCatching {
                    setDataSource(context, current.uri)
                    setVolume(volume, volume)
                    prepare()
                    start()
                }
            }
        } else if (existing != null) {
            session.client?.let { Soundboard.preview(it, Soundboard.toClip(existing.copy(volume = volume))) }
        }
    }

    fun save(action: suspend (client: org.wizardchat.core.WizardClient, board: List<SoundboardSound>) -> List<SoundboardSound>) {
        val client = session.client ?: return
        val me = session.userId.orEmpty()
        scope.launch {
            busy = true
            error = null
            try {
                val current = when (target) {
                    BoardTarget.Personal -> Soundboard.personalBoard(client)
                    is BoardTarget.Room -> RoomSoundboards.load(client, target.roomId, force = true).board
                }
                val next = action(client, current)
                when (target) {
                    BoardTarget.Personal -> SoundboardEdit.writePersonal(client, next)
                    is BoardTarget.Room -> SoundboardEdit.writeRoom(client, target.roomId, me, next)
                }
                onChanged()
                onDismiss()
            } catch (e: SoundboardEdit.Failure) {
                error = L10n.format(e.problem.key)
            } catch (e: Exception) {
                error = e.message ?: e.toString()
            } finally {
                busy = false
            }
        }
    }

    fun submit() = save { client, board ->
        val file = picked
        if (existing == null) {
            val chosen = file ?: throw SoundboardEdit.Failure(SoundboardEdit.Problem.Type, L10n.format("soundboard.panel.chooseFirst"))
            val bytes = withContext(Dispatchers.IO) { context.contentResolver.openInputStream(chosen.uri)?.use { it.readBytes() } }
                ?: throw SoundboardEdit.Failure(SoundboardEdit.Problem.Decode)
            SoundboardEdit.added(board, SoundboardEdit.upload(client, bytes, chosen.mimetype, chosen.durationMs, name, emoji, volume))
        } else {
            var updated = existing.copy(name = SoundboardEdit.cleanName(name).ifEmpty { existing.name }, emoji = SoundboardEdit.cleanEmoji(emoji), volume = volume)
            if (file != null) {
                val bytes = withContext(Dispatchers.IO) { context.contentResolver.openInputStream(file.uri)?.use { it.readBytes() } }
                    ?: throw SoundboardEdit.Failure(SoundboardEdit.Problem.Decode)
                val fresh = SoundboardEdit.upload(client, bytes, file.mimetype, file.durationMs, updated.name, updated.emoji, volume)
                updated = updated.copy(url = fresh.url, mimetype = fresh.mimetype, durationMs = fresh.durationMs, size = fresh.size)
            }
            SoundboardEdit.replaced(board, updated)
        }
    }

    WizardSheet(onDismiss) {
        SheetTopBar(
            tr(if (existing == null) "soundboard.panel.addSound" else "soundboard.panel.editTitle"),
            leading = { BarTextButton(tr("common.cancel"), onDismiss) },
            trailing = {
                BarTextButton(
                    tr(if (existing == null) "soundboard.panel.add" else "common.save"),
                    ::submit,
                    enabled = !busy && (existing != null || picked != null),
                    bold = true,
                )
            },
        )
        FormList {
            item {
                GroupedSection(footer = tr("soundboard.panel.fileNote")) {
                    GroupedRow(
                        picked?.fileName?.ifEmpty { null } ?: tr("soundboard.panel.chooseFile"),
                        icon = "file",
                        iconTint = theme.accent,
                        onClick = { chooser.launch(arrayOf("audio/*")) },
                    ) {
                        picked?.let {
                            Text("${"%.1f".format(it.durationMs / 1000.0)} s", style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                        }
                    }
                    if (picked != null || existing != null) {
                        RowDivider()
                        ActionRow(tr("soundboard.panel.preview"), "speaker-high", ::preview)
                    }
                }
            }
            item {
                GroupedSection {
                    FormField(name, { name = it.take(Soundboard.MAX_NAME_LENGTH) }, tr("soundboard.panel.name"))
                    RowDivider()
                    FormField(emoji, { emoji = it.take(16) }, tr("soundboard.panel.emoji"), plain = true)
                    RowDivider()
                    Column(Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(tr("soundboard.panel.volume"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
                            Text("${Math.round(volume * 100)}%", style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                        }
                        Slider(
                            value = volume,
                            onValueChange = { volume = it },
                            valueRange = 0f..1f,
                            colors = SliderDefaults.colors(thumbColor = theme.accent, activeTrackColor = theme.accent, inactiveTrackColor = theme.fill),
                        )
                    }
                }
            }
            if (existing != null) {
                item {
                    GroupedSection {
                        ActionRow(tr("soundboard.panel.delete"), "minus-circle", { confirmDelete = true }, theme.danger, enabled = !busy)
                    }
                }
            }
            item { ErrorText(error) }
        }
    }

    if (confirmDelete && existing != null) {
        ConfirmDialog(
            title = tr("soundboard.panel.confirmDelete"),
            confirmLabel = tr("soundboard.panel.delete"),
            onConfirm = { save { _, board -> SoundboardEdit.removed(board, existing.id) } },
            onDismiss = { confirmDelete = false },
        )
    }
}
