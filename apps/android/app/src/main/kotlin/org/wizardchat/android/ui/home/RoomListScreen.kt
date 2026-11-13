package org.wizardchat.android.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.matrix.RoomGroup
import org.wizardchat.android.matrix.MudrixRoomStates
import org.wizardchat.android.matrix.MudrixTypes
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.RoomListStyle
import org.wizardchat.android.matrix.RoomMenu
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.android.matrix.SidebarSelection
import org.wizardchat.android.matrix.canSendState
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.mentionCount
import org.wizardchat.android.matrix.unreadCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
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
import org.wizardchat.core.NotificationMode
import org.wizardchat.core.RoomSection
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

@Composable
fun RoomListScreen(
    roomList: RoomListModel,
    selection: SidebarSelection,
    onOpenInbox: (() -> Unit)?,
    onCreateSpace: (() -> Unit)? = null,
    onExplore: (() -> Unit)? = null,
) {
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
    var reordering by remember { mutableStateOf(false) }
    var newSectionFor by remember { mutableStateOf<String?>(null) }
    var renaming by remember { mutableStateOf<RoomSection?>(null) }
    var deleting by remember { mutableStateOf<RoomSection?>(null) }
    var movingRoom by remember { mutableStateOf<RoomSummary?>(null) }
    var sectionError by remember { mutableStateOf<String?>(null) }

    fun sectionTask(work: suspend () -> Unit) = scope.launch {
        try {
            work()
        } catch (e: Exception) {
            sectionError = L10n.format("room.sections.failed", e.message ?: "")
        }
    }

    val spaceId = (selection as? SidebarSelection.Space)?.id
    val title = when (selection) {
        SidebarSelection.Home -> tr("nav.home")
        SidebarSelection.Dms -> tr("room.dm.directMessages")
        is SidebarSelection.Space -> roomList.space(selection.id)?.name ?: tr("explore.typeSpace")
    }
    // Typing in the search box recomposes this screen on every key; the lists only change with the rooms
    val rooms by remember(roomList, selection) { derivedStateOf { roomList.rooms(selection) } }
    val groups by remember(roomList, selection) { derivedStateOf { if (roomList.isLoaded) roomList.groups(selection) else emptyList() } }
    val context = androidx.compose.ui.platform.LocalContext.current
    val collapsedPrefs = remember { context.getSharedPreferences("room_list", android.content.Context.MODE_PRIVATE) }
    var collapsed by remember { mutableStateOf(collapsedPrefs.getStringSet("collapsed", emptySet()).orEmpty()) }
    fun collapseKey(group: RoomGroup) = "${roomList.sectionContext(selection)}::${group.id}"
    fun toggle(group: RoomGroup) {
        val key = collapseKey(group)
        collapsed = if (key in collapsed) collapsed - key else collapsed + key
        collapsedPrefs.edit().putStringSet("collapsed", collapsed).apply()
    }
    val anchors = groups.filter { it.isMovable }.map { it.id }

    // A space whose top space says "modern" lists categories, voice channels and a banner. Its state is not in sync, so it is asked for.
    val stores = MudrixRoomStates.shared
    val rootSpace = remember(roomList.graph, spaceId) { spaceId?.let { SpaceModern.rootSpaceOf(roomList.graph, it) } }
    val modern = spaceId != null && SpaceModern.styleOf(stores.state(rootSpace)) == RoomListStyle.modern
    val modernCategories = remember(roomList.graph, spaceId, modern) {
        if (modern && spaceId != null) SpaceModern.categories(roomList.graph, spaceId) else emptyList()
    }
    LaunchedEffect(rootSpace, spaceId) {
        stores.keepFresh { listOfNotNull(rootSpace, spaceId) }
    }
    LaunchedEffect(modern, modernCategories) {
        if (modern) stores.ensureAll(modernCategories.flatMap { it.roomIds })
    }
    val voiceChannels = remember(stores.states, modernCategories) {
        modernCategories.flatMap { it.roomIds }.filter { SpaceModern.isVoiceChannelFlagged(stores.states[it]) }.toSet()
    }
    val modernContent = remember(modernCategories, voiceChannels, roomList.spaces) {
        ModernSpaceContent(modernCategories, roomList.spaces.associate { it.id to it.name }, voiceChannels)
    }
    val banner = if (modern) SpaceModern.bannerOf(stores.state(spaceId)) ?: SpaceModern.bannerOf(stores.state(rootSpace)) else null

    fun action(key: String, work: suspend () -> Unit) = scope.launch {
        try {
            work()
        } catch (e: Exception) {
            sectionError = L10n.format(key, e.message ?: "")
        }
    }

    fun markUnread(room: RoomSummary) = action("room.markUnreadFailed") {
        roomList.client.setMarkedUnread(room.id, true)
    }

    fun setLowPriority(room: RoomSummary, low: Boolean) = action("room.toggleLowPriorityFailed") {
        roomList.client.setLowPriority(room.id, low)
    }

    fun setVoiceChannel(room: RoomSummary, enabled: Boolean) = action("room.voiceChannelFailed") {
        stores.set(roomList.client, room.id, MudrixTypes.VOICE_CHANNEL, RoomMenu.voiceChannelContent(enabled))
    }


    fun canReorder(group: RoomGroup) = reordering && (group.kind == RoomGroup.Kind.Favourites ||
        (group.kind == RoomGroup.Kind.Rooms && selection == SidebarSelection.Home))

    fun move(group: RoomGroup, index: Int, offset: Int) {
        val ids = group.rooms.map { it.id }.toMutableList()
        if (index + offset !in ids.indices) return
        java.util.Collections.swap(ids, index, index + offset)
        scope.launch {
            if (group.kind == RoomGroup.Kind.Favourites) roomList.saveFavouriteOrder(ids) else roomList.saveHomeOrder(ids)
        }
    }

    Column(Modifier.fillMaxSize().background(theme.bgPrimary)) {
        WizardTopBar(
            title,
            large = true,
            titleInRow = spaceId == null,
            onBack = if (spaceId != null) navigator.pop else null,
        ) {
            Box {
                BarButton("plus", tr("nav.new"), { menuOpen = true })
                WizardMenu(
                    menuOpen,
                    { menuOpen = false },
                    buildList {
                        add(MenuItem(tr("common.newDm"), "chat-circle") { showNewMessage = true })
                        if (selection != SidebarSelection.Dms) add(MenuItem(tr("nav.newRoom"), "hash-straight") { showNewRoom = true })
                        if (selection != SidebarSelection.Dms) {
                            add(MenuItem(tr("room.sections.new"), "list-bullets") { newSectionFor = "" })
                            add(MenuItem(tr("nav.reorderRooms"), "caret-up-down") { reordering = true })
                        }
                        if (spaceId != null) add(MenuItem(tr("space.settingsTitle"), "gear", divider = true) { showSpaceSettings = true })
                    },
                )
            }
            if (reordering) BarTextButton(tr("common.done"), { reordering = false }, bold = true)
            if (onOpenInbox != null) InboxButton(roomList, onOpenInbox)
        }
        // Typing searches everything, not just this list
        WizardTextField(
            search,
            { search = it },
            tr("nav.searchPlaceholder"),
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
                if (banner != null && search.isBlank()) {
                    item(key = "space-banner") {
                        SpaceBannerView(banner, Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2))
                    }
                }
                if (selection == SidebarSelection.Home && search.isBlank() && roomList.isLoaded) {
                    item(key = "welcome") { HomeWelcome(roomList, onOpenInbox, { showNewMessage = true }, onCreateSpace, onExplore) }
                    item(key = "active-now") { ActiveNowSection(roomList) }
                }
                if (!roomList.isLoaded) {
                    items(8) { Box(Modifier.padding(horizontal = WZ.Space.space6)) { SkeletonRow() } }
                } else if (rooms.isEmpty()) {
                    item(key = "empty") {
                        Note(
                            tr(if (selection == SidebarSelection.Dms) "nav.noDirectMessagesYet" else "nav.noRoomsHereYet"),
                            Modifier.padding(vertical = WZ.Space.space9),
                        )
                    }
                }
                val headers = selection != SidebarSelection.Dms
                groups.forEach { group ->
                    val isModernGroup = modern && group.kind == RoomGroup.Kind.Rooms
                    // The Modern list has no "Rooms" heading unless favourites or sections above it need one
                    if (headers && !(isModernGroup && groups.size == 1)) {
                        item(key = "header-${group.id}") {
                            GroupHeader(
                                group,
                                anchors,
                                closed = collapseKey(group) in collapsed && !reordering,
                                onToggle = { if (!reordering) toggle(group) },
                                onRename = { renaming = it },
                                onMove = { offset -> sectionTask { roomList.moveGroup(group.id, offset, groups) } },
                                onDelete = { deleting = it },
                            )
                        }
                    }
                    if (isModernGroup) {
                        modernRooms(modernContent, group.rooms) { room, voice ->
                            SwipeableRoomRow(
                                room,
                                showsHashIcon = !room.isDirect,
                                voiceChannel = voice,
                                voiceFlagged = SpaceModern.isVoiceChannelFlagged(stores.states[room.id]),
                                modern = true,
                                onOpen = { navigator.push(Route.Room(room.id)) },
                                onToggleRead = { read -> scope.launch { roomList.setRead(room, read) } },
                                onMarkUnread = { markUnread(room) },
                                onLeave = { leaving = room },
                                onToggleFavourite = { sectionTask { roomList.client.setFavourite(room.id, !room.isFavourite) } },
                                onSetLowPriority = { low -> setLowPriority(room, low) },
                                onSetVoiceChannel = { enabled -> setVoiceChannel(room, enabled) },
                                onMoveToSection = { movingRoom = room },
                                notificationMode = roomList.notificationMode(room),
                                onSetNotificationMode = { mode -> scope.launch { roomList.setNotificationMode(room, mode) } },
                                reorder = null,
                            )
                        }
                        return@forEach
                    }
                    val shown = if (headers && collapseKey(group) in collapsed && !reordering) emptyList() else group.rooms
                    itemsIndexed(shown, key = { _, room -> room.id }) { index, room ->
                        SwipeableRoomRow(
                            room,
                            showsHashIcon = !prefs.showRoomAvatars && !room.isDirect,
                            onOpen = { navigator.push(Route.Room(room.id)) },
                            onToggleRead = { read -> scope.launch { roomList.setRead(room, read) } },
                            onMarkUnread = { markUnread(room) },
                            onLeave = { leaving = room },
                            onToggleFavourite = { sectionTask { roomList.client.setFavourite(room.id, !room.isFavourite) } },
                            onSetLowPriority = { low -> setLowPriority(room, low) },
                            onMoveToSection = if (selection == SidebarSelection.Dms) null else ({ movingRoom = room }),
                            notificationMode = roomList.notificationMode(room),
                            onSetNotificationMode = { mode -> scope.launch { roomList.setNotificationMode(room, mode) } },
                            reorder = if (canReorder(group)) ({ offset -> move(group, index, offset) }) else null,
                        )
                    }
                }
            }
            if (search.isNotBlank()) {
                GlobalSearchResults(roomList, search.trim(), onOpenRoom = { navigator.openRoom(it) })
            }
        }
    }

    movingRoom?.let { room ->
        SectionPickerDialog(
            sections = roomList.sections.filter { it.spaceId == roomList.sectionContext(selection) || it.tag == roomList.sectionTag(room.id) },
            current = roomList.sectionTag(room.id),
            onDismiss = { movingRoom = null },
            onPick = { tag ->
                movingRoom = null
                sectionTask { roomList.client.setRoomSection(room.id, tag) }
            },
            onNew = {
                movingRoom = null
                newSectionFor = room.id
            },
        )
    }
    if (newSectionFor != null || renaming != null) {
        SectionNameDialog(
            title = tr(if (renaming != null) "room.sections.renameTitle" else "room.sections.newTitle"),
            initial = renaming?.name ?: "",
            onDismiss = {
                newSectionFor = null
                renaming = null
            },
            onSave = { name ->
                val section = renaming
                val roomId = newSectionFor
                newSectionFor = null
                renaming = null
                if (name.isNotBlank()) sectionTask {
                    if (section != null) {
                        roomList.client.renameRoomSection(section.tag, name.trim())
                    } else {
                        val tag = roomList.client.createRoomSection(name.trim(), roomList.sectionContext(selection))
                        if (!roomId.isNullOrEmpty()) roomList.client.setRoomSection(roomId, tag)
                    }
                }
            },
        )
    }
    deleting?.let { section ->
        ConfirmDialog(
            title = L10n.format("room.sections.deleteTitle", section.name),
            confirmLabel = tr("room.sections.delete"),
            message = tr("room.sections.deleteMessage"),
            onConfirm = {
                deleting = null
                sectionTask { roomList.client.deleteRoomSection(section.tag) }
            },
            onDismiss = { deleting = null },
        )
    }
    sectionError?.let { message ->
        ConfirmDialog(title = message, confirmLabel = tr("common.close"), onConfirm = { sectionError = null }, onDismiss = { sectionError = null }, destructive = false)
    }
    if (showNewMessage) UserPickerSheet(UserPickerMode.DirectMessage, onDismiss = { showNewMessage = false })
    if (showNewRoom) CreateRoomSheet(spaceId, onDismiss = { showNewRoom = false })
    if (showVerify) SessionsSheet(onDismiss = { showVerify = false })
    if (showSpaceSettings && spaceId != null) {
        roomList.space(spaceId)?.let { space -> SpaceSettingsSheet(space, roomList, onDismiss = { showSpaceSettings = false }) }
    }
    leaving?.let { room ->
        ConfirmDialog(
            tr("room.info.leaveConfirm", room.displayName),
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
    voiceChannel: Boolean = false,
    voiceFlagged: Boolean = false,
    modern: Boolean = false,
    onOpen: () -> Unit,
    onToggleRead: (Boolean) -> Unit,
    onMarkUnread: () -> Unit,
    onLeave: () -> Unit,
    onToggleFavourite: () -> Unit,
    onSetLowPriority: (Boolean) -> Unit,
    onSetVoiceChannel: (Boolean) -> Unit = {},
    onMoveToSection: (() -> Unit)?,
    notificationMode: NotificationMode?,
    onSetNotificationMode: (NotificationMode?) -> Unit,
    reorder: ((Int) -> Unit)?,
) {
    val unread = room.unreadCount > 0 || room.mentionCount > 0
    val session = org.wizardchat.android.LocalSession.current
    var menuOpen by remember { mutableStateOf(false) }
    var notificationsOpen by remember { mutableStateOf(false) }
    var canFlagVoice by remember(room.id) { mutableStateOf(false) }
    val actions = RoomMenu.actions(room.unreadCount, room.mentionCount)
    LaunchedEffect(menuOpen, modern, room.isVoice) {
        if (menuOpen && modern && !room.isVoice) canFlagVoice = session.canSendState(MudrixTypes.VOICE_CHANNEL, room.id)
    }
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
                Modifier.fillMaxSize().background(if (leading) theme.control else theme.danger).padding(horizontal = WZ.Space.space8),
                horizontalArrangement = if (leading) Arrangement.Start else Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PhIcon(
                    if (!leading) "sign-out" else if (unread) "envelope-open" else "envelope-simple",
                    tint = if (leading) theme.bgPrimary else theme.textOnAccent,
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                RoomRow(
                    room,
                    showsHashIcon,
                    Modifier.weight(1f).padding(start = WZ.Space.space6, end = if (reorder == null) WZ.Space.space6 else WZ.Space.space0),
                    voiceChannel = voiceChannel || room.isVoice,
                    muted = notificationMode == NotificationMode.mute,
                )
                if (reorder != null) {
                    BarButton("caret-left", tr("room.sections.moveUp"), { reorder(-1) }, modifier = Modifier.rotate(90f), weight = PhWeight.bold, tint = theme.textPrimary)
                    BarButton("caret-left", tr("room.sections.moveDown"), { reorder(1) }, modifier = Modifier.rotate(-90f), weight = PhWeight.bold, tint = theme.textPrimary)
                }
            }
            WizardMenu(
                menuOpen,
                { menuOpen = false },
                buildList {
                    if (RoomMenu.offersVoiceChannel(modern, room.isVoice, canFlagVoice)) {
                        add(
                            MenuItem(
                                tr(if (voiceFlagged) "room.makeTextChannel" else "room.makeVoiceChannel"),
                                if (voiceFlagged) "hash-straight" else "speaker-high",
                            ) { onSetVoiceChannel(!voiceFlagged) },
                        )
                    }
                    if (actions.markRead) add(MenuItem(tr("common.markRead"), "envelope-open") { onToggleRead(true) })
                    if (actions.markUnread) add(MenuItem(tr("room.markUnread"), "envelope-simple") { onMarkUnread() })
                    add(MenuItem(tr("room.notifications.title"), "bell") { notificationsOpen = true })
                    add(MenuItem(tr(if (room.isFavourite) "room.removeFavourite" else "room.addFavourite"), "star", onClick = onToggleFavourite))
                    add(
                        MenuItem(
                            tr(if (room.isLowPriority) "room.removeLowPriority" else "room.addLowPriority"),
                            "arrow-line-down",
                            checked = room.isLowPriority,
                        ) { onSetLowPriority(!room.isLowPriority) },
                    )
                    onMoveToSection?.let { add(MenuItem(tr("room.sections.moveTo"), "list-bullets", onClick = it)) }
                    add(
                        MenuItem(tr("common.copyLink"), "link-simple") {
                            copyToClipboard("https://matrix.to/#/${room.id}", L10n.format("timeline.linkCopied"))
                        },
                    )
                    add(MenuItem(tr("common.leave"), "sign-out", destructive = true, divider = true, onClick = onLeave))
                },
            )
            WizardMenu(
                notificationsOpen,
                { notificationsOpen = false },
                listOf(
                    Triple(null, "room.notifications.default", "bell"),
                    Triple(NotificationMode.all, "room.notifications.all", "bell-ringing"),
                    Triple(NotificationMode.mentions, "room.notifications.mentions", "bell-simple"),
                    Triple(NotificationMode.mute, "room.notifications.mute", "bell-slash"),
                ).map { (mode, label, icon) ->
                    MenuItem(tr(label), icon, checked = mode == notificationMode) { onSetNotificationMode(mode) }
                },
            )
        }
    }
}

