package chat.mudrix.android.ui.room

import android.app.DatePickerDialog
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import chat.mudrix.android.matrix.JumpToDate
import chat.mudrix.android.ui.BarTextButton
import chat.mudrix.android.ui.CopyToast
import chat.mudrix.android.ui.GroupedRow
import chat.mudrix.android.ui.GroupedSection
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.WizardSheet
import chat.mudrix.android.ui.people.ActionRow
import chat.mudrix.android.ui.people.FormList
import chat.mudrix.android.ui.people.SheetBar
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.core.MudrixClient
import chat.mudrix.tokens.WZ

/**
 * "Jump to date": picks a day, asks the homeserver for the first message on or after it and hands the
 * event id back so the room can open there. Works on servers with `timestampToEvent` (MSC3030 / v1.6).
 */
@Composable
fun JumpToDateSheet(
    client: MudrixClient,
    roomId: String,
    onJump: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var day by remember { mutableStateOf(LocalDate.now()) }
    var busy by remember { mutableStateOf(false) }
    val title = tr("room.jumpToDate.title")
    val close = tr("common.close")
    val description = tr("room.jumpToDate.description")
    val jumpLabel = tr("room.jumpToDate.jump")

    fun pick() {
        DatePickerDialog(context, { _, year, month, dayOfMonth ->
            day = LocalDate.of(year, month + 1, dayOfMonth)
        }, day.year, day.monthValue - 1, day.dayOfMonth).apply {
            // A jump needs a day that has happened; later days have no messages yet
            datePicker.maxDate = System.currentTimeMillis()
        }.show()
    }

    fun submit() {
        if (busy) return
        busy = true
        scope.launch {
            try {
                val eventId = JumpToDate.find(day) { at, direction -> client.timestampToEvent(roomId, at, direction) }
                if (eventId == null) {
                    CopyToast.show(L10n.format("room.jumpToDate.notFound"))
                } else {
                    onDismiss()
                    onJump(eventId)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: JumpToDate.JumpRefused) {
                CopyToast.show(L10n.format(e.noticeKey))
            } finally {
                busy = false
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetBar(title, trailing = { BarTextButton(close, onDismiss) })
        FormList {
            item {
                Text(
                    description,
                    Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space7, vertical = WZ.Space.space5),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                )
            }
            item {
                GroupedSection {
                    GroupedRow(
                        Formats.abbreviatedDate(day.atStartOfDay().atZone(java.time.ZoneId.systemDefault()).toInstant()),
                        icon = "calendar-blank",
                        onClick = if (busy) null else ::pick,
                    )
                }
            }
            item {
                GroupedSection {
                    ActionRow(jumpLabel, "arrow-right", ::submit, enabled = !busy)
                }
            }
        }
    }
}
