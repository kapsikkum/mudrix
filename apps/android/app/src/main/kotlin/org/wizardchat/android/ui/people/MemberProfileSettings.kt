package org.wizardchat.android.ui.people

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomMemberProfile
import org.wizardchat.tokens.WZ

/** A square avatar crop, so a per-room picture isn't uploaded at its original size */
internal fun cropSquare(source: Bitmap, max: Int = 256): Bitmap {
    val crop = squareCrop(source.width, source.height, max)
    val square = Bitmap.createBitmap(source, crop.x, crop.y, crop.size, crop.size)
    return if (crop.size <= max) square else Bitmap.createScaledBitmap(square, max, max, true)
}

/** The centred square to keep, and how big it ends up: the shorter side, capped at [max] */
internal data class SquareCrop(val x: Int, val y: Int, val size: Int)

internal fun squareCrop(width: Int, height: Int, max: Int = 256): SquareCrop {
    val size = minOf(width, height)
    return SquareCrop((width - size) / 2, (height - size) / 2, minOf(size, max))
}

/**
 * "Your name and picture here": the own member event of this room, which the server shows instead
 * of the account's name and picture. The web app has the same section in `MemberProfileSection.tsx`.
 */
@Composable
internal fun RoomMemberProfileItem(roomId: String, onError: (String) -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val me = session.userId
    val client = session.requireClient
    var profile by remember(roomId) { mutableStateOf<RoomMemberProfile?>(null) }
    var editingName by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }

    LaunchedEffect(client, roomId, me, reload) {
        val userId = me ?: return@LaunchedEffect
        profile = runCatching { client.roomMemberProfile(roomId, userId) }.getOrNull()
    }

    fun save(shoutSaved: Boolean = true) {
        scope.launch {
            busy = true
            try {
                client.setRoomNickname(roomId, name.trim().ifBlank { null })
                if (shoutSaved) CopyToast.show(L10n.format("room.settings.general.myProfile.saved"))
                editingName = false
                reload++
            } catch (e: Exception) {
                onError(L10n.format("room.settings.general.myProfile.failed", e.message ?: ""))
            } finally {
                busy = false
            }
        }
    }

    val pick = rememberImagePicker { uri ->
        scope.launch {
            busy = true
            try {
                val data = readBytes(context, uri) ?: return@launch
                val jpeg = withContext(Dispatchers.Default) {
                    val image = BitmapFactory.decodeByteArray(data, 0, data.size) ?: return@withContext null
                    ByteArrayOutputStream().use { out ->
                        cropSquare(image).compress(Bitmap.CompressFormat.JPEG, 88, out)
                        out.toByteArray()
                    }
                } ?: return@launch
                client.setRoomMemberAvatar(roomId, jpeg, "image/jpeg")
                CopyToast.show(L10n.format("room.settings.general.myProfile.saved"))
                reload++
            } catch (e: Exception) {
                onError(L10n.format("room.settings.general.myProfile.failed", e.message ?: ""))
            } finally {
                busy = false
            }
        }
    }

    val current = profile
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        GroupedSection(tr("room.settings.general.myProfile.title"), footer = tr("room.settings.general.myProfile.note")) {            GroupedRow(
                tr("room.settings.general.myProfile.name"),
                icon = "user",
                onClick = if (busy) null else {
                    {
                        name = current?.displayname.orEmpty()
                        editingName = true
                    }
                },
            ) {
                Text(
                    current?.displayname ?: tr("room.settings.general.myProfile.namePlaceholder"),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                )
            }
            RowDivider()
            GroupedRow(
                tr("room.settings.permissions.changePicture"),
                icon = "camera",
                onClick = if (busy) null else pick,
            )
            if (current?.avatarUrl != null) {
                RowDivider()
                GroupedRow(
                    tr("room.settings.general.myProfile.removeAvatar"),
                    icon = "arrow-counter-clockwise",
                    titleColor = theme.textMuted,
                    onClick = if (busy) null else {
                        {
                            scope.launch {
                                busy = true
                                try {
                                    client.setRoomMemberAvatar(roomId, null, null)
                                    CopyToast.show(L10n.format("room.settings.general.myProfile.saved"))
                                    reload++
                                } catch (e: Exception) {
                                    onError(L10n.format("room.settings.general.myProfile.failed", e.message ?: ""))
                                } finally {
                                    busy = false
                                }
                            }
                        }
                    },
                )
            }
        }
    }

    if (editingName) {
        WizardSheet({ editingName = false }) {
            SheetBar(
                tr("room.settings.general.myProfile.name"),
                trailing = { BarTextButton(tr("common.close"), { editingName = false }) },
            )
            Column(Modifier.fillMaxWidth().padding(WZ.Space.space6), verticalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
                    WizardTextField(
                        value = name,
                        onValueChange = { name = it },
                        placeholder = tr("room.settings.general.myProfile.namePlaceholder"),
                        enabled = !busy,
                        onSubmit = { save() },
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            tr("common.save"),
                            Modifier.clip(CircleShape).clickable(enabled = !busy) { save() },
                            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                            color = theme.accent,
                        )
                        if (current?.displayname != null) {
                            Text(
                                tr("room.space.nickname.reset"),
                                Modifier.clip(CircleShape).clickable(enabled = !busy) {
                                    name = ""
                                    save()
                                },
                                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                                color = theme.textMuted,
                            )
                        }
                    }
                }
            }
}
}
