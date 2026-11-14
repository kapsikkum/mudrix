package org.wizardchat.android.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.AuditEntry
import org.wizardchat.android.matrix.AuditLog
import org.wizardchat.android.matrix.MudrixRoomStates
import org.wizardchat.android.matrix.MudrixTypes
import org.wizardchat.android.matrix.RoomListStyle
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.android.matrix.TimelineModel
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.room.Formats
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/** What the Modern room list adds to a space's settings: style, auto-join and a banner, set by whoever can change the space's state */
@Composable
internal fun SpaceModernSection(spaceId: String, canManage: Boolean) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val stores = MudrixRoomStates.shared
    LaunchedEffect(spaceId, session.client) { stores.ensure(spaceId, force = true) }
    val state = stores.state(spaceId)
    val style = SpaceModern.styleOf(state)
    val autoJoin = SpaceModern.explicitAutoJoinOf(state) ?: (style == RoomListStyle.modern)
    val banner = SpaceModern.bannerOf(state)
    var error by remember { mutableStateOf<String?>(null) }

    fun write(type: String, content: kotlinx.serialization.json.JsonObject) {
        val client = session.client ?: return
        scope.launch {
            try {
                stores.set(client, spaceId, type, content)
                error = null
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    GroupedSection(header = tr("settings.appearance.roomListStyle"), footer = tr("settings.appearance.roomListStyleNote")) {
        listOf(
            RoomListStyle.matrix to tr("settings.appearance.roomListStyleMatrix"),
            RoomListStyle.modern to tr("settings.appearance.roomListStyleModern"),
        ).forEachIndexed { index, (option, label) ->
            if (index > 0) RowDivider()
            GroupedRow(label, onClick = if (canManage) ({ write(MudrixTypes.SPACE_LIST_STYLE, buildJsonObject { put("style", option.name) }) }) else null) {
                if (style == option) PhIcon("check", size = WZ.SizeIcon.md, tint = theme.accent)
            }
        }
        if (style == RoomListStyle.modern) {
            RowDivider()
            ToggleRow(tr("room.settings.general.autoJoin"), autoJoin, { on ->
                if (canManage) write(MudrixTypes.SPACE_AUTO_JOIN, buildJsonObject { put("enabled", on) })
            })
        }
    }
    if (style == RoomListStyle.modern) {
        GroupedSection(header = tr("room.space.banner.title")) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                SpaceModern.BANNER_PRESETS.forEach { (id, start, end) ->
                    Box(
                        Modifier
                            .size(WZ.Space.space9)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(listOf(Color(start.toInt()), Color(end.toInt()))))
                            .border(if (banner?.color == id) WZ.BorderWidth.thick else WZ.BorderWidth.thin, if (banner?.color == id) theme.accent else theme.border, CircleShape)
                            .clickable(enabled = canManage) { write(MudrixTypes.SPACE_BANNER, buildJsonObject { put("color", id) }) },
                    )
                }
            }
            if (banner != null && canManage) {
                RowDivider()
                ActionRow(tr("room.space.banner.remove"), "trash", { write(MudrixTypes.SPACE_BANNER, buildJsonObject { }) }, theme.danger)
            }
        }
    }
    ErrorText(error)
}

/**
 * The audit log of a room or space (`R4`): who joined, left, was invited, removed or banned, what was renamed, its topic,
 * picture and permissions, and for a space its rooms and roles, newest first (as the web's audit log shows them).
 */