@Composable
fun RoomRow(room: RoomSummary, showsHashIcon: Boolean, modifier: Modifier = Modifier, voiceChannel: Boolean = room.isVoice, muted: Boolean = false) {
    val prefs = LocalPrefs.current
    val avatarSize = prefs.roomAvatarSize
    val inCall = voiceChannel && room.callParticipants.isNotEmpty()
    val hasUnread = room.unreadCount > 0 || room.mentionCount > 0

    @Composable
    fun TypeIcon(size: androidx.compose.ui.unit.Dp) {
        PhIcon(
            if (voiceChannel) "speaker-high" else "hash-straight",
            if (voiceChannel) PhWeight.regular else PhWeight.bold,
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
            if (inCall && room.isVoice) ParticipantStack(room.id, room.callParticipants)
        }
        if (inCall) RoomCallTimer(room.id)
        Spacer(Modifier.width(6.dp))
        if (muted) {
            PhIcon("bell-slash", size = WZ.SizeIcon.sm, tint = theme.textMuted, contentDescription = tr("room.notifications.mute"))
            if (room.mentionCount > 0 || room.unreadCount > 0) Spacer(Modifier.width(WZ.Space.space3))
        }
        when {
            room.mentionCount > 0 -> UnreadBadge(room.mentionCount, isMention = true)
            room.unreadCount > 0 -> UnreadBadge(room.unreadCount, isMention = false)
        }
    }
}

