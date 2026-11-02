package org.wizardchat.android.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.SidebarSelection
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.mentionCount
import org.wizardchat.android.matrix.unreadCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.Note
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.SkeletonRow
import org.wizardchat.android.ui.UnreadBadge
import org.wizardchat.android.ui.UnreadDot
import org.wizardchat.android.ui.VerificationBanner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.people.CreateRoomSheet
import org.wizardchat.android.ui.people.SpaceSettingsSheet
import org.wizardchat.android.ui.people.UserPickerMode
import org.wizardchat.android.ui.people.UserPickerSheet
import org.wizardchat.android.ui.search.GlobalSearchResults
import org.wizardchat.android.ui.settings.SessionsSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.voice.ParticipantStack
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

@Composable
fun RoomListScreen(roomList: RoomListModel, selection: SidebarSelection, onOpenInbox: (() -> Unit)?) {
    val prefs = LocalPrefs.current
    val navigator = LocalNavigator.current
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    var leaving by remember { mutableStateOf<RoomSummary?>(null) }
    var showNewRoom by remember { mutableStateOf(false) }
    var showNewMessage by remember { mutableStateOf(false) }
    var showSpaceSettings by remember { mutableStateOf(false) }
    var showVerify by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }

    val spaceId = (selection as? SidebarSelection.Space)?.id
    val title = when (selection) {
        SidebarSelection.Home -> tr("room.home")
        SidebarSelection.Dms -> tr("room.dm.directMessages")
        is SidebarSelection.Space -> roomList.space(selection.id)?.name ?: tr("explore.typeSpace")
    }
    val rooms = roomList.rooms(selection)

    Column(Modifier.fillMaxSize().background(theme.bgPrimary)) {
        WizardTopBar(
            title,
            large = true,
            onBack = if (spaceId != null) navigator.pop else null,
        ) {
            Box {
                BarButton("plus", tr("home.new"), { menuOpen = true })
                WizardMenu(
                    menuOpen,
                    { menuOpen = false },
                    buildList {
                        add(MenuItem(tr("common.newMessage"), "note-pencil") { showNewMessage = true })
                        if (selection != SidebarSelection.Dms) add(MenuItem(tr("rooms.newRoom"), "hash-straight") { showNewRoom = true })
                        if (spaceId != null) add(MenuItem(tr("home.spaceSettings"), "gear", divider = true) { showSpaceSettings = true })
                    },
                )
            }
            if (onOpenInbox != null) InboxButton(roomList, onOpenInbox)
        }
        // Typing searches everything, not just this list
        WizardTextField(
            search,
            { search = it },
            tr("home.searchRoomsPeopleMessages"),
            Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        )
        Box(Modifier.weight(1f)) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = LocalBottomBarInset.current + WZ.Space.space6),
            ) {
                if (onOpenInbox != null) {
                    item(key = "verify") {
                        Box(Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2)) {
                            VerificationBanner { showVerify = true }
                        }
                    }
                }
                if (!roomList.isLoaded) {
                    items(8) { Box(Modifier.padding(horizontal = WZ.Space.space6)) { SkeletonRow() } }
                } else if (rooms.isEmpty()) {
                    item(key = "empty") {
                        Note(
                            tr(if (selection == SidebarSelection.Dms) "home.noDirectMessagesYet" else "home.noRoomsHereYet"),
                            Modifier.padding(vertical = WZ.Space.space9),
                        )
                    }
                }
                items(rooms, key = { it.id }) { room ->
                    SwipeableRoomRow(
                        room,
                        showsHashIcon = !prefs.showRoomAvatars && !room.isDirect,
                        onOpen = { navigator.push(Route.Room(room.id)) },
                        onToggleRead = { read -> scope.launch { roomList.setRead(room, read) } },
                        onLeave = { leaving = room },
                    )
                }
            }
            if (search.isNotBlank()) {
                GlobalSearchResults(roomList, search.trim(), onOpenRoom = { navigator.openRoom(it) })
            }
        }
    }

    if (showNewMessage) UserPickerSheet(UserPickerMode.DirectMessage, onDismiss = { showNewMessage = false })
    if (showNewRoom) CreateRoomSheet(spaceId, onDismiss = { showNewRoom = false })
    if (showVerify) SessionsSheet(onDismiss = { showVerify = false })
    if (showSpaceSettings && spaceId != null) {
        roomList.space(spaceId)?.let { space -> SpaceSettingsSheet(space, roomList, onDismiss = { showSpaceSettings = false }) }
    }
    leaving?.let { room ->
        ConfirmDialog(
            tr("room.leaveNamed2", room.displayName),
            tr("common.leave"),
            onConfirm = { scope.launch { roomList.leave(room) } },
            onDismiss = { leaving = null },
        )
    }
}

