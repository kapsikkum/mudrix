package chat.mudrix.android.ui.home

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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.AlertDialog
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.input.ImeAction
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import kotlinx.coroutines.launch
import chat.mudrix.android.LocalPrefs
import chat.mudrix.android.matrix.Density
import chat.mudrix.android.matrix.RoomGroup
import chat.mudrix.android.matrix.MudrixRoomStates
import chat.mudrix.android.matrix.MudrixTypes
import chat.mudrix.android.matrix.RoomListModel
import chat.mudrix.android.matrix.RoomListOptions
import chat.mudrix.android.matrix.RoomListStyle
import chat.mudrix.android.matrix.RoomSortMode
import chat.mudrix.android.matrix.RoomMenu
import chat.mudrix.android.matrix.RoomPreview
import chat.mudrix.android.matrix.RoomPreviewLabels
import chat.mudrix.android.matrix.SpaceModern
import chat.mudrix.android.matrix.SidebarSelection
import chat.mudrix.android.matrix.canSendState
import chat.mudrix.android.matrix.displayName
import chat.mudrix.android.matrix.mentionCount
import chat.mudrix.android.matrix.unreadCount
import chat.mudrix.android.ui.Avatar
import chat.mudrix.android.ui.BarButton
import chat.mudrix.android.ui.BarTextButton
import chat.mudrix.android.ui.ConfirmDialog
import chat.mudrix.android.ui.GroupedRow
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.LocalBottomBarInset
import chat.mudrix.android.ui.MenuItem
import chat.mudrix.android.ui.Note
import chat.mudrix.android.ui.PhIcon
import chat.mudrix.android.ui.PhWeight
import chat.mudrix.android.ui.SkeletonRow
import chat.mudrix.android.ui.UnreadBadge
import chat.mudrix.android.ui.UnreadDot
import chat.mudrix.android.ui.VerificationBanner
import chat.mudrix.android.ui.WizardMenu
import chat.mudrix.android.ui.WizardSheet
import chat.mudrix.android.ui.WizardTextField
import chat.mudrix.android.ui.WizardTopBar
import chat.mudrix.android.ui.copyToClipboard
import chat.mudrix.android.ui.people.CreateRoomSheet
import chat.mudrix.android.ui.people.SpaceSettingsSheet
import chat.mudrix.android.ui.people.UserPickerMode
import chat.mudrix.android.ui.people.UserPickerSheet
import chat.mudrix.android.ui.search.GlobalSearchResults
import chat.mudrix.android.ui.sensitive
import chat.mudrix.android.ui.settings.RowFrame
import chat.mudrix.android.ui.settings.RowLabel
import chat.mudrix.android.ui.settings.SettingsDivider
import chat.mudrix.android.ui.settings.SessionsSheet
import chat.mudrix.android.ui.settings.ToggleRow
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.android.ui.voice.ParticipantStack
import chat.mudrix.core.NotificationMode
import chat.mudrix.core.RoomSection
import chat.mudrix.core.RoomSummary
import chat.mudrix.tokens.WZ

