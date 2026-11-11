package org.wizardchat.android.ui.people

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RoomAccess
import org.wizardchat.android.matrix.RoomAddresses
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.android.matrix.rtc.RoomSoundboards
import org.wizardchat.android.matrix.rtc.SoundboardEdit
import org.wizardchat.android.matrix.canSendState
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSettings
import org.wizardchat.tokens.WZ

private val HISTORY = listOf(
    "world_readable" to "room.settings.security.historyAnyone",
    "shared" to "room.settings.security.historyShared",
    "invited" to "room.settings.security.historyInvited",
    "joined" to "room.settings.security.historyMembersSinceJoin",
)

/**
 * The admin settings of a room or space: who may join, who may read the history, whether it is in
 * the room directory, its addresses, the room upgrade and reporting the room
 */
@Composable
internal fun RoomGeneralScreen(roomId: String, onBack: () -> Unit) {
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val closeParents = LocalCloseParents.current
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<RoomSettings?>(null) }
    var reloads by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var newAlias by remember { mutableStateOf("") }
    var confirmUpgrade by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    var reportReason by remember { mutableStateOf("") }
    var accessMenu by remember { mutableStateOf(false) }
    var historyMenu by remember { mutableStateOf(false) }

    LaunchedEffect(roomId, reloads) {
        settings = runCatching { session.requireClient.roomSettings(roomId) }.getOrNull() ?: settings
    }
    val room = settings
    val me = session.userId.orEmpty()
    val levels = room?.powerLevels as? JsonObject
    val creators = room?.creators.orEmpty().toSet()
    fun can(type: String) = room != null && SpaceModern.canSendState(levels, creators, me, type)
    val parents = session.roomList?.graph.orEmpty().filter { node -> node.children.any { it.roomId == roomId } }.map { it.spaceId }

    fun save(failed: String = "common.saveFailed", action: suspend () -> Unit) {
        scope.launch {
            busy = true
            try {
                action()
                error = null
                reloads++
            } catch (e: Exception) {
                error = L10n.format(failed, errorText(e))
            } finally {
                busy = false
            }
        }
    }

    fun upgrade() {
        val client = session.client ?: return
        val current = room ?: return
        scope.launch {
            busy = true
            try {
                val version = client.serverCapabilities().defaultRoomVersion
                val newRoom = client.upgradeRoom(roomId, version)
                // The new room starts empty: bring the people over (public rooms they find on their own) and re-link it to its spaces
                if (current.joinRule != "public") {
                    client.members(roomId).filter { !it.isInvite && it.userId != me }.forEach { runCatching { client.invite(newRoom, it.userId) } }
                }
                parents.forEach { runCatching { client.addToSpace(it, newRoom, false) } }
                closeParents()
                navigator.openRoom(newRoom)
            } catch (e: Exception) {
                error = L10n.format("room.upgrade.failed", errorText(e))
            } finally {
                busy = false
            }
        }
    }

    SheetPage {
        WizardTopBar(tr("room.settings.general.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            if (room == null) {
                item { Box(Modifier.fillMaxWidth().padding(WZ.Space.space9)) { Spinner() } }
                return@FormList
            }
            val access = RoomAccess.of(room.joinRule)
            val canJoinRules = can("m.room.join_rules")
            val canHistory = can("m.room.history_visibility")
            item {
                GroupedSection(header = tr("room.settings.security.title")) {
                    Box {
                        GroupedRow(
                            tr("room.settings.security.access"),
                            onClick = if (canJoinRules && !busy) ({ accessMenu = true }) else null,
                        ) {
                            Text(
                                tr(accessLabel(access, room.joinRule)),
                                style = wizardFont(WZ.FontSize.md),
                                color = theme.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            PhIcon("caret-up-down", size = WZ.SizeIcon.xs, tint = theme.textMuted)
                        }
                        PickMenu(
                            accessMenu,
                            { accessMenu = false },
                            RoomAccess.entries.filter { it != RoomAccess.SpaceMembers || parents.isNotEmpty() || access == it }.map { option ->
                                PickItem(tr(accessLabel(option, option.rule)), checked = option == access) {
                                    if (option != access) {
                                        save { session.requireClient.setJoinRule(roomId, option.rule, if (option == RoomAccess.SpaceMembers) parents.take(1) else emptyList()) }
                                    }
                                }
                            },
                        )
                    }
                    RowDivider()
                    Box {
                        GroupedRow(
                            tr("room.settings.security.messageHistory"),
                            subtitle = tr("room.settings.security.historyNote"),
                            onClick = if (canHistory && !busy) ({ historyMenu = true }) else null,
                        ) {
                            Text(
                                HISTORY.firstOrNull { it.first == room.historyVisibility }?.second?.let { tr(it) } ?: room.historyVisibility,
                                style = wizardFont(WZ.FontSize.md),
                                color = theme.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            PhIcon("caret-up-down", size = WZ.SizeIcon.xs, tint = theme.textMuted)
                        }
                        PickMenu(
                            historyMenu,
                            { historyMenu = false },
                            HISTORY.map { (value, key) ->
                                PickItem(tr(key), checked = value == room.historyVisibility) {
                                    if (value != room.historyVisibility) save { session.requireClient.setHistoryVisibility(roomId, value) }
                                }
                            },
                        )
                    }
                    RowDivider()
                    ToggleRow(
                        tr("mobile.publish.title"),
                        room.published,
                        { value -> if (!busy) save { session.requireClient.setPublished(roomId, value) } },
                        subtitle = tr("mobile.publish.note"),
                    )
                }
            }

            item {
                val canonical = room.canonicalAlias?.takeIf { it.isNotEmpty() }
                val others = RoomAddresses.others(canonical, room.altAliases, room.localAliases)
                val canEdit = can("m.room.canonical_alias")
                GroupedSection(header = tr("room.settings.addresses.title")) {
                    if (canonical == null && others.isEmpty()) {
                        Text(
                            tr("room.settings.addresses.noAddresses"),
                            Modifier.padding(WZ.Space.space5),
                            style = wizardFont(WZ.FontSize.md),
                            color = theme.textMuted,
                        )
                    }
                    if (canonical != null) {
                        GroupedRow(canonical) {
                            Text(
                                tr("room.settings.addresses.mainAddress"),
                                style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
                                color = theme.accent,
                            )
                        }
                    }
                    others.forEach { alias ->
                        if (canonical != null || alias != others.first()) RowDivider()
                        GroupedRow(alias) {
                            if (canEdit) {
                                Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1), verticalAlignment = Alignment.CenterVertically) {
                                    BarButton("check", tr("room.settings.addresses.mainAddress"), {
                                        val (main, alt) = RoomAddresses.afterSetMain(canonical, room.altAliases, alias)
                                        save { session.requireClient.setCanonicalAlias(roomId, main, alt) }
                                    }, size = WZ.SizeIcon.md)
                                    BarButton("minus-circle", tr("common.remove"), {
                                        save {
                                            val client = session.requireClient
                                            client.removeRoomAlias(alias)
                                            if (alias == canonical || alias in room.altAliases) {
                                                val (main, alt) = RoomAddresses.afterRemove(canonical, room.altAliases, alias)
                                                client.setCanonicalAlias(roomId, main, alt)
                                            }
                                        }
                                    }, tint = theme.danger, size = WZ.SizeIcon.md)
                                }
                            }
                        }
                    }
                    if (canEdit) {
                        if (canonical != null || others.isNotEmpty()) RowDivider()
                        FormField(newAlias, { newAlias = it }, tr("room.settings.addresses.addressPlaceholder"), plain = true, onSubmit = null)
                        RowDivider()
                        ActionRow(tr("room.settings.addresses.addAddress"), "plus-circle", {
                            val alias = newAlias.trim()
                            if (!RoomAddresses.isValid(alias)) {
                                error = tr0("room.settings.addresses.invalidFormat")
                                return@ActionRow
                            }
                            scope.launch {
                                busy = true
                                try {
                                    val client = session.requireClient
                                    client.addRoomAlias(roomId, alias)
                                    if (alias != canonical && alias !in room.altAliases) {
                                        client.setCanonicalAlias(roomId, canonical, RoomAddresses.altAfterAdd(canonical, room.altAliases, alias))
                                    }
                                    newAlias = ""
                                    error = null
                                    reloads++
                                } catch (e: Exception) {
                                    error = if (errorText(e).contains("already in use", ignoreCase = true)) {
                                        L10n.format("room.settings.addresses.aliasInUse")
                                    } else {
                                        L10n.format("room.settings.addresses.invalidFormat")
                                    }
                                } finally {
                                    busy = false
                                }
                            }
                        }, enabled = !busy && newAlias.isNotBlank())
                    }
                }
            }

            if (session.roomList?.room(roomId) != null) {
                item { RoomSpacesSection(roomId, parents, busy) { reloads++ } }
            }
            item { SoundboardSettingsSection(roomId, can(RoomSoundboards.SETTINGS_TYPE)) }

            if (can("m.room.tombstone")) {
                item {
                    GroupedSection(header = tr("room.upgrade.title"), footer = tr("room.upgrade.currentVersion", room.roomVersion)) {
                        ActionRow(tr("room.upgrade.title"), "arrow-circle-up", { confirmUpgrade = true }, enabled = !busy)
                    }
                }
            }

            item {
                GroupedSection {
                    ActionRow(tr("mobile.reportRoom.button"), "flag", { reporting = true }, theme.danger, enabled = !busy)
                }
            }
            item { ErrorText(error) }
        }
    }

    if (confirmUpgrade) {
        ConfirmDialog(
            title = tr("room.upgrade.title"),
            confirmLabel = tr("room.upgrade.title"),
            message = tr("room.upgrade.confirm"),
            onConfirm = ::upgrade,
            onDismiss = { confirmUpgrade = false },
        )
    }
    if (reporting) {
        TextFieldDialog(
            tr("mobile.reportRoom.title"),
            reportReason,
            { reportReason = it },
            tr("common.reasonOptional"),
            tr("mobile.reportRoom.button"),
            onConfirm = {
                val reason = reportReason
                reportReason = ""
                scope.launch {
                    try {
                        session.requireClient.reportRoom(roomId, reason)
                        CopyToast.show(L10n.format("mobile.reportRoom.sent"))
                    } catch (e: Exception) {
                        CopyToast.show(L10n.format("mobile.reportRoom.failed", errorText(e)))
                    }
                }
            },
            onDismiss = { reporting = false },
            destructive = true,
        )
    }
}

