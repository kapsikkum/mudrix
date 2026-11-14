package org.wizardchat.android.ui.room

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.text.format.DateFormat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ScheduledMessage
import org.wizardchat.android.matrix.ScheduledMessages
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.people.ActionRow
import org.wizardchat.android.ui.people.FormList
import org.wizardchat.android.ui.people.SheetBar
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

private const val REFRESH_MS = 20_000L
private const val MSC4140 = "org.matrix.msc4140"

/**
 * "Send later": picks a time for the message in the composer, hands it to the homeserver (MSC4140) and lists what is
 * scheduled in this room with Send now and Cancel. Needs a homeserver with delayed events and an unencrypted room.
 */
@Composable
fun ScheduleSheet(
    client: WizardClient,
    roomId: String,
    roomEncrypted: Boolean,
    draftPreview: String,
    onSchedule: suspend (delayMs: Long) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var sendAt by remember { mutableStateOf(ScheduledMessages.inOneHour(System.currentTimeMillis())) }
    var supported by remember { mutableStateOf<Boolean?>(null) }
    var refused by remember { mutableStateOf(false) }
    var scheduled by remember { mutableStateOf<List<ScheduledMessage>?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val usable = supported == true && !refused && !roomEncrypted
    val hasDraft = draftPreview.isNotBlank()

    suspend fun refresh() {
        scheduled = try {
            ScheduledMessages.of(client.listDelayedEvents(roomId), roomId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (ScheduledMessages.failureOf(e) == ScheduledMessages.Failure.ServerUnsupported) refused = true
            scheduled ?: emptyList()
        }
    }

    LaunchedEffect(client) {
        supported = runCatching { MSC4140 in client.serverFeatures().unstableFeatures }.getOrDefault(false)
    }
    LaunchedEffect(usable) {
        if (!usable) return@LaunchedEffect
        while (true) {
            refresh()
            delay(REFRESH_MS)
        }
    }

    fun errorText(key: String, error: Exception): String {
        val notice = ScheduledMessages.noticeKey(ScheduledMessages.failureOf(error))
        return if (notice != null) L10n.format(notice) else L10n.format(key, error.message ?: "")
    }

    fun pick() {
        val now = Instant.ofEpochMilli(sendAt).atZone(ZoneId.systemDefault())
        DatePickerDialog(context, { _, year, month, day ->
            TimePickerDialog(context, { _, hour, minute ->
                sendAt = java.time.LocalDateTime.of(year, month + 1, day, hour, minute)
                    .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            }, now.hour, now.minute, DateFormat.is24HourFormat(context)).show()
        }, now.year, now.monthValue - 1, now.dayOfMonth).show()
    }

    val tooSoon = !ScheduledMessages.isSchedulable(sendAt, System.currentTimeMillis())
    // FormList takes a LazyListScope, not @Composable content, so every string is read here first
    val title = tr("composer.schedule.title")
    val close = tr("common.close")
    val unavailable = when {
        supported == false || refused -> tr("composer.schedule.unsupported")
        roomEncrypted -> tr("composer.schedule.encrypted")
        else -> null
    }
    val messageLabel = tr("composer.schedule.messageLabel")
    val noDraftNotice = tr("composer.schedule.noDraft")
    val whenLabel = tr("composer.schedule.whenLabel")
    val pastTime = tr("composer.schedule.pastTime")
    val inOneHour = tr("composer.schedule.inOneHour")
    val tomorrowMorning = tr("composer.schedule.tomorrowMorning")
    val submitLabel = tr("composer.schedule.submit")
    val listTitle = tr("composer.schedule.listTitle")
    val loading = tr("common.loading")
    val emptyList = tr("composer.schedule.empty")
    WizardSheet(onDismiss) {
        SheetBar(title, trailing = { BarTextButton(close, onDismiss) })
        FormList {
            if (unavailable != null) {
                item {
                    Text(
                        unavailable,
                        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space7, vertical = WZ.Space.space5),
                        style = wizardFont(WZ.FontSize.md),
                        color = theme.warningColor,
                    )
                }
            }
            item {
                GroupedSection(messageLabel, footer = if (hasDraft) null else noDraftNotice) {
                    Text(
                        if (hasDraft) draftPreview else "—",
                        Modifier.fillMaxWidth().padding(WZ.Space.space5),
                        style = wizardFont(WZ.FontSize.lg),
                        color = if (hasDraft) theme.textPrimary else theme.textMuted,
                        maxLines = 6,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            item {
                GroupedSection(
                    whenLabel,
                    footer = if (usable && tooSoon) pastTime else null,
                ) {
                    GroupedRow(
                        Formats.abbreviatedDateTime(Instant.ofEpochMilli(sendAt)),
                        icon = "alarm",
                        onClick = if (usable) ::pick else null,
                    )
                    RowDivider()
                    ActionRow(inOneHour, "hourglass", { sendAt = ScheduledMessages.inOneHour(System.currentTimeMillis()) }, enabled = usable)
                    RowDivider()
                    ActionRow(tomorrowMorning, "arrow-circle-right", { sendAt = ScheduledMessages.tomorrowMorning(System.currentTimeMillis()) }, enabled = usable)
                }
            }
            item {
                GroupedSection {
                    ActionRow(
                        submitLabel,
                        "paper-plane-right",
                        {
                            if (submitting) return@ActionRow
                            submitting = true
                            scope.launch {
                                try {
                                    onSchedule(ScheduledMessages.delayFor(sendAt, System.currentTimeMillis()))
                                    CopyToast.show(L10n.format("composer.schedule.scheduled"))
                                    refresh()
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    if (ScheduledMessages.failureOf(e) == ScheduledMessages.Failure.ServerUnsupported) refused = true
                                    CopyToast.show(errorText("composer.schedule.failed", e))
                                } finally {
                                    submitting = false
                                }
                            }
                        },
                        enabled = usable && hasDraft && !tooSoon && !submitting,
                    )
                }
            }
            if (usable) {
                item {
                    GroupedSection(listTitle) {
                        val list = scheduled
                        when {
                            list == null -> GroupedRow(loading)
                            list.isEmpty() -> GroupedRow(emptyList, titleColor = theme.textMuted)
                            else -> list.forEachIndexed { index, item ->
                                if (index > 0) RowDivider()
                                ScheduledRow(item, busy == item.delayId, onSendNow = {
                                    scope.launch {
                                        busy = item.delayId
                                        try {
                                            client.sendDelayedEventNow(item.delayId)
                                        } catch (e: CancellationException) {
                                            throw e
                                        } catch (e: Exception) {
                                            CopyToast.show(errorText("composer.schedule.sendNowFailed", e))
                                        } finally {
                                            busy = null
                                            refresh()
                                        }
                                    }
                                }, onCancel = {
                                    scope.launch {
                                        busy = item.delayId
                                        try {
                                            client.cancelDelayedEvent(item.delayId)
                                        } catch (e: CancellationException) {
                                            throw e
                                        } catch (e: Exception) {
                                            CopyToast.show(errorText("composer.schedule.cancelFailed", e))
                                        } finally {
                                            busy = null
                                            refresh()
                                        }
                                    }
                                })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduledRow(item: ScheduledMessage, busy: Boolean, onSendNow: () -> Unit, onCancel: () -> Unit) {
    GroupedRow(
        item.body.ifEmpty { "—" },
        subtitle = Formats.abbreviatedDateTime(Instant.ofEpochMilli(item.sendAt)),
    ) {
        if (busy) {
            Spinner(size = WZ.SizeIcon.md)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                BarTextButton(tr("composer.schedule.sendNow"), onSendNow)
                BarTextButton(tr("composer.schedule.cancel"), onCancel)
            }
        }
    }
}