@Composable
fun RoomListScreen(
    roomList: RoomListModel,
    selection: SidebarSelection,
    onOpenInbox: (() -> Unit)?,
    onCreateSpace: (() -> Unit)? = null,
    onExplore: (() -> Unit)? = null,
    modernHeader: Boolean = false,
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
    var searchOpen by remember { mutableStateOf(false) }
    var showSort by remember { mutableStateOf(false) }
    val searchFocus = remember { FocusRequester() }

    fun sectionTask(work: suspend () -> Unit) = scope.launch {
        try {
            work()
        } catch (e: Exception) {
            sectionError = L10n.format("room.sections.failed", e.message ?: "")
        }
    }

    val spaceId = (selection as? SidebarSelection.Space)?.id
    // The Modern shell's direct-messages pane: a toolbar under the title instead of the top bar's + and inbox
    val dmPane = modernHeader && selection == SidebarSelection.Home
    val title = when (selection) {
        SidebarSelection.Home -> if (modernHeader) tr("room.dm.directMessages") else tr("nav.home")
        SidebarSelection.Dms -> tr("room.dm.directMessages")
        is SidebarSelection.Space -> roomList.space(selection.id)?.name ?: tr("explore.typeSpace")
    }
    // Typing in the search box recomposes this screen on every key; the lists only change with the rooms
    val groups by remember(roomList, selection, dmPane) {
        derivedStateOf { if (roomList.isLoaded) roomList.groups(selection, includeDms = dmPane) else emptyList() }
    }
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
    val categories = remember(roomList.graph, spaceId) {
        if (spaceId != null) SpaceModern.categories(roomList.graph, spaceId) else emptyList()
    }
    val modernCategories = if (modern) categories else emptyList()
    // The Matrix style groups its rooms under sub-space headers too, like the web's
    val matrixCategories = !modern && categories.any { it.spaceId != null }
    LaunchedEffect(rootSpace, spaceId) {
        stores.keepFresh { listOfNotNull(rootSpace, spaceId) }
    }
    LaunchedEffect(modern, modernCategories) {
        if (modern) stores.ensureAll(modernCategories.flatMap { it.roomIds })
    }
    val voiceChannels = remember(stores.states, modernCategories) {
        modernCategories.flatMap { it.roomIds }.filter { SpaceModern.isVoiceChannelFlagged(stores.states[it]) }.toSet()
    }
    val roomsLabel = tr("nav.rooms")
    val categoryHeaders = remember(categories, roomList.spaces, roomList.allSpaces, roomList.joinedRooms) {
        categories.mapNotNull { it.spaceId }.distinct().associateWith { roomList.categoryHeaderOf(it, roomsLabel) }
    }
    val modernContent = remember(modernCategories, voiceChannels, categoryHeaders) {
        ModernSpaceContent(modernCategories, categoryHeaders, voiceChannels)
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

    /** The groups whose order is saved on the account: favourites, and Home's rooms (the web's own two orders) */
    fun hasSavedOrder(group: RoomGroup) = group.kind == RoomGroup.Kind.Favourites ||
        (group.kind == RoomGroup.Kind.Rooms && selection == SidebarSelection.Home)

    fun move(group: RoomGroup, index: Int, offset: Int) {
        val ids = RoomMenu.moved(group.rooms.map { it.id }, index, offset) ?: return
        scope.launch {
            if (group.kind == RoomGroup.Kind.Favourites) roomList.saveFavouriteOrder(ids) else roomList.saveHomeOrder(ids)
        }
    }

    LaunchedEffect(searchOpen) {
        if (searchOpen) searchFocus.requestFocus()
    }
    val newMenu: @Composable () -> Unit = {
        WizardMenu(
            menuOpen,
            { menuOpen = false },
            buildList {
                add(MenuItem(tr("common.newDm"), "chat-circle") { showNewMessage = true })
                if (selection == SidebarSelection.Dms) add(MenuItem(tr("roomList.sort"), "sliders") { showSort = true })
                if (selection != SidebarSelection.Dms) add(MenuItem(tr("nav.newRoom"), "hash-straight") { showNewRoom = true })
                if (selection != SidebarSelection.Dms) {
                    add(MenuItem(tr("room.sections.new"), "list-bullets") { newSectionFor = "" })
                    add(MenuItem(tr("nav.reorderRooms"), "caret-up-down") { reordering = true })
                }
                if (spaceId != null) add(MenuItem(tr("space.settingsTitle"), "gear", divider = true) { showSpaceSettings = true })
            },
        )
    }

    Column(Modifier.fillMaxSize().background(theme.bgPrimary)) {
        val space = spaceId?.let { roomList.space(it) }
        WizardTopBar(
            title,
            large = !modernHeader,
            titleInRow = modernHeader || spaceId == null,
            titleContent = if (modernHeader) {
                {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(WZ.Radius.md))
                            .clickable(enabled = space != null) { showSpaceSettings = true }
                            .padding(horizontal = WZ.Space.space2, vertical = WZ.Space.space1),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                    ) {
                        if (space != null) Avatar(space.name, space.avatarUrl, WZ.SizeAvatar.sm, cornerRadius = WZ.Radius.md)
                        Text(
                            title,
                            Modifier.weight(1f, fill = false),
                            style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (space != null) PhIcon("caret-right", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textMuted)
                    }
                }
            } else {
                null
            },
            onBack = if (spaceId != null && !modernHeader) navigator.pop else null,
        ) {
            if (!dmPane) {
                Box {
                    BarButton("plus", tr("nav.new"), { menuOpen = true })
                    newMenu()
                }
            }
            if (reordering) BarTextButton(tr("common.done"), { reordering = false }, bold = true)
            if (!dmPane && onOpenInbox != null) InboxButton(roomList, onOpenInbox)
        }
        if (dmPane) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                RoundToolButton("magnifying-glass", tr("common.search"), {
                    if (searchOpen) {
                        searchFocus.requestFocus()
                    } else {
                        searchOpen = true
                    }
                })
                if (onOpenInbox != null) InboxButton(roomList, onOpenInbox, round = true)
                Spacer(Modifier.weight(1f))
                Box {
                    RoundToolButton("plus", tr("nav.new"), { menuOpen = true }, accent = true, weight = PhWeight.bold)
                    newMenu()
                }
            }
            if (searchOpen) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                ) {
                    TextField(
                        value = search,
                        onValueChange = { search = it },
                        modifier = Modifier.weight(1f).heightIn(min = WZ.Space.space11).focusRequester(searchFocus),
                        placeholder = {
                            Text(
                                tr("nav.searchPlaceholder"),
                                color = theme.textMuted,
                                style = wizardFont(WZ.FontSize.lg),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        textStyle = wizardFont(WZ.FontSize.lg).copy(color = theme.textPrimary),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                        shape = RoundedCornerShape(WZ.Radius.lg),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = theme.fill,
                            unfocusedContainerColor = theme.fill,
                            disabledContainerColor = theme.fill,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            disabledIndicatorColor = Color.Transparent,
                            cursorColor = theme.accent,
                        ),
                    )
                    BarButton("x", tr("common.close"), { search = ""; searchOpen = false })
                }
            }
        } else {
            // Typing searches everything, not just this list
            WizardTextField(
                search,
                { search = it },
                tr("nav.searchPlaceholder"),
                Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
            )
        }
        Box(Modifier.weight(1f)) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = LocalBottomBarInset.current + WZ.Space.space6),
                // A hair of air between rows: nameplates fill a whole row, so without it the list reads as one block
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
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
                if (selection == SidebarSelection.Home && search.isBlank() && roomList.isLoaded && !modernHeader) {
                    item(key = "welcome") { HomeWelcome(roomList, onOpenInbox, { showNewMessage = true }, onCreateSpace, onExplore) }
                    item(key = "active-now") { ActiveNowSection(roomList) }
                }
                // The Modern rail's Home slot is both homes: the groups now carry the DMs, favourites and pins too
                if (!roomList.isLoaded) {
                    items(8) { Box(Modifier.padding(horizontal = WZ.Space.space6)) { SkeletonRow() } }
                } else if (groups.all { it.rooms.isEmpty() }) {
                    item(key = "empty") {
                        Note(
                            tr(if (selection == SidebarSelection.Dms) "nav.noDirectMessagesYet" else "nav.noRoomsHereYet"),
                            Modifier.padding(vertical = WZ.Space.space9),
                        )
                    }
                }
                val headers = selection != SidebarSelection.Dms || groups.size > 1
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
                                pinned = roomList.isPinned(room),
                                onTogglePin = if (room.isDirect) {
                                    ({ scope.launch { roomList.setPinned(room, !roomList.isPinned(room)) } })
                                } else {
                                    null
                                },
                            )
                        }
                        return@forEach
                    }
                    if (matrixCategories && group.kind == RoomGroup.Kind.Rooms) {
                        if (!(headers && collapseKey(group) in collapsed && !reordering)) {
                            matrixCategoryRooms(categories, group.rooms, categoryHeaders, roomsLabel) { room ->
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
                                    reorder = null,
                                    pinned = roomList.isPinned(room),
                                    onTogglePin = if (room.isDirect) {
                                        ({ scope.launch { roomList.setPinned(room, !roomList.isPinned(room)) } })
                                    } else {
                                        null
                                    },
                                )
                            }
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
                            onMoveBy = if (hasSavedOrder(group) && group.rooms.size > 1) {
                                ({ offset -> move(group, index, offset) })
                            } else {
                                null
                            },
                            notificationMode = roomList.notificationMode(room),
                            onSetNotificationMode = { mode -> scope.launch { roomList.setNotificationMode(room, mode) } },
                            reorder = if (canReorder(group)) ({ offset -> move(group, index, offset) }) else null,
                            pinned = roomList.isPinned(room),
                            onTogglePin = if (room.isDirect) {
                                ({ scope.launch { roomList.setPinned(room, !roomList.isPinned(room)) } })
                            } else {
                                null
                            },
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
    if (showSort) {
        RoomListSortSheet(
            options = roomList.options,
            onChange = { next -> scope.launch { roomList.setOptions(next) } },
            onDismiss = { showSort = false },
        )
    }
}