/** The spaces a room is in: take it out of one, or put it into another space the person can manage */
@Composable
private fun RoomSpacesSection(roomId: String, parents: List<String>, busy: Boolean, onChanged: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val roomList = session.roomList ?: return
    var manageable by remember { mutableStateOf(emptySet<String>()) }
    var menu by remember { mutableStateOf(false) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val spaceIds = roomList.spaces.map { it.id }
    LaunchedEffect(spaceIds) {
        manageable = spaceIds.filter { session.canSendState("m.space.child", it) }.toSet()
    }
    val addable = roomList.spaces.filter { it.id != roomId && it.id !in parents && it.id in manageable }

    fun change(failed: String, work: suspend () -> Unit) {
        scope.launch {
            working = true
            try {
                work()
                error = null
                roomList.refreshGraph()
                onChanged()
            } catch (e: Exception) {
                error = L10n.format(failed, errorText(e))
            } finally {
                working = false
            }
        }
    }

    GroupedSection(header = tr("room.settings.spaces.title"), footer = if (parents.isEmpty()) tr("room.settings.spaces.none") else null) {
        parents.forEachIndexed { index, spaceId ->
            if (index > 0) RowDivider()
            GroupedRow(roomList.space(spaceId)?.name ?: spaceId, icon = "stack", iconTint = theme.accent) {
                if (spaceId in manageable) {
                    BarButton("x", tr("space.removeRoom"), { change("space.removeFailed") { session.requireClient.removeFromSpace(spaceId, roomId) } })
                }
            }
        }
        if (addable.isNotEmpty()) {
            if (parents.isNotEmpty()) RowDivider()
            Box {
                ActionRow(tr("room.settings.spaces.addLabel"), "plus", { menu = true }, enabled = !busy && !working)
                PickMenu(
                    menu,
                    { menu = false },
                    addable.map { space ->
                        PickItem(space.name) {
                            menu = false
                            change("space.addExistingRoomFailed") { session.requireClient.addToSpace(space.id, roomId, false) }
                        }
                    },
                )
            }
        }
    }
    ErrorText(error)
}

/** The soundboard of a room or space: on or off (for every room in a space), and who may play clips */
@Composable
private fun SoundboardSettingsSection(roomId: String, canManage: Boolean) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var enabled by remember(roomId) { mutableStateOf(true) }
    var level by remember(roomId) { mutableStateOf(0.0) }
    var menu by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(roomId) {
        val client = session.client ?: return@LaunchedEffect
        RoomSoundboards.load(client, roomId, force = true).settings?.let {
            enabled = it.enabled
            level = it.minPowerLevel
        }
    }

    fun save(newEnabled: Boolean, newLevel: Double) {
        val client = session.client ?: return
        val before = enabled to level
        enabled = newEnabled
        level = newLevel
        scope.launch {
            try {
                SoundboardEdit.writeRoomSettings(client, roomId, newEnabled, newLevel)
                error = null
            } catch (e: Exception) {
                enabled = before.first
                level = before.second
                error = L10n.format("common.saveFailed", errorText(e))
            }
        }
    }

    GroupedSection(header = tr("soundboard.room.title")) {
        ToggleRow(tr("soundboard.room.enabled"), enabled, { if (canManage) save(it, level) }, subtitle = tr("soundboard.room.enabledNote"))
        RowDivider()
        Box {
            GroupedRow(
                tr("soundboard.room.whoCanPlay"),
                subtitle = tr("soundboard.room.whoCanPlayNote"),
                onClick = if (canManage && enabled) ({ menu = true }) else null,
            ) {
                Text(
                    tr(if (level >= SoundboardEdit.MODERATOR_LEVEL) "soundboard.room.moderators" else "soundboard.room.everyone"),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                )
                PhIcon("caret-up-down", size = WZ.SizeIcon.xs, tint = theme.textMuted)
            }
            PickMenu(
                menu,
                { menu = false },
                listOf(
                    PickItem(tr("soundboard.room.everyone"), checked = level < SoundboardEdit.MODERATOR_LEVEL) { save(enabled, 0.0) },
                    PickItem(tr("soundboard.room.moderators"), checked = level >= SoundboardEdit.MODERATOR_LEVEL) { save(enabled, SoundboardEdit.MODERATOR_LEVEL) },
                ),
            )
        }
    }
    ErrorText(error)
}

private fun tr0(key: String) = L10n.format(key)

private fun accessLabel(option: RoomAccess, rule: String): String = when (option) {
    RoomAccess.Invite -> "room.settings.security.accessInvite"
    RoomAccess.SpaceMembers -> "room.settings.security.accessSpaceMembers"
    RoomAccess.Knock -> if (rule == "knock_restricted") "room.settings.auditLog.rule.knock_restricted" else "room.settings.security.accessKnock"
    RoomAccess.Public -> "room.settings.security.accessPublic"
}