@Composable
private fun InboxButton(roomList: RoomListModel, onClick: () -> Unit) {
    val mentions = roomList.mentionRooms.isNotEmpty()
    val badge = mentions || roomList.invites.isNotEmpty()
    BarButton("tray", tr("inbox.title"), onClick, badge = if (badge) ({ UnreadDot(mentions) }) else null)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun SwipeableRoomRow(
    room: RoomSummary,
    showsHashIcon: Boolean,
    onOpen: () -> Unit,
    onToggleRead: (Boolean) -> Unit,
    onLeave: () -> Unit,
) {
    val unread = room.unreadCount > 0 || room.mentionCount > 0
    var menuOpen by remember { mutableStateOf(false) }
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> onToggleRead(unread)
                SwipeToDismissBoxValue.EndToStart -> onLeave()
                SwipeToDismissBoxValue.Settled -> {}
            }
            false
        },
    )
    SwipeToDismissBox(
        state,
        backgroundContent = {
            val leading = state.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            Row(
                Modifier.fillMaxSize().background(if (leading) theme.accent else theme.danger).padding(horizontal = WZ.Space.space8),
                horizontalArrangement = if (leading) Arrangement.Start else Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PhIcon(
                    if (!leading) "sign-out" else if (unread) "envelope-open" else "envelope-simple",
                    tint = theme.textOnAccent,
                    size = WZ.SizeIcon.lg,
                )
            }
        },
    ) {
        Box(
            Modifier
                .background(theme.bgPrimary)
                .combinedClickable(onClick = onOpen, onLongClick = { menuOpen = true }),
        ) {
            RoomRow(room, showsHashIcon, Modifier.padding(horizontal = WZ.Space.space6))
            WizardMenu(
                menuOpen,
                { menuOpen = false },
                listOf(
                    MenuItem(tr("common.markRead"), "envelope-open") { onToggleRead(true) },
                    MenuItem(tr("common.copyLink"), "link-simple") {
                        copyToClipboard("https://matrix.to/#/${room.id}", L10n.format("timeline.linkCopied"))
                    },
                    MenuItem(tr("common.leave"), "sign-out", destructive = true, divider = true, onClick = onLeave),
                ),
            )
        }
    }
}

@Composable
fun RoomRow(room: RoomSummary, showsHashIcon: Boolean, modifier: Modifier = Modifier) {
    val prefs = LocalPrefs.current
    val avatarSize = prefs.roomAvatarSize
    val inCall = room.isVoice && room.callParticipants.isNotEmpty()
    val hasUnread = room.unreadCount > 0 || room.mentionCount > 0

    @Composable
    fun TypeIcon(size: androidx.compose.ui.unit.Dp) {
        PhIcon(
            if (room.isVoice) "speaker-high" else "hash-straight",
            if (room.isVoice) PhWeight.fill else PhWeight.bold,
            size = size,
            tint = if (inCall) theme.success else theme.textMuted,
        )
    }

    Row(
        modifier.fillMaxWidth().padding(vertical = prefs.roomRowPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        if (showsHashIcon) {
            Box(Modifier.size(avatarSize).clip(CircleShape).background(theme.fill), contentAlignment = Alignment.Center) {
                TypeIcon(avatarSize * 0.45f)
            }
        } else {
            Box {
                Avatar(room.displayName, room.avatarUrl, avatarSize)
                if (!room.isDirect) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .offset(WZ.Space.space2, WZ.Space.space2)
                            .size(WZ.Space.space7)
                            .clip(CircleShape)
                            .background(theme.bgPrimary)
                            .border(WZ.BorderWidth.thin, if (inCall) theme.success else theme.border, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { TypeIcon(WZ.SizeIcon.xs) }
                }
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
            Text(
                room.displayName,
                style = wizardFont(WZ.FontSize.lg, if (hasUnread) FontWeight.SemiBold else FontWeight.Normal),
                color = if (hasUnread) theme.textPrimary else theme.textPrimary.copy(alpha = 0.85f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (inCall) ParticipantStack(room.id, room.callParticipants)
        }
        Spacer(Modifier.width(6.dp))
        when {
            room.mentionCount > 0 -> UnreadBadge(room.mentionCount, isMention = true)
            room.unreadCount > 0 -> UnreadBadge(room.unreadCount, isMention = false)
        }
    }
}
