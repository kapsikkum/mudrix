package org.wizardchat.android.ui.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.Member
import org.wizardchat.tokens.WZ

private data class Permission(
    val titleKey: String,
    val icon: String,
    val key: String,
    val event: String? = null,
    val fallback: Long,
)

private val permissions = listOf(
    Permission("room.settings.permissions.rows.send_message", "chat-circle", "events_default", fallback = 0),
    Permission("room.invitePeople", "user-plus", "invite", fallback = 0),
    Permission("room.removePeople", "user-minus", "kick", fallback = 50),
    Permission("room.banPeople", "prohibit", "ban", fallback = 50),
    Permission("room.deleteOthersMessages", "trash", "redact", fallback = 50),
    Permission("room.changeName", "text-aa", "events", "m.room.name", 50),
    Permission("room.settings.permissions.rows.change_topic", "text-align-left", "events", "m.room.topic", 50),
    Permission("room.changePicture", "image", "events", "m.room.avatar", 50),
    Permission("room.settings.permissions.rows.other_state_events", "gear", "state_default", fallback = 50),
)

private fun value(permission: Permission, levels: JsonObject): Long {
    val raw = if (permission.event != null) (levels["events"] as? JsonObject)?.get(permission.event) else levels[permission.key]
    raw?.number?.let { return it.toLong() }
    if (permission.event != null) levels["state_default"]?.number?.let { return it.toLong() }
    return permission.fallback
}

/** Who has which role and which role may do what */
@Composable
internal fun RolesPermissionsScreen(roomId: String, onBack: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var levels by remember { mutableStateOf<JsonObject?>(null) }
    var staff by remember { mutableStateOf(listOf<Member>()) }
    var rights by remember { mutableStateOf(RoleRights(0, false)) }
    var selected by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        val client = session.client ?: return
        rights = RoleRights.load(client, roomId)
        levels = runCatching { client.stateEvent(roomId, "m.room.power_levels", "") }.getOrNull() as? JsonObject ?: JsonObject(emptyMap())
        val members = runCatching { client.members(roomId) }.getOrDefault(emptyList())
        staff = members.filter { !it.isInvite && it.level >= 50 }.sortedByDescending { it.level }
    }
    LaunchedEffect(roomId) { load() }

    fun apply(permission: Permission, level: Long) {
        val current = levels ?: return
        val client = session.client ?: return
        val updated = current.toMutableMap<String, JsonElement>()
        if (permission.event != null) {
            val events = (current["events"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
            events[permission.event] = JsonPrimitive(level)
            updated["events"] = JsonObject(events)
        } else {
            updated[permission.key] = JsonPrimitive(level)
        }
        scope.launch {
            try {
                client.setPowerLevels(roomId, JsonObject(updated))
                error = null
                load()
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    SheetPage {
        WizardTopBar(tr("room.settings.permissions.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            item {
                GroupedSection(header = tr("room.settings.permissions.groups.roles"), footer = tr("room.changeSomeoneSRole")) {
                    if (staff.isEmpty()) {
                        GroupedRow(tr("room.noAdminsOrModerators"), titleColor = theme.textMuted)
                    }
                    staff.forEachIndexed { index, member ->
                        if (index > 0) RowDivider()
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = WZ.Space.space11)
                                .clickable { selected = member.userId }
                                .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                        ) {
                            Avatar(member.name, member.avatarUrl, WZ.SizeAvatar.sm)
                            Text(
                                member.name,
                                Modifier.weight(1f),
                                style = wizardFont(WZ.FontSize.lg),
                                color = theme.textPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(roleName(member.level), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                        }
                    }
                }
            }
            levels?.let { current ->
                item {
                    GroupedSection(
                        header = tr("room.permissions"),
                        footer = if (!rights.canEditLevels) tr("room.onlyPeopleAllowedTo") else null,
                    ) {
                        permissions.forEachIndexed { index, permission ->
                            if (index > 0) RowDivider()
                            PermissionRow(permission, value(permission, current), rights.canEditLevels) { apply(permission, it) }
                        }
                    }
                }
            }
            item { ErrorText(error) }
        }
    }

    selected?.let { userId ->
        UserProfileSheet(userId, roomId, onDismiss = { selected = null }, onChanged = { scope.launch { load() } })
    }
}

@Composable
private fun PermissionRow(permission: Permission, current: Long, enabled: Boolean, onPick: (Long) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val closest = RoleLevel.closest(current)
    Box(Modifier.alpha(if (enabled) 1f else WZ.Opacity.disabled)) {
        GroupedRow(
            tr(permission.titleKey),
            icon = permission.icon,
            iconTint = theme.accent,
            onClick = if (enabled) ({ expanded = true }) else null,
        ) {
            Text(tr(closest.whoKey), style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
            PhIcon("caret-up-down", size = WZ.SizeIcon.sm, tint = theme.textMuted)
        }
        PickMenu(
            expanded,
            { expanded = false },
            RoleLevel.entries.map { level -> PickItem(tr(level.whoKey), checked = level == closest) { if (level != closest) onPick(level.value) } },
        )
    }
}