@Composable
private fun GroupHeader(
    group: RoomGroup,
    anchors: List<String>,
    closed: Boolean,
    onToggle: () -> Unit,
    onRename: (RoomSection) -> Unit,
    onMove: (Int) -> Unit,
    onDelete: (RoomSection) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val section = (group.kind as? RoomGroup.Kind.Section)?.section
    val index = anchors.indexOf(group.id)
    val title = when (val kind = group.kind) {
        RoomGroup.Kind.Favourites -> tr("nav.favourites")
        is RoomGroup.Kind.Section -> kind.section.name
        RoomGroup.Kind.Rooms -> tr("nav.rooms")
        RoomGroup.Kind.LowPriority -> tr("mobile.lowPriority")
    }
    val rotation by androidx.compose.animation.core.animateFloatAsState(if (closed) 0f else 90f, label = "chevron")
    val haptics = androidx.compose.ui.platform.LocalHapticFeedback.current
    val hint = tr(if (closed) "common.expand" else "common.collapse")
    Row(
        Modifier.fillMaxWidth().padding(start = WZ.Space.space4, end = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .weight(1f)
                .heightIn(min = WZ.SizeControl.sm + WZ.Space.space1)
                .clip(RoundedCornerShape(WZ.Radius.md))
                .clickable(onClickLabel = hint) {
                    haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove)
                    onToggle()
                }
                .padding(horizontal = WZ.Space.space2)
                .semantics { heading() },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        ) {
            PhIcon("caret-right", PhWeight.bold, WZ.SizeIcon.xs, tint = theme.textMuted, modifier = Modifier.rotate(rotation))
            Text(title, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textSecondary, maxLines = 1)
            if (closed) {
                val unread = group.rooms.sumOf { maxOf(it.unreadCount, it.mentionCount) }
                if (unread > 0) UnreadBadge(unread, group.rooms.any { it.mentionCount > 0 })
            }
        }
        if (index >= 0 && (anchors.size > 1 || section != null)) {
            Box {
                BarButton("dots-three", tr("room.sections.options"), { menuOpen = true }, weight = PhWeight.bold, size = WZ.SizeIcon.sm, tint = theme.textMuted)
                WizardMenu(
                    menuOpen,
                    { menuOpen = false },
                    listOfNotNull(
                        section?.let { MenuItem(tr("common.rename"), "pencil-simple") { onRename(it) } },
                        MenuItem(tr("room.sections.moveUp"), "caret-up-down") { onMove(-1) }.takeIf { index > 0 },
                        MenuItem(tr("room.sections.moveDown"), "caret-up-down") { onMove(1) }.takeIf { index < anchors.size - 1 },
                        section?.let { MenuItem(tr("room.sections.delete"), "trash", destructive = true, divider = true) { onDelete(it) } },
                    ),
                )
            }
        }
    }
}

@Composable
private fun SectionPickerDialog(
    sections: List<RoomSection>,
    current: String?,
    onDismiss: () -> Unit,
    onPick: (String?) -> Unit,
    onNew: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgPrimary,
        title = { Text(tr("room.sections.moveTo"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary) },
        text = {
            Column {
                sections.forEach { section ->
                    GroupedRow(section.name, onClick = { onPick(section.tag) }) {
                        if (section.tag == current) PhIcon("check", PhWeight.bold, WZ.SizeIcon.sm, tint = theme.accent)
                    }
                }
                GroupedRow(tr("room.sections.new"), icon = "plus", onClick = onNew)
                if (current != null) GroupedRow(tr("room.sections.remove"), icon = "x", onClick = { onPick(null) })
            }
        },
        confirmButton = { BarTextButton(tr("common.cancel"), onDismiss) },
    )
}

@Composable
private fun SectionNameDialog(title: String, initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var name by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgPrimary,
        title = { Text(title, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary) },
        text = { WizardTextField(name, { name = it }, title) },
        confirmButton = { BarTextButton(tr("common.save"), { onSave(name) }, bold = true) },
        dismissButton = { BarTextButton(tr("common.cancel"), onDismiss) },
    )
}
