package org.wizardchat.android.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.createRoom
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** A new text or voice room, optionally inside a space */
@Composable
fun CreateRoomSheet(spaceId: String?, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val closeParents = LocalCloseParents.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var isVoice by remember { mutableStateOf(false) }
    var isPublic by remember { mutableStateOf(false) }
    var encrypted by remember { mutableStateOf(true) }
    var alias by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val server = (session.userId ?: "").split(":", limit = 2).last()

    fun create() {
        scope.launch {
            busy = true
            try {
                val roomId = session.createRoom(
                    name.trim(),
                    topic.ifEmpty { null },
                    isPublic,
                    encrypted,
                    isVoice,
                    alias.ifEmpty { null },
                    spaceId,
                )
                onDismiss()
                closeParents()
                navigator.openRoom(roomId)
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                busy = false
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetPage {
            SheetBar(
                tr(if (spaceId == null) "rooms.newRoom" else "room.newRoomInSpace"),
                leading = { BarTextButton(tr("common.cancel"), onDismiss) },
                trailing = {
                    if (busy) {
                        Box(Modifier.padding(horizontal = WZ.Space.space6)) { Spinner(size = WZ.SizeIcon.md) }
                    } else {
                        BarTextButton(tr("common.create"), ::create, enabled = name.isNotBlank(), bold = true)
                    }
                },
            )
            FormList(Modifier.weight(1f)) {
                item {
                    GroupedSection {
                        FormField(name, { name = it }, tr("dialogs.name"))
                        RowDivider()
                        FormField(topic, { topic = it }, tr("dialogs.topic"), maxLines = 3)
                    }
                }
                item {
                    SegmentedPicker(
                        listOf(
                            Triple(tr("room.text"), "hash-straight", PhWeight.regular),
                            Triple(tr("room.voice"), "speaker-high", PhWeight.fill),
                        ),
                        if (isVoice) 1 else 0,
                        { isVoice = it == 1 },
                        Modifier.padding(horizontal = WZ.Space.space6).padding(top = WZ.Space.space6),
                    )
                }
                item {
                    GroupedSection(footer = tr(if (isPublic) "room.anyoneCanFindAnd" else "room.onlyPeopleWhoAre")) {
                        ToggleRow(tr("room.settings.security.accessPublic"), isPublic, { isPublic = it })
                        RowDivider()
                        if (isPublic) {
                            Row(
                                Modifier.padding(start = WZ.Space.space5, end = WZ.Space.space5),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
                            ) {
                                Text("#", style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
                                Box(Modifier.weight(1f)) {
                                    FormField(alias, { alias = it }, "address", plain = true, horizontalPadding = WZ.Space.space0)
                                }
                                Text(":$server", style = wizardFont(WZ.FontSize.lg), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        } else {
                            ToggleRow(tr("room.create.e2ee"), encrypted, { encrypted = it })
                        }
                    }
                }
                item { ErrorText(error) }
            }
        }
    }
}

/** A segmented control with icon labels */
@Composable
internal fun SegmentedPicker(
    options: List<Triple<String, String, PhWeight>>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(WZ.Radius.md))
            .background(theme.fill)
            .padding(WZ.Space.space1),
    ) {
        options.forEachIndexed { index, (label, icon, weight) ->
            val on = index == selected
            Row(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(WZ.Radius.md - WZ.Space.space1))
                    .background(if (on) theme.bgTertiary else theme.fill)
                    .clickable { onSelect(index) }
                    .padding(vertical = WZ.Space.space3),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PhIcon(icon, weight, size = WZ.SizeIcon.sm, tint = theme.textPrimary)
                Text(label, style = wizardFont(WZ.FontSize.md, if (on) FontWeight.SemiBold else FontWeight.Normal), color = theme.textPrimary)
            }
        }
    }
}