/** The DM screen's order, sections and pins, saved to account data as they change. */
@Composable
private fun RoomListSortSheet(
    options: RoomListOptions,
    onChange: (RoomListOptions) -> Unit,
    onDismiss: () -> Unit,
) {
    WizardSheet(onDismiss) {
        Text(
            tr("roomList.sortTitle"),
            Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
            style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
            color = theme.textPrimary,
        )
        RoomSortMode.entries.forEach { mode ->
            val label = when (mode) {
                RoomSortMode.Recent -> tr("roomList.sortRecent")
                RoomSortMode.Newest -> tr("roomList.sortNewest")
                RoomSortMode.Oldest -> tr("roomList.sortOldest")
                RoomSortMode.Categorised -> tr("roomList.sortCategorised")
            }
            RowFrame(onClick = { onChange(options.copy(sort = mode)) }) {
                RowLabel(label, null, Modifier.weight(1f))
                if (options.sort == mode) PhIcon("check", PhWeight.bold, WZ.SizeIcon.sm, tint = theme.accent)
            }
        }
        SettingsDivider()
        ToggleRow(
            tr("roomList.separateRoomsAndDms"),
            options.separateRoomsAndDms,
            { onChange(options.copy(separateRoomsAndDms = it)) },
        )
        ToggleRow(
            tr("roomList.favouritesSection"),
            options.favouritesSection,
            { onChange(options.copy(favouritesSection = it)) },
        )
        Spacer(Modifier.height(WZ.Space.space6))
    }
}

