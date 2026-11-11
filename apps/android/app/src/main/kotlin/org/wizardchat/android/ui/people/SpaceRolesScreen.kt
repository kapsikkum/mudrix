package org.wizardchat.android.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import java.security.SecureRandom
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MudrixRoomStates
import org.wizardchat.android.matrix.MudrixTypes
import org.wizardchat.android.matrix.RoomListStyle
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.space.LocalSpaceGraph
import org.wizardchat.android.ui.space.parseHexColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/** The roles a space defines and whether the signed-in person may change them, from the space's own state and power levels */
internal class RoleManagement(val roles: SpaceModern.Roles, val canManage: Boolean, val modern: Boolean) {
    companion object {
        val NONE = RoleManagement(SpaceModern.NO_ROLES, canManage = false, modern = false)
    }
}

/** Roles of [spaceId] itself (what the Roles tab edits); `NONE` for a room or a space that is not Modern */
@Composable
internal fun rememberRoleManagement(spaceId: String): RoleManagement {
    val session = LocalSession.current
    val graph = LocalSpaceGraph.current
    val stores = MudrixRoomStates.shared
    val isSpace = remember(graph, spaceId) { graph.any { it.spaceId == spaceId } }
    val root = remember(graph, spaceId) { SpaceModern.rootSpaceOf(graph, spaceId) }
    LaunchedEffect(spaceId, root, isSpace) {
        if (!isSpace) return@LaunchedEffect
        stores.ensure(root)
        stores.ensure(spaceId)
    }
    var levels by remember(spaceId) { mutableStateOf<Pair<JsonObject?, Set<String>>?>(null) }
    LaunchedEffect(spaceId, session.client, isSpace) {
        if (!isSpace) return@LaunchedEffect
        val settings = runCatching { session.client?.localRoomSettings(spaceId) }.getOrNull() ?: return@LaunchedEffect
        levels = (settings.powerLevels as? JsonObject) to settings.creators.toSet()
    }
    val states = stores.states
    val me = session.userId
    return remember(states, levels, isSpace, root, me) {
        val state = states[spaceId]
        val (powerLevels, creators) = levels ?: return@remember RoleManagement.NONE
        if (!isSpace || state == null) return@remember RoleManagement.NONE
        val modern = SpaceModern.styleOf(states[root]) == RoomListStyle.modern
        val canManage = me != null && SpaceModern.trusted(powerLevels, MudrixTypes.SPACE_ROLES) &&
            SpaceModern.trusted(powerLevels, MudrixTypes.SPACE_MEMBER_ROLES) &&
            SpaceModern.canSendState(powerLevels, creators, me, MudrixTypes.SPACE_ROLES) &&
            SpaceModern.canSendState(powerLevels, creators, me, MudrixTypes.SPACE_MEMBER_ROLES)
        RoleManagement(SpaceModern.readRoles(state, powerLevels), canManage, modern)
    }
}

private fun roleJson(role: SpaceModern.Role) = buildJsonObject {
    put("id", role.id)
    put("name", role.name)
    role.color?.let { put("color", it) }
    if (role.hoist) put("hoist", true)
}

private fun rolesContent(roles: List<SpaceModern.Role>, builtin: Map<SpaceModern.Builtin, SpaceModern.BuiltinLook>) = buildJsonObject {
    put("roles", JsonArray(roles.take(SpaceModern.MAX_ROLES).map(::roleJson)))
    put(
        "builtin",
        buildJsonObject {
            for ((key, look) in builtin) {
                if (look.name == null && look.color == null) continue
                put(
                    key.key,
                    buildJsonObject {
                        look.name?.let { put("name", it) }
                        look.color?.let { put("color", it) }
                    },
                )
            }
        },
    )
}

private suspend fun saveRoles(client: WizardClient, spaceId: String, roles: List<SpaceModern.Role>, builtin: Map<SpaceModern.Builtin, SpaceModern.BuiltinLook>) {
    MudrixRoomStates.shared.set(client, spaceId, MudrixTypes.SPACE_ROLES, rolesContent(roles, builtin))
}

internal suspend fun saveMemberRoles(client: WizardClient, spaceId: String, userId: String, roleIds: List<String>) {
    val content = buildJsonObject {
        put("roles", JsonArray(roleIds.take(SpaceModern.MAX_ROLES_PER_MEMBER).map { JsonPrimitive(it) }))
    }
    MudrixRoomStates.shared.set(client, spaceId, MudrixTypes.SPACE_MEMBER_ROLES, content, SpaceModern.memberStateKey(userId))
}

private fun newRoleId(): String {
    val chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    val random = SecureRandom()
    return buildString { repeat(12) { append(chars[random.nextInt(chars.length)]) } }
}

private sealed interface RoleEdit {
    data class Built(val key: SpaceModern.Builtin) : RoleEdit
    data class Own(val role: SpaceModern.Role, val isNew: Boolean) : RoleEdit
}

