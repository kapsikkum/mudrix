@file:OptIn(ExperimentalFoundationApi::class)

package org.wizardchat.android.ui.home

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RailRoom
import org.wizardchat.android.matrix.RailSpace
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.SidebarSelection
import org.wizardchat.android.matrix.SpaceRail
import org.wizardchat.android.matrix.UnreadState
import org.wizardchat.android.matrix.mentionCount
import org.wizardchat.android.matrix.unreadCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.UnreadDot
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.tokens.WZ

private val railWidth = 72.dp
private val railSlotHeight = 56.dp
private val railAvatar = 44.dp
private val railCorner = 16.dp
private val railCornerSelected = 8.dp
internal val modernBarHeight = WZ.Size.tabBar + WZ.Space.space2

/** Which rail slot was last open, kept on this device so a restart returns to it */
internal object RailSelectionStore {
    private const val PREFS = "space_rail"

    fun load(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("selected", null)

    fun save(context: Context, spaceId: String?) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .apply { if (spaceId == null) remove("selected") else putString("selected", spaceId) }
            .apply()
    }
}

/** The rail's view of the joined spaces, in the order the classic list uses */
internal fun railSpaces(roomList: RoomListModel): List<RailSpace> =
    roomList.spaces.map { RailSpace(it.id, it.name, it.avatarUrl) }

private fun railRooms(roomList: RoomListModel): List<RailRoom> {
    val memberships = roomList.spaces.associate { it.id to (roomList.spaceRooms[it.id] ?: emptySet()) }
    return roomList.joinedRooms.filter { !it.isSpace }.map { room ->
        RailRoom(
            spaceIds = memberships.filterValues { room.id in it }.keys,
            unread = room.unreadCount > 0,
            mentions = room.mentionCount,
        )
    }
}

/** The rail's unread and mention totals for Home and each space, in rail order */
internal fun railSlots(roomList: RoomListModel) = SpaceRail.slots(railSpaces(roomList), railRooms(roomList))

/** The left rail: Home, every space as its avatar, then add and explore */
@Composable
internal fun SpaceRailBar(
    roomList: RoomListModel,
    selectedSpaceId: String?,
    homeSelected: Boolean,
    onHome: () -> Unit,
    onSpace: (String) -> Unit,
    onCreateSpace: () -> Unit,
    onExplore: () -> Unit,
) {
    val slots = railSlots(roomList)
    Column(
        Modifier
            .width(railWidth)
            .fillMaxHeight()
            .background(theme.bgSecondary)
            .statusBarsPadding()
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.padding(top = WZ.Space.space4, bottom = WZ.Space.space2)) {
            RailSlotItem(
                label = tr("nav.home"),
                selected = homeSelected,
                unread = slots.firstOrNull()?.unread == true,
                mentions = slots.firstOrNull()?.mentions ?: 0,
                onClick = onHome,
            ) {
                RailHomeAvatar(homeSelected)
            }
        }
        Box(Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6).height(1.dp).background(theme.border))
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = WZ.Space.space2),
        ) {
            items(roomList.spaces, key = { it.id }) { space ->
                val slot = slots.firstOrNull { it.space?.id == space.id }
                RailSpaceItem(
                    spaceId = space.id,
                    name = space.name,
                    avatarUrl = space.avatarUrl,
                    selected = selectedSpaceId == space.id,
                    unread = slot?.unread == true,
                    mentions = slot?.mentions ?: 0,
                    onOpen = { onSpace(space.id) },
                    onMarkRead = { roomList.markAsRead(roomList.rooms(SidebarSelection.Space(space.id))) },
                )
            }
        }
        Box(Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6).height(1.dp).background(theme.border))
        RailAddButton(onCreateSpace, onExplore)
    }
}