@Composable
private fun InboxButton(roomList: RoomListModel, onClick: () -> Unit, round: Boolean = false) {
    val mentions = roomList.mentionRooms.isNotEmpty()
    val badge = mentions || roomList.invites.isNotEmpty()
    val dot: (@Composable () -> Unit)? = if (badge) ({ UnreadDot(mentions) }) else null
    if (round) {
        RoundToolButton("tray", tr("inbox.title"), onClick, badge = dot)
    } else {
        BarButton("tray", tr("inbox.title"), onClick, badge = dot)
    }
}

/** A round 32 dp button for the direct-messages toolbar; the accent one is the new-item "+" */
@Composable
private fun RoundToolButton(
    icon: String,
    label: String,
    onClick: () -> Unit,
    accent: Boolean = false,
    badge: (@Composable () -> Unit)? = null,
    weight: PhWeight = PhWeight.regular,
) {
    Box(Modifier.size(WZ.Space.space9)) {
        Box(
            Modifier
                .fillMaxSize()
                .clip(CircleShape)
                .background(if (accent) theme.accent else theme.fill)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            PhIcon(icon, weight, WZ.SizeIcon.sm, tint = if (accent) theme.textOnAccent else theme.textPrimary, contentDescription = label)
        }
        badge?.let {
            Box(Modifier.align(Alignment.TopEnd).offset(WZ.Space.space1, -WZ.Space.space1)) { it() }
        }
    }
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
    /** Moves this room up (-1) or down (1) inside its group; null when the list has no saved order to change */
    onMoveBy: ((Int) -> Unit)? = null,
    notificationMode: NotificationMode?,
    onSetNotificationMode: (NotificationMode?) -> Unit,
    reorder: ((Int) -> Unit)?,
    /** Whether this DM is pinned to the top; only DMs can be pinned */
    pinned: Boolean = false,
    onTogglePin: (() -> Unit)? = null,
) {
    val unread = room.unreadCount > 0 || room.mentionCount > 0
    val session = chat.mudrix.android.LocalSession.current
    var menuOpen by remember { mutableStateOf(false) }
    var notificationsOpen by remember { mutableStateOf(false) }
    var canFlagVoice by remember(room.id) { mutableStateOf(false) }
    val actions = RoomMenu.actions(room.unreadCount, room.mentionCount)
    val cosmetics = room.dmUserId?.let { chat.mudrix.android.ui.cosmetics.rememberCosmetics(it) }
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
    val cosmosNameplate = cosmetics?.nameplate
    // Every DM row is one card, with or without a nameplate, so it shares the box and the radius
    val dmRow = room.dmUserId != null
    val rowShape = RoundedCornerShape(WZ.Radius.md)
    SwipeToDismissBox(
        state,
        modifier = Modifier.clip(rowShape),
        backgroundContent = {
            // Drawn only mid-swipe: at rest a coloured layer under the row would show its anti-aliased corners
            val direction = state.dismissDirection
            if (direction != SwipeToDismissBoxValue.Settled) {
                val leading = direction == SwipeToDismissBoxValue.StartToEnd
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
            }
        },
    ) {
        // The nameplate is the whole row's background, so it is drawn behind the avatar, name, preview and time
        chat.mudrix.android.ui.cosmetics.NameplateBox(
            cosmosNameplate,
            Modifier
                .fillMaxWidth()
                // A DM row is a card whose edge is the line every plain row's content sits on (16dp):
                // the card takes that inset, and RoomRow below adds no further padding, so the art
                // starts on the avatar column and stops on the badges column, clear of the scrollbar
                .padding(horizontal = if (dmRow) WZ.Space.space6 else WZ.Space.space0)
                .clip(rowShape)
                .background(theme.bgPrimary)
                .combinedClickable(onClick = onOpen, onLongClick = { menuOpen = true }),
            fullBleed = cosmosNameplate != null,
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                RoomRow(
                    room,
                    showsHashIcon,
                    Modifier.weight(1f).padding(
                        // The card itself now sits on the content line, so a DM row adds no inset inside
                        start = if (dmRow) WZ.Space.space0 else WZ.Space.space6,
                        end = if (reorder == null) {
                            if (dmRow) WZ.Space.space0 else WZ.Space.space6
                        } else {
                            WZ.Space.space0
                        },
                    ),
                    voiceChannel = voiceChannel || room.isVoice,
                    muted = notificationMode == NotificationMode.mute,
                    cosmetics = cosmetics,
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
                    onTogglePin?.let {
                        add(
                            MenuItem(
                                tr(if (pinned) "roomList.unpin" else "roomList.pin"),
                                "push-pin",
                                checked = pinned,
                                onClick = it,
                            ),
                        )
                    }
                    add(MenuItem(tr(if (room.isFavourite) "room.removeFavourite" else "room.addFavourite"), "star", onClick = onToggleFavourite))
                    add(
                        MenuItem(
                            tr(if (room.isLowPriority) "room.removeLowPriority" else "room.addLowPriority"),
                            "arrow-line-down",
                            checked = room.isLowPriority,
                        ) { onSetLowPriority(!room.isLowPriority) },
                    )
                    onMoveToSection?.let { add(MenuItem(tr("room.sections.moveTo"), "list-bullets", onClick = it)) }
                    onMoveBy?.let { move ->
                        add(MenuItem(tr("room.moveUp"), "arrow-circle-up") { move(-1) })
                        add(MenuItem(tr("room.moveDown"), "arrow-line-down") { move(1) })
                    }
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

/** A small pill right after a row's name: a tiny icon and 2-4 uppercase letters, on translucent dark */
@Composable
private fun NameBadge(label: String) {
    Row(
        Modifier
            .clip(RoundedCornerShape(WZ.Radius.pill))
            .background(theme.overlay)
            .padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
    ) {
        PhIcon("phone", weight = PhWeight.fill, size = 10.dp, tint = theme.textOnAccent)
        Text(
            label.uppercase(),
            style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold).copy(letterSpacing = 0.04.em),
            color = theme.textOnAccent,
            maxLines = 1,
        )
    }
}

@Composable
fun RoomRow(
    room: RoomSummary,
    showsHashIcon: Boolean,
    modifier: Modifier = Modifier,
    voiceChannel: Boolean = room.isVoice,
    muted: Boolean = false,
    cosmetics: chat.mudrix.android.ui.cosmetics.CosmeticCatalog.Cosmetics? = null,
) {
    val prefs = LocalPrefs.current
    // A DM row is one card: nameplate or not, every row shares the box, so the list never changes height
    val nameplate = cosmetics?.nameplate != null
    val dmRow = room.dmUserId != null
    val avatarSize = prefs.roomAvatarSize
    val inCall = voiceChannel && room.callParticipants.isNotEmpty()
    val hasUnread = room.unreadCount > 0 || room.mentionCount > 0
    val preview = if (prefs.uiDensity == Density.compact) null else room.lastMessage?.let {
        RoomPreview.line(it, room.isDirect, previewLabels())
    }

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
        modifier.fillMaxWidth()
            // One card height for the whole DM list, with or without a nameplate
            .heightIn(min = if (dmRow) 64.dp else 0.dp)
            .padding(vertical = if (dmRow) WZ.Space.space0 else prefs.roomRowPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        if (showsHashIcon) {
            Box(Modifier.size(avatarSize).clip(CircleShape).background(theme.fill), contentAlignment = Alignment.Center) {
                TypeIcon(avatarSize * 0.45f)
            }
        } else {
            Box(
                // Inside the banner the avatar keeps a thin dark ring so it separates from the art
                if (nameplate) Modifier.border(WZ.BorderWidth.thin, theme.overlay, CircleShape) else Modifier,
            ) {
                if (room.dmUserId != null) {
                    Avatar(room.displayName, room.avatarUrl, avatarSize)
                    chat.mudrix.android.ui.cosmetics.DecorationOverlay(cosmetics?.decoration, avatarSize)
                    chat.mudrix.android.ui.cosmetics.CosmeticStatusDot(
                        cosmetics?.status,
                        avatarSize,
                        Modifier.align(Alignment.BottomEnd),
                    )
                } else {
                    Avatar(room.displayName, room.avatarUrl, avatarSize)
                }
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
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                Text(
                    room.displayName,
                    Modifier.weight(1f, fill = false),
                    style = wizardFont(WZ.FontSize.md, if (nameplate || hasUnread) FontWeight.SemiBold else FontWeight.Normal)
                        // Over the banner's art a local halo keeps the name crisp on a bright patch
                        .copy(
                            shadow = if (nameplate) {
                                Shadow(color = Color.Black.copy(alpha = 0.55f), offset = Offset(0f, 1f), blurRadius = 2f)
                            } else {
                                null
                            },
                        ),
                    color = if (nameplate || hasUnread) theme.textPrimary else theme.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (nameplate && room.callParticipants.isNotEmpty()) NameBadge(tr("call.live"))
            }
            preview?.let { line ->
                Text(
                    line,
                    Modifier.fillMaxWidth().sensitive(),
                    style = wizardFont(WZ.FontSize.sm, if (hasUnread) FontWeight.Medium else FontWeight.Normal),
                    color = if (hasUnread) theme.textPrimary else theme.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (inCall && room.isVoice) ParticipantStack(room.id, room.callParticipants)
        }
        if (inCall) RoomCallTimer(room.id)
        if (room.isDirect) {
            room.lastActivity?.let { activity ->
                Text(relativeTimeText(activity), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1)
            }
        }
        Spacer(Modifier.width(6.dp))
        if (muted) {
            PhIcon("bell-slash", size = WZ.SizeIcon.sm, tint = theme.textMuted, contentDescription = tr("room.notifications.mute"))
            if (room.mentionCount > 0 || room.unreadCount > 0) Spacer(Modifier.width(WZ.Space.space3))
        }
        when {
            room.mentionCount > 0 -> UnreadBadge(maxOf(room.unreadCount, room.mentionCount), isMention = true)
            room.unreadCount > 0 -> UnreadBadge(room.unreadCount, isMention = false)
        }
    }
}

/** The words a room list preview is built from, in the current language */
@Composable
private fun previewLabels() = RoomPreviewLabels(
    you = tr("nav.you"),
    photo = tr("timeline.photo"),
    video = tr("timeline.summary.video"),
    audio = tr("composer.voice.record"),
    file = tr("composer.file"),
    sticker = tr("room.preview.sticker"),
    poll = tr("timeline.poll.title"),
    call = tr("room.preview.call"),
    newMessage = tr("common.newMessage"),
)

/** "just now", "5m ago", "3h ago" or "2d ago" for a room's latest activity */
private fun relativeTimeText(millis: Long): String {
    val minutes = ((System.currentTimeMillis() - millis) / 60_000L).coerceAtLeast(0L).toInt()
    return when {
        minutes < 1 -> L10n.format("time.justNow")
        minutes < 60 -> L10n.plural("time.minutesAgo", minutes, minutes)
        minutes < 24 * 60 -> L10n.plural("time.hoursAgo", minutes / 60, minutes / 60)
        else -> L10n.plural("time.daysAgo", minutes / (24 * 60), minutes / (24 * 60))
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
        RoomGroup.Kind.Pinned -> tr("roomList.pinned")
        RoomGroup.Kind.Dms -> tr("room.dm.directMessages")
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

/** The Matrix style's rooms of a space under each sub-space heading (empty ones skipped); rooms in no category come first, unheaded */
private fun LazyListScope.matrixCategoryRooms(
    categories: List<SpaceModern.Category>,
    rooms: List<RoomSummary>,
    headers: Map<String, String>,
    generic: String,
    row: @Composable (RoomSummary) -> Unit,
) {
    val byId = rooms.associateBy { it.id }
    val claimed = categories.flatMapTo(mutableSetOf()) { it.roomIds }
    val loose = rooms.filter { it.id !in claimed }
    for (category in categories) {
        val listed = (if (category.spaceId == null) loose else emptyList()) + category.roomIds.mapNotNull { byId[it] }
        if (listed.isEmpty()) continue
        category.spaceId?.let { id ->
            item(key = "matrix-category-$id", contentType = "category") {
                Text(
                    (headers[id] ?: generic),
                    Modifier.fillMaxWidth().padding(start = WZ.Space.space6 + 12.dp * (category.depth - 1).coerceAtLeast(0), top = WZ.Space.space6, bottom = WZ.Space.space2),
                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                    color = theme.textMuted,
                )
            }
        }
        for (room in listed) {
            item(key = "matrix-${category.spaceId}-${room.id}", contentType = "room") { row(room) }
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