/** The Roles tab of a Modern space: rename and colour the built-in roles, make your own, order and delete them */
@Composable
internal fun SpaceRolesScreen(spaceId: String, onBack: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(spaceId) { MudrixRoomStates.shared.ensure(spaceId, force = true) }
    val management = rememberRoleManagement(spaceId)
    val roles = management.roles
    var editing by remember { mutableStateOf<RoleEdit?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun save(next: List<SpaceModern.Role>, builtin: Map<SpaceModern.Builtin, SpaceModern.BuiltinLook> = roles.builtin) {
        val client = session.client ?: return
        scope.launch {
            try {
                saveRoles(client, spaceId, next, builtin)
                CopyToast.show(L10n.format("room.settings.roles.saved"))
                error = null
            } catch (e: Exception) {
                error = L10n.format("room.settings.roles.saveFailed", errorText(e))
            }
        }
    }

    fun delete(role: SpaceModern.Role) {
        val client = session.client ?: return
        scope.launch {
            try {
                saveRoles(client, spaceId, roles.roles.filter { it.id != role.id }, roles.builtin)
                // The role is gone first: a leftover assignment names nothing and is ignored, so a failure here is only untidy
                val holders = roles.byUser.filter { (_, held) -> held.any { it.id == role.id } }
                var failed = 0
                var first: Throwable? = null
                for ((userId, held) in holders) {
                    try {
                        saveMemberRoles(client, spaceId, userId, held.filter { it.id != role.id }.map { it.id })
                    } catch (e: Exception) {
                        failed++
                        first = first ?: e
                    }
                }
                if (failed > 0) error = L10n.format("room.settings.roles.deletePartial", failed, holders.size, first?.let(::errorText) ?: "")
            } catch (e: Exception) {
                error = L10n.format("room.settings.roles.saveFailed", errorText(e))
            }
        }
    }

    SheetPage {
        WizardTopBar(tr("room.settings.roles.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            item {
                Text(
                    tr(if (management.canManage) "room.settings.roles.note" else "room.settings.roles.readOnly"),
                    Modifier.padding(horizontal = WZ.Space.space7, vertical = WZ.Space.space4),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                )
            }
            item {
                GroupedSection {
                    SpaceModern.Builtin.entries.forEachIndexed { index, key ->
                        if (index > 0) RowDivider()
                        val look = roles.builtin[key]
                        RoleRow(look?.name ?: builtinName(key), look?.color, enabled = management.canManage) { editing = RoleEdit.Built(key) }
                    }
                }
            }
            item {
                GroupedSection {
                    roles.roles.forEachIndexed { index, role ->
                        if (index > 0) RowDivider()
                        val count = roles.byUser.count { (_, held) -> held.any { it.id == role.id } }
                        RoleRow(role.name, role.color, enabled = management.canManage, subtitle = trPlural("room.settings.roles.memberCount", count, count)) {
                            editing = RoleEdit.Own(role, isNew = false)
                        }
                    }
                    if (management.canManage && roles.roles.size < SpaceModern.MAX_ROLES) {
                        if (roles.roles.isNotEmpty()) RowDivider()
                        ActionRow(tr("room.settings.roles.add"), "plus", {
                            editing = RoleEdit.Own(SpaceModern.Role(newRoleId(), L10n.format("room.settings.roles.newRole")), isNew = true)
                        })
                    }
                }
            }
            item { ErrorText(error) }
        }
    }

    when (val edit = editing) {
        null -> {}
        is RoleEdit.Built -> {
            val look = roles.builtin[edit.key]
            RoleDialog(
                title = look?.name ?: builtinName(edit.key),
                initialName = look?.name ?: "",
                initialColor = look?.color ?: "",
                namePlaceholder = builtinName(edit.key),
                hoist = null,
                canMoveUp = false,
                canMoveDown = false,
                canReset = look != null,
                onDismiss = { editing = null },
                onSave = { name, color, _ ->
                    val cleaned = SpaceModern.cleanRoleName(name).ifEmpty { null }
                    val builtin = roles.builtin + (edit.key to SpaceModern.BuiltinLook(cleaned, color))
                    save(roles.roles, builtin)
                },
                onMove = {},
                onDelete = null,
                onReset = { save(roles.roles, roles.builtin - edit.key) },
            )
        }
        is RoleEdit.Own -> {
            val index = roles.roles.indexOfFirst { it.id == edit.role.id }
            RoleDialog(
                title = edit.role.name,
                initialName = edit.role.name,
                initialColor = edit.role.color ?: "",
                namePlaceholder = tr("room.settings.roles.name"),
                hoist = edit.role.hoist,
                canMoveUp = !edit.isNew && index > 0,
                canMoveDown = !edit.isNew && index in 0 until roles.roles.lastIndex,
                canReset = false,
                onDismiss = { editing = null },
                onSave = { name, color, hoist ->
                    val cleaned = SpaceModern.cleanRoleName(name)
                    if (cleaned.isNotEmpty()) {
                        val updated = edit.role.copy(name = cleaned, color = color, hoist = hoist == true)
                        save(if (edit.isNew) roles.roles + updated else roles.roles.map { if (it.id == updated.id) updated else it })
                    }
                },
                onMove = { delta ->
                    val next = roles.roles.toMutableList()
                    java.util.Collections.swap(next, index, index + delta)
                    save(next)
                },
                onDelete = if (edit.isNew) null else ({ delete(edit.role) }),
                onReset = {},
            )
        }
    }
}

@Composable
private fun builtinName(key: SpaceModern.Builtin): String = when (key) {
    SpaceModern.Builtin.Founder -> tr("room.members.founder")
    SpaceModern.Builtin.Admin -> tr("room.members.admins")
    SpaceModern.Builtin.Moderator -> tr("room.members.moderators")
    SpaceModern.Builtin.Member -> tr("common.members")
}

@Composable
private fun RoleRow(name: String, color: String?, enabled: Boolean, subtitle: String? = null, onClick: () -> Unit) {
    GroupedRow(name, subtitle = subtitle, onClick = if (enabled) onClick else null) {
        Box(
            Modifier
                .size(WZ.Space.space7)
                .clip(CircleShape)
                .background(parseHexColor(color) ?: theme.fill),
        )
    }
}

/** Name, colour (`#rrggbb`, empty for the default) and, for your own roles, "show separately", order and delete */
@Composable
private fun RoleDialog(
    title: String,
    initialName: String,
    initialColor: String,
    namePlaceholder: String,
    hoist: Boolean?,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    canReset: Boolean,
    onDismiss: () -> Unit,
    onSave: (name: String, color: String?, hoist: Boolean?) -> Unit,
    onMove: (Int) -> Unit,
    onDelete: (() -> Unit)?,
    onReset: () -> Unit,
) {
    var name by remember { mutableStateOf(initialName) }
    var color by remember { mutableStateOf(initialColor) }
    var separate by remember { mutableStateOf(hoist == true) }
    val validColor = color.isEmpty() || SpaceModern.isValidRoleColor(color)
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                Box(Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(WZ.Radius.md)).background(theme.fill)) {
                    FormField(name, { name = it }, namePlaceholder, plain = true)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    Box(Modifier.size(WZ.Space.space9).clip(CircleShape).background(parseHexColor(color) ?: theme.fill))
                    Box(Modifier.weight(1f).clip(androidx.compose.foundation.shape.RoundedCornerShape(WZ.Radius.md)).background(theme.fill)) {
                        FormField(color, { color = it.trim() }, "#rrggbb", plain = true)
                    }
                }
                if (!validColor) Text(tr("room.settings.roles.color"), style = wizardFont(WZ.FontSize.sm), color = theme.danger)
                if (hoist != null) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = WZ.Space.space11).clickable { separate = !separate },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(tr("room.settings.roles.separate"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                        WizardSwitch(separate) { separate = it }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                    if (canMoveUp) TextButton({ onMove(-1); onDismiss() }) { Text(tr("room.settings.roles.moveUp"), color = theme.accent) }
                    if (canMoveDown) TextButton({ onMove(1); onDismiss() }) { Text(tr("room.settings.roles.moveDown"), color = theme.accent) }
                }
                if (canReset) TextButton({ onReset(); onDismiss() }) { Text(tr("room.settings.roles.reset"), color = theme.accent) }
                if (onDelete != null) TextButton({ onDelete(); onDismiss() }) { Text(tr("room.settings.roles.delete"), color = theme.danger) }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onDismiss()
                    onSave(name, color.takeIf { it.isNotEmpty() }?.lowercase(), if (hoist == null) null else separate)
                },
                enabled = validColor,
            ) {
                Text(tr("common.save"), color = theme.accent, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(tr("common.cancel"), color = theme.accent, style = wizardFont(WZ.FontSize.lg)) }
        },
    )
}

/** Hand roles out to one person: a checkbox per role of the space */
@Composable
internal fun AssignRolesDialog(spaceId: String, userId: String, name: String, management: RoleManagement, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var held by remember { mutableStateOf(management.roles.byUser[userId].orEmpty().map { it.id }.toSet()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(name, style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
        text = {
            Column {
                management.roles.roles.forEach { role ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = WZ.Space.space11).clickable { held = if (role.id in held) held - role.id else held + role.id },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                    ) {
                        Box(Modifier.size(WZ.Space.space7).clip(CircleShape).background(parseHexColor(role.color) ?: theme.fill))
                        Text(role.name, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                        WizardSwitch(role.id in held) { on -> held = if (on) held + role.id else held - role.id }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                val client = session.client ?: return@TextButton
                // In the order of the space's roles
                val ids = management.roles.roles.map { it.id }.filter { it in held }
                scope.launch {
                    runCatching { saveMemberRoles(client, spaceId, userId, ids) }
                        .onFailure { CopyToast.show(L10n.format("room.settings.roles.saveFailed", errorText(it))) }
                }
            }) { Text(tr("common.save"), color = theme.accent, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(tr("common.cancel"), color = theme.accent, style = wizardFont(WZ.FontSize.lg)) }
        },
    )
}