@Composable
private fun RailHomeAvatar(selected: Boolean) {
    val shape = RoundedCornerShape(if (selected) railCornerSelected else railCorner)
    Box(
        Modifier
            .size(railAvatar)
            .clip(shape)
            .background(if (selected) theme.accent else theme.fill),
        contentAlignment = Alignment.Center,
    ) {
        PhIcon("house", if (selected) PhWeight.fill else PhWeight.regular, size = WZ.SizeIcon.lg, tint = if (selected) theme.textOnAccent else theme.textMuted)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RailSpaceItem(
    spaceId: String,
    name: String,
    avatarUrl: String?,
    selected: Boolean,
    unread: Boolean,
    mentions: Int,
    onOpen: () -> Unit,
    onMarkRead: suspend () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val unreadState = UnreadState(unread, mentions > 0)
    Box {
        RailSlotItem(
            label = railLabel(name, unread, mentions),
            selected = selected,
            unread = unread,
            mentions = mentions,
            onClick = onOpen,
            onLongClick = { menuOpen = true },
        ) {
            val reduceMotion = LocalPrefs.current.reducesMotion(false)
            val radius by animateDpAsState(
                if (selected) railCornerSelected else railCorner,
                animationSpec = if (reduceMotion) androidx.compose.animation.core.snap() else spring(),
                label = "railShape",
            )
            Avatar(name, avatarUrl, railAvatar, cornerRadius = radius)
        }
        SpaceMenu(menuOpen, spaceId, unreadState, { scope.launch { onMarkRead() } }) { menuOpen = false }
    }
}

/** A rail slot's spoken label: its name, then what is waiting in it */
private fun railLabel(name: String, unread: Boolean, mentions: Int): String = buildString {
    append(name)
    if (mentions > 0) {
        append(". ")
        append(L10n.format("inbox.youWereMentionedTimes", "$mentions"))
    } else if (unread) {
        append(". ")
        append(L10n.format("timeline.unreadMessages"))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RailSlotItem(
    label: String,
    selected: Boolean,
    unread: Boolean,
    mentions: Int,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Box(
        Modifier
            .width(railWidth)
            .height(railSlotHeight)
            .semantics {
                contentDescription = label
                this.selected = selected
                role = Role.Tab
            }
            .combinedClickable(onClick = onClick, onLongClick = onLongClick),
    ) {
        if (selected) {
            Box(
                Modifier
                    .align(Alignment.CenterStart)
                    .width(4.dp)
                    .height(32.dp)
                    .clip(RoundedCornerShape(topEnd = 2.dp, bottomEnd = 2.dp))
                    .background(theme.accent),
            )
        } else if (unread) {
            Box(
                Modifier
                    .align(Alignment.CenterStart)
                    .width(4.dp)
                    .height(7.dp)
                    .clip(RoundedCornerShape(topEnd = 2.dp, bottomEnd = 2.dp))
                    .background(theme.textPrimary),
            )
        }
        Box(Modifier.align(Alignment.Center)) {
            content()
            SpaceRail.badge(mentions)?.let { text ->
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = WZ.Space.space1, y = WZ.Space.space1)
                        .widthIn(min = 18.dp)
                        .height(18.dp)
                        .clip(CircleShape)
                        .background(theme.mention)
                        .border(2.dp, theme.bgSecondary, CircleShape)
                        .padding(horizontal = 3.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text, style = wizardFont(WZ.FontSize.xs, FontWeight.Bold), color = theme.textOnAccent, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun RailAddButton(onCreateSpace: () -> Unit, onExplore: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    val label = tr("space.addSpace")
    Box(Modifier.padding(vertical = WZ.Space.space3)) {
        Box(
            Modifier
                .size(railAvatar)
                .clip(RoundedCornerShape(WZ.Radius.lg))
                .background(theme.fill)
                .combinedClickable(onClick = { menuOpen = true })
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) {
            PhIcon("plus", PhWeight.bold, size = WZ.SizeIcon.md, tint = theme.textMuted)
        }
        WizardMenu(
            menuOpen,
            { menuOpen = false },
            listOf(
                MenuItem(tr("space.addSpace"), "plus-circle") { onCreateSpace() },
                MenuItem(tr("explore.title"), "compass") { onExplore() },
            ),
        )
    }
}

/** The flat bar under the content pane: the classic island's destinations, with labels */
@Composable
internal fun ModernBottomBar(
    tab: Tab,
    homeUnread: UnreadState,
    dmsUnread: UnreadState,
    inboxMention: Boolean,
    inboxBadge: Boolean,
    onHome: () -> Unit,
    onMessages: () -> Unit,
    onInbox: () -> Unit,
    onYou: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().background(theme.bgPrimary).navigationBarsPadding()) {
        Row(Modifier.fillMaxWidth().height(modernBarHeight), verticalAlignment = Alignment.CenterVertically) {
            BarDestination(tr("nav.home"), "house", tab == Tab.home, homeUnread, onHome)
            BarDestination(tr("search.switcher.prefixDms"), "chat-circle", tab == Tab.dms, dmsUnread, onMessages)
            BarDestination(tr("inbox.title"), "tray", false, UnreadState(inboxBadge, inboxMention), onInbox)
            YouDestination(tab == Tab.me, onYou)
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.YouDestination(selected: Boolean, onYou: () -> Unit) {
    Box(
        Modifier.weight(1f).fillMaxHeight().combinedClickable(onClick = onYou).semantics { this.selected = selected; role = Role.Tab },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            val session = LocalSession.current
            Avatar(
                session.displayName ?: session.userId ?: "",
                session.avatarUrl,
                WZ.SizeAvatar.sm,
                modifier = if (selected) Modifier.border(2.dp, theme.accent, CircleShape) else Modifier,
            )
            Text(
                tr("nav.you"),
                style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
                color = if (selected) theme.accent else theme.textMuted,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.BarDestination(
    label: String,
    icon: String,
    selected: Boolean,
    unread: UnreadState,
    onClick: () -> Unit,
) {
    Column(
        Modifier
            .weight(1f)
            .fillMaxHeight()
            .combinedClickable(onClick = onClick)
            .semantics { this.selected = selected; role = Role.Tab },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box {
            PhIcon(icon, if (selected) PhWeight.fill else PhWeight.regular, size = WZ.SizeIcon.md, tint = if (selected) theme.accent else theme.textMuted)
            if (unread.unread) UnreadDot(unread.mention, Modifier.align(Alignment.TopEnd).offset(x = WZ.Space.space3, y = -WZ.Space.space1))
        }
        Text(
            label,
            style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
            color = if (selected) theme.accent else theme.textMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * A screen that follows a finger to the right and goes back past a distance or velocity threshold, with
 * [underlay] showing through as the list peeks. A left drag is left to the rows and scrollers underneath.
 */
@Composable
internal fun SwipeBack(onBack: () -> Unit, underlay: @Composable () -> Unit, content: @Composable () -> Unit) {
    val density = LocalDensity.current
    val prefs = LocalPrefs.current
    val context = LocalContext.current
    val still = remember(prefs.reducedMotion) {
        val animationsOff = runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
        prefs.reducesMotion(animationsOff)
    }
    var offset by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    val velocityThreshold = with(density) { 900.dp.toPx() }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val maxPx = with(density) { maxWidth.toPx() }
        val distanceThreshold = maxPx * 0.28f
        val peeking by remember { derivedStateOf { offset > 0f } }
        if (peeking) underlay()
        Box(
            Modifier
                .fillMaxSize()
                .drawBehind {
                    if (offset > 0f) drawRect(Color.Black.copy(alpha = 0.12f * (1f - offset / maxPx)))
                },
        )
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer { translationX = offset }
                .pointerInput(maxPx) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        val tracker = VelocityTracker()
                        tracker.addPosition(down.uptimeMillis, down.position)
                        var last = down.position
                        var totalX = 0f
                        var totalY = 0f
                        var dragging = false
                        var giveUp = false
                        while (true) {
                            val event = awaitPointerEvent(PointerEventPass.Initial)
                            val change = event.changes.firstOrNull { it.id == down.id } ?: break
                            val dx = change.position.x - last.x
                            val dy = change.position.y - last.y
                            last = change.position
                            tracker.addPosition(change.uptimeMillis, change.position)
                            if (!dragging) {
                                totalX += dx
                                totalY += dy
                                if (totalX > viewConfiguration.touchSlop && totalX > abs(totalY)) {
                                    dragging = true
                                } else if (abs(totalX) > viewConfiguration.touchSlop || abs(totalY) > viewConfiguration.touchSlop) {
                                    giveUp = true
                                    break
                                }
                            }
                            if (dragging) {
                                offset = (offset + dx).coerceIn(0f, maxPx)
                                change.consume()
                            }
                            if (!change.pressed) break
                        }
                        if (dragging && !giveUp) {
                            val velocity = tracker.calculateVelocity().x
                            val goBack = offset >= distanceThreshold || velocity >= velocityThreshold
                            scope.launch {
                                if (goBack) {
                                    if (!still) Animatable(offset).animateTo(maxPx, tween(160)) { offset = value }
                                    onBack()
                                } else if (still) {
                                    offset = 0f
                                } else {
                                    Animatable(offset).animateTo(0f, spring()) { offset = value }
                                }
                            }
                        }
                    }
                },
        ) {
            content()
        }
    }
}
