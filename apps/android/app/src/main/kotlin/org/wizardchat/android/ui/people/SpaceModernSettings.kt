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
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MudrixRoomStates
import org.wizardchat.android.matrix.MudrixTypes
import org.wizardchat.android.matrix.RoomListStyle
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.android.matrix.TimelineModel
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
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
 * The audit log of a room or space (`R4`): who joined, left, was invited, removed or banned, newest first. The core's
 * timeline carries membership changes only; changes to the name, topic, permissions or rooms of a space are not in it yet
 * (the core call wanted for that is listed under "Core calls wanted by P2-8").
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
        while (!model.reachedStart && model.entries.count { it.kind is ChatEntry.Kind.System } < 30 && pages < 8) {
            model.paginateBackwards()
            kotlinx.coroutines.delay(150)
            pages++
        }
    }
    val changes = remember(timeline?.entries) { timeline?.entries?.filter { it.kind is ChatEntry.Kind.System }?.asReversed().orEmpty() }
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
            if (changes.isEmpty()) {
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
            items(changes, key = { it.id }) { entry ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space7, vertical = WZ.Space.space3),
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                ) {
                    Text((entry.kind as ChatEntry.Kind.System).text, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
                    Text(Formats.abbreviatedDateTime(entry.timestamp), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
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
                } else if (changes.isNotEmpty()) {
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
