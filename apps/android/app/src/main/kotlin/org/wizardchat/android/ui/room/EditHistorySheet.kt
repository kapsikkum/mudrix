package org.wizardchat.android.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import kotlinx.coroutines.CancellationException
import org.wizardchat.android.matrix.EditHistory
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.people.FormList
import org.wizardchat.android.ui.people.SheetBar
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.EventVersion
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/**
 * "Edit history": every version of a message, newest first, with the current text and the original
 * marked. Opened from the "(edited)" marker or the message menu.
 */
@Composable
fun EditHistorySheet(
    client: WizardClient,
    roomId: String,
    eventId: String,
    onDismiss: () -> Unit,
) {
    var versions by remember(eventId) { mutableStateOf<List<EventVersion>?>(null) }
    var error by remember(eventId) { mutableStateOf<String?>(null) }
    val title = tr("timeline.editHistory.title")
    val close = tr("common.close")
    val loading = tr("common.loading")
    val empty = tr("timeline.editHistory.empty")
    val failed = tr("timeline.editHistory.failed")

    LaunchedEffect(client, roomId, eventId) {
        versions = null
        error = null
        try {
            versions = EditHistory.newestFirst(client.eventEditHistory(roomId, eventId))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.message ?: ""
        }
    }

    WizardSheet(onDismiss) {
        SheetBar(title, trailing = { BarTextButton(close, onDismiss) })
        FormList {
            val list = versions
            val problem = error
            when {
                problem != null -> item {
                    GroupedSection {
                        GroupedRow(failed.replace("{{error}}", problem), titleColor = theme.textMuted)
                    }
                }
                list == null -> item {
                    GroupedSection { GroupedRow(loading) { Spinner(size = WZ.SizeIcon.md) } }
                }
                EditHistory.isEmpty(list) -> item {
                    GroupedSection { GroupedRow(empty, titleColor = theme.textMuted) }
                }
                else -> item {
                    GroupedSection {
                        list.forEachIndexed { index, version ->
                            VersionRow(version, index)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VersionRow(version: EventVersion, index: Int) {
    val badges = EditHistory.badges(version, index)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            badges.forEach { key ->
                Text(
                    tr(key),
                    Modifier
                        .clip(RoundedCornerShape(WZ.Radius.sm))
                        .background(theme.fill)
                        .padding(horizontal = WZ.Space.space3, vertical = 1.dp)
                        .then(Modifier),
                    style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
                    color = theme.textMuted,
                )
            }
            Text(
                Formats.abbreviatedDateTime(Instant.ofEpochMilli(version.timestamp)),
                style = wizardFont(WZ.FontSize.xs),
                color = theme.textMuted,
            )
        }
        Text(version.body, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
    }
}