@Composable
internal fun AuditLogScreen(roomId: String, onBack: () -> Unit) {
    val session = LocalSession.current
    val client: WizardClient? = session.client
    val timeline = remember(roomId, client) { client?.let { TimelineModel(it, roomId) } }
    androidx.compose.runtime.DisposableEffect(timeline) { onDispose { timeline?.close() } }
    LaunchedEffect(timeline) {
        val model = timeline ?: return@LaunchedEffect
        model.start()
        // Page back until there is enough to show or the room starts
        var pages = 0
        while (!model.reachedStart && model.auditChanges.size < 30 && pages < 8) {
            model.paginateBackwards()
            kotlinx.coroutines.delay(150)
            pages++
        }
    }
    var roleEvents by remember(roomId) { mutableStateOf(listOf<org.wizardchat.core.StateEventView>()) }
    LaunchedEffect(roomId, client) {
        val c = client ?: return@LaunchedEffect
        val types = MudrixTypes.typeAndLegacy(MudrixTypes.SPACE_ROLES) + MudrixTypes.typeAndLegacy(MudrixTypes.SPACE_MEMBER_ROLES)
        roleEvents = runCatching { c.stateEventsWithSender(roomId, types) }.getOrNull().orEmpty()
    }
    val changes = timeline?.auditChanges.orEmpty()
    val entries = remember(changes, roleEvents, session.roomList?.joinedRooms, session.roomList?.spaces) {
        fun roomName(id: String) = session.roomList?.room(id)?.displayName ?: session.roomList?.space(id)?.name ?: id
        (AuditLog.entries(changes) { id -> roomName(id) } + AuditLog.roleEntries(roleEvents)).sortedByDescending { it.ts }
    }
    var loadingMore by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    SheetPage {
        WizardTopBar(tr("room.settings.auditLog.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            item {
                Text(
                    tr("room.settings.auditLog.note"),
                    Modifier.padding(horizontal = WZ.Space.space7, vertical = WZ.Space.space4),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                )
            }
            if (entries.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(WZ.Space.space8), contentAlignment = Alignment.Center) {
                        if (timeline?.reachedStart == true) {
                            Text(tr("room.settings.auditLog.empty"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                        } else {
                            Spinner()
                        }
                    }
                }
            }
            items(entries, key = { it.id }) { entry ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space7, vertical = WZ.Space.space3),
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                    verticalAlignment = Alignment.Top,
                ) {
                    PhIcon(
                        when (entry.category) {
                            AuditEntry.Category.members -> "user"
                            AuditEntry.Category.permissions -> "shield"
                            AuditEntry.Category.settings -> "gear"
                            AuditEntry.Category.rooms -> "hash-straight"
                            AuditEntry.Category.roles -> "users"
                        },
                        size = WZ.SizeIcon.sm,
                        tint = theme.textMuted,
                    )
                    Text(
                        androidx.compose.ui.text.buildAnnotatedString {
                            withStyle(
                                androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.SemiBold, color = theme.textPrimary),
                            ) { append(entry.actor) }
                            append(" ")
                            append(auditText(entry))
                        },
                        Modifier.weight(1f),
                        style = wizardFont(WZ.FontSize.md),
                        color = theme.textMuted,
                    )
                    Text(Formats.abbreviatedDateTime(java.time.Instant.ofEpochMilli(entry.ts)), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                }
            }
            item {
                if (timeline != null && !timeline.reachedStart) {
                    ActionRow(tr("room.settings.auditLog.loadOlder"), "arrow-up", {
                        if (loadingMore) return@ActionRow
                        scope.launch {
                            loadingMore = true
                            repeat(3) { timeline.paginateBackwards() }
                            loadingMore = false
                        }
                    }, enabled = !loadingMore)
                } else if (entries.isNotEmpty()) {
                    Text(
                        tr("room.settings.auditLog.start"),
                        Modifier.fillMaxWidth().padding(WZ.Space.space6),
                        style = wizardFont(WZ.FontSize.sm),
                        color = theme.textMuted,
                    )
                }
            }
        }
    }
}

/** One audit line's action text, with the values the action's line names */
private fun auditText(entry: AuditEntry): String {
    val values = entry.values
    fun level(value: String): String {
        val number = value.toDoubleOrNull() ?: return value
        val key = AuditLog.levelKey(number) ?: return value
        return "${L10n.format("room.members.$key")} ($value)"
    }
    fun rule(value: String): String {
        val key = "room.settings.auditLog.rule.$value"
        return if (L10n.has(key)) L10n.format(key) else value
    }
    val args = when (entry.action) {
        "powerChanged" -> arrayOf(values["target"].orEmpty(), level(values["from"].orEmpty()), level(values["to"].orEmpty()))
        "invited", "kicked", "banned", "unbanned", "knockDenied", "inviteRevoked", "memberRolesChanged" ->
            arrayOf(values["target"].orEmpty())
        "renamed" -> arrayOf(values["name"].orEmpty())
        "joinRulesChanged" -> arrayOf(rule(values["rule"].orEmpty()))
        "roomAdded", "roomRemoved" -> arrayOf(values["room"].orEmpty())
        else -> emptyArray()
    }
    return L10n.format("room.settings.auditLog.action.${entry.action}", *args)
}

