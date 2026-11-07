package org.wizardchat.android.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.Reminders
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.tr

/** Pending "Remind me" reminders, cancellable; Settings > Notifications */
@Composable
internal fun RemindersSection() {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val reminders = Reminders.shared.items
    SettingsSection(tr("settings.notifications.reminders.title")) {
        if (reminders.isEmpty()) {
            SettingsItem { StatusText(tr("settings.notifications.reminders.empty"), isError = false) }
        }
        reminders.forEachIndexed { index, reminder ->
            if (index > 0) SettingsDivider()
            val room = session.roomList?.room(reminder.roomId)?.displayName ?: reminder.roomId
            val at = Date(reminder.at)
            val time = DateFormat.getTimeInstance(DateFormat.SHORT).format(at)
            val label = if (java.time.LocalDate.now() == java.time.Instant.ofEpochMilli(reminder.at).atZone(java.time.ZoneId.systemDefault()).toLocalDate()) {
                time
            } else {
                DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(at)
            }
            SettingRow(tr("settings.notifications.reminders.entry", room, label)) {
                IconAction("x", tr("settings.notifications.reminders.cancel")) {
                    val client = session.client ?: return@IconAction
                    scope.launch { runCatching { Reminders.shared.remove(client, reminder.id) } }
                }
            }
        }
    }
}
