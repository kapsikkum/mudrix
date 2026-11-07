package org.wizardchat.android.ui.people

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.android.matrix.canSendState
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.SpaceNode
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/**
 * Writes the `order` the children of [spaceId] need to read as [orderedIds]: a four digit number per place, and only where a
 * child's own order differs (so a list that is already right writes nothing).
 */
internal suspend fun saveChildOrder(client: WizardClient, node: SpaceNode?, spaceId: String, orderedIds: List<String>) {
    val current = node?.children?.associate { it.roomId to it.order }.orEmpty()
    orderedIds.forEachIndexed { index, childId ->
        val order = "%04d".format((index + 1) * 10)
        if (current[childId] == order) return@forEachIndexed
        val content = client.stateEvent(spaceId, "m.space.child", childId) as? JsonObject ?: return@forEachIndexed
        // A link without `via` is a removed child
        if (content["via"] == null) return@forEachIndexed
        client.setStateEvent(spaceId, "m.space.child", childId, JsonObject(content + ("order" to JsonPrimitive(order))))
    }
}

/**
 * The Channels tab of a Modern space (`R3`): move channels up and down inside a category or into another one, and move
 * categories among their siblings. Moving a channel adds it to the new category before taking it out of the old one, so a
 * failure never loses it. (Restricted rooms are not re-pointed at the new category; that is done from the room's settings.)
 */
@Composable
internal fun SpaceChannelsScreen(spaceId: String, roomList: RoomListModel, onBack: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val graph = roomList.graph
    val categories = remember(graph, spaceId) { SpaceModern.categories(graph, spaceId) }
    var canManage by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var moving by remember { mutableStateOf<Pair<String, String?>?>(null) }
    LaunchedEffect(spaceId, session.client) { canManage = session.canSendState("m.space.child", spaceId) }

    fun run(work: suspend (WizardClient) -> Unit) {
        val client = session.client ?: return
        scope.launch {
            try {
                work(client)
                roomList.refreshGraph()
                error = null
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    fun moveRoom(roomId: String, category: SpaceModern.Category, delta: Int) {
        val ids = category.roomIds.toMutableList()
        val index = ids.indexOf(roomId)
        if (index + delta !in ids.indices) return
        java.util.Collections.swap(ids, index, index + delta)
        val parent = category.spaceId ?: spaceId
        run { client -> saveChildOrder(client, graph.firstOrNull { it.spaceId == parent }, parent, ids) }
    }

    fun moveCategory(categoryId: String, delta: Int) {
        val parent = SpaceModern.parentOf(graph, categoryId) ?: return
        val node = graph.firstOrNull { it.spaceId == parent } ?: return
        val siblings = SpaceModern.orderedChildren(node).map { it.roomId }.toMutableList()
        val index = siblings.indexOf(categoryId)
        if (index + delta !in siblings.indices) return
        java.util.Collections.swap(siblings, index, index + delta)
        run { client -> saveChildOrder(client, node, parent, siblings) }
    }

    fun moveToCategory(roomId: String, from: String, to: String) {
        run { client ->
            client.addToSpace(to, roomId, false)
            client.removeFromSpace(from, roomId)
        }
    }

    SheetPage {
        WizardTopBar(tr("room.settings.channels.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            categories.forEach { category ->
                val categoryId = category.spaceId
                item(key = "category-${categoryId ?: "top"}") {
                    Row(
                        Modifier.fillMaxWidth().padding(start = WZ.Space.space7, end = WZ.Space.space3, top = WZ.Space.space5).heightIn(min = WZ.Space.space11),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            (categoryId?.let { id -> roomList.space(id)?.name } ?: tr("room.title")).uppercase(),
                            Modifier.weight(1f),
                            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                            color = theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (canManage && categoryId != null) {
                            BarButton("caret-up", tr("room.settings.roles.moveUp"), { moveCategory(categoryId, -1) }, size = WZ.SizeIcon.md)
                            BarButton("caret-down", tr("room.settings.roles.moveDown"), { moveCategory(categoryId, 1) }, size = WZ.SizeIcon.md)
                        }
                    }
                }
                items(category.roomIds, key = { "channel-${categoryId ?: "top"}-$it" }) { roomId ->
                    val room = roomList.room(roomId)
                    Row(
                        Modifier.fillMaxWidth().padding(start = WZ.Space.space7, end = WZ.Space.space3).heightIn(min = WZ.Space.space11),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                    ) {
                        PhIcon(if (room?.isVoice == true) "speaker-high" else "hash-straight", size = WZ.SizeIcon.sm, tint = theme.textMuted)
                        Text(
                            room?.displayName ?: roomId,
                            Modifier.weight(1f),
                            style = wizardFont(WZ.FontSize.lg),
                            color = if (room != null) theme.textPrimary else theme.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (canManage) {
                            BarButton("caret-up", tr("room.settings.roles.moveUp"), { moveRoom(roomId, category, -1) }, size = WZ.SizeIcon.md)
                            BarButton("caret-down", tr("room.settings.roles.moveDown"), { moveRoom(roomId, category, 1) }, size = WZ.SizeIcon.md)
                            Box {
                                BarButton("dots-three", tr("common.more"), { moving = roomId to categoryId }, size = WZ.SizeIcon.md)
                                WizardMenu(
                                    moving == roomId to categoryId,
                                    { moving = null },
                                    categories.filter { it != category }.map { target ->
                                        MenuItem(
                                            target.spaceId?.let { id -> roomList.space(id)?.name } ?: tr("room.title"),
                                            "arrow-right",
                                        ) { moveToCategory(roomId, categoryId ?: spaceId, target.spaceId ?: spaceId) }
                                    },
                                )
                            }
                        }
                    }
                }
            }
            item { ErrorText(error) }
        }
    }
}
