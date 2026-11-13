package org.wizardchat.android.ui.home

import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import org.wizardchat.android.matrix.SessionStore
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.ListeningSharing
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.NavigationStyle
import org.wizardchat.android.matrix.RecentEmoji
import org.wizardchat.android.matrix.MudrixRoomStates
import org.wizardchat.android.matrix.Reminders
import org.wizardchat.android.matrix.VoiceMoves
import org.wizardchat.android.ui.space.LocalSpaceGraph
import org.wizardchat.android.matrix.SavedMessages
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.ensureMudrixUserFlag
import org.wizardchat.android.matrix.SettingsSyncer
import org.wizardchat.android.matrix.SidebarSelection
import org.wizardchat.android.matrix.SpaceRail
import org.wizardchat.android.matrix.UnreadState
import org.wizardchat.android.matrix.unreadCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.ConnectionBanner
import org.wizardchat.android.ui.CopyToastView
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.UnreadDot
import org.wizardchat.android.ui.room.RoomScreen
import org.wizardchat.android.ui.settings.SettingsScreen
import org.wizardchat.android.ui.settings.VerificationRequests
import org.wizardchat.android.ui.settings.VerificationSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.voice.CallBar
import org.wizardchat.android.ui.voice.CallErrorBanner
import org.wizardchat.android.ui.voice.DMCallScreen
import org.wizardchat.android.ui.voice.IncomingCallBanner
import org.wizardchat.android.ui.voice.VoiceRoomScreen
import org.wizardchat.tokens.WZ

enum class Tab { home, dms, spaces, me }

sealed interface Route {
    /** A room: its voice view for voice rooms, otherwise the chat */
    data class Room(val id: String) : Route
    data class Space(val id: String) : Route
    /** A voice room's text chat */
    data class Chat(val id: String) : Route
    data class Thread(val roomId: String, val rootEventId: String) : Route
}

/** Opens rooms and spaces from anywhere in the main screen (inbox, search, links, notifications) */
class Navigator(
    val openRoom: (String) -> Unit,
    val openSpace: (String) -> Unit,
    val push: (Route) -> Unit,
    val pop: () -> Unit,
)

val LocalNavigator = staticCompositionLocalOf<Navigator> { error("no navigator") }
val LocalCalls = staticCompositionLocalOf<CallManager> { error("no call manager") }
val LocalNotifier = staticCompositionLocalOf<MessageNotifier> { error("no notifier") }

private val islandHeight = WZ.Size.tabBar + WZ.Space.space5 + WZ.Space.space1
private val callBarHeight = WZ.Size.callControl + WZ.Space.space5

@Composable
fun MainScreen(roomList: RoomListModel) {
    val session = LocalSession.current
    val prefs = LocalPrefs.current
    val modern = prefs.navigationStyle == NavigationStyle.rail
    val calls = remember { CallManager.shared }
    val notifier = remember { MessageNotifier.shared }

    var tab by remember { mutableStateOf(Tab.home) }
    // The tab You was opened from, so closing You returns there with its rail selection (kept in paths)
    var youFrom by remember { mutableStateOf(Tab.home) }
    val paths = remember { mutableStateMapOf<Tab, List<Route>>() }
    var showInbox by remember { mutableStateOf(false) }
    var ownProfile by remember { mutableStateOf(false) }
    val railListState = rememberLazyListState()
    var showCreateSpace by remember { mutableStateOf(false) }
    var showExplore by remember { mutableStateOf(false) }
    val context = androidx.compose.ui.platform.LocalContext.current
    var whatsNew by remember { mutableStateOf<org.wizardchat.android.ui.settings.WhatsNew.Entry?>(null) }
    LaunchedEffect(roomList.isLoaded) {
        if (roomList.isLoaded && whatsNew == null) whatsNew = org.wizardchat.android.ui.settings.WhatsNew.unseen(context)
    }
    var syncer by remember { mutableStateOf<SettingsSyncer?>(null) }
    val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0

    fun show(roomId: String) {
        val room = roomList.room(roomId)
        val space = roomList.spaceContaining(roomId)
        // The Modern rail has no DM-only pane: direct messages live in the Home pane
        val dmTab = if (modern) Tab.home else Tab.dms
        when {
            room?.isDirect == true -> {
                tab = dmTab
                paths[dmTab] = listOf(Route.Room(roomId))
            }
            space != null -> {
                tab = Tab.spaces
                paths[Tab.spaces] = listOf(Route.Space(space.id), Route.Room(roomId))
            }
            else -> {
                tab = Tab.home
                paths[Tab.home] = listOf(Route.Room(roomId))
            }
        }
    }

    fun showSpace(spaceId: String) {
        tab = Tab.spaces
        paths[Tab.spaces] = listOf(Route.Space(spaceId))
        RailSelectionStore.save(context, spaceId)
    }

    fun select(item: Tab) {
        if (item == tab) paths[item] = emptyList() else tab = item
    }

    fun openYou() {
        if (tab == Tab.me) return
        youFrom = tab
        tab = Tab.me
    }

    fun closeYou() {
        tab = youFrom
    }

    fun showsIsland(item: Tab) = !keyboardVisible && paths[item].orEmpty().none { it is Route.Room || it is Route.Chat || it is Route.Thread }

    fun showsCallBar(item: Tab): Boolean {
        val callRoom = calls.room ?: return false
        return calls.isInCall && !keyboardVisible && paths[item]?.lastOrNull() != Route.Room(callRoom.id)
    }

    val navigator = remember(tab) {
        Navigator(
            openRoom = ::show,
            openSpace = ::showSpace,
            push = { route -> paths[tab] = paths[tab].orEmpty() + route },
            pop = { paths[tab] = paths[tab].orEmpty().dropLast(1) },
        )
    }

    LaunchedEffect(session.userId, session.avatarUrl, session.media) {
        val userId = session.userId ?: return@LaunchedEffect
        val url = session.avatarUrl
        if (url == null) {
            SessionStore.saveAvatar(null, userId)
        } else {
            session.media?.thumbnail(url)?.let { withContext(Dispatchers.IO) { SessionStore.saveAvatar(it, userId) } }
        }
    }

    LaunchedEffect(session.client) {
        val client = session.client ?: return@LaunchedEffect
        syncer = SettingsSyncer(client, prefs, this).also { it.start() }
        notifier.start(roomList, prefs)
        calls.watchIncoming(client)
        RecentEmoji.shared.start(client)
        VerificationRequests.shared.start(client)
        SavedMessages.shared.start(client)
        Reminders.shared.start(client)
        MudrixRoomStates.shared.start(client)
        VoiceMoves.start(client, calls, session, roomList)
    }
    LaunchedEffect(session.client) {
        if (session.client != null) session.ensureMudrixUserFlag()
    }
    LaunchedEffect(session.client, prefs.shareListening) {
        if (session.client != null && prefs.shareListening) ListeningSharing.start(session) else ListeningSharing.stop()
    }
    // Also when another device changes the setting
    LaunchedEffect(session.client, prefs.showPresence, prefs.presenceChoice) {
        if (session.client != null) session.applyPresence(prefs.showPresence, prefs.presenceChoice)
    }
    // Also runs when the activity is recreated (rotation), so calls end on sign-out instead (MatrixSession)
    DisposableEffect(Unit) {
        onDispose {
            notifier.stop()
            RecentEmoji.shared.stop()
            VerificationRequests.shared.stop()
            SavedMessages.shared.stop()
            Reminders.shared.stop()
            MudrixRoomStates.shared.stop()
            VoiceMoves.stop()
            syncer?.stop()
        }
    }
    LaunchedEffect(notifier.roomToOpen, notifier.accountToOpen, roomList.isLoaded) {
        val roomId = notifier.roomToOpen ?: return@LaunchedEffect
        if (!roomList.isLoaded || notifier.accountToOpen != null) return@LaunchedEffect
        notifier.roomToOpen = null
        showInbox = false
        showCreateSpace = false
        showExplore = false
        ownProfile = false
        show(roomId)
    }
    val totalUnread = roomList.joinedRooms.sumOf { it.unreadCount }
    LaunchedEffect(totalUnread) { notifier.updateBadge(totalUnread) }

    // Back to the space that was open when the app last closed, once the spaces have loaded
    var startupHandled by remember { mutableStateOf(false) }
    LaunchedEffect(roomList.isLoaded, roomList.spaces) {
        if (startupHandled || !roomList.isLoaded) return@LaunchedEffect
        if (modern && roomList.spaces.isEmpty()) return@LaunchedEffect
        startupHandled = true
        if (!modern) return@LaunchedEffect
        val target = SpaceRail.selected(RailSelectionStore.load(context), railSpaces(roomList)) ?: return@LaunchedEffect
        showSpace(target.id)
    }

    BackHandler(enabled = paths[tab].orEmpty().isNotEmpty()) {
        val leavingSpaceRoot = modern && tab == Tab.spaces && paths[tab].orEmpty().size == 1 && paths[tab]?.lastOrNull() is Route.Space
        paths[tab] = paths[tab].orEmpty().dropLast(1)
        if (leavingSpaceRoot) {
            tab = Tab.home
            RailSelectionStore.save(context, null)
        }
    }
    BackHandler(enabled = paths[tab].orEmpty().isEmpty() && tab != Tab.home) {
        if (modern && tab == Tab.me) closeYou() else tab = Tab.home
    }

    val stateHolder = rememberSaveableStateHolder()
    CompositionLocalProvider(
        LocalNavigator provides navigator,
        LocalCalls provides calls,
        LocalNotifier provides notifier,
        LocalSpaceGraph provides roomList.graph,
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(theme.bgPrimary)
                .then(if (modern) Modifier.windowInsetsPadding(WindowInsets.displayCutout) else Modifier),
        ) {
            val path = paths[tab].orEmpty()
            val top = path.lastOrNull()
            val chatOpen = top is Route.Room || top is Route.Chat || top is Route.Thread
            val callBar: @Composable () -> Unit = {
                CallBar(
                    onClick = {
                        val room = calls.room
                        if (room?.isDirect == true) calls.showCallScreen = true else room?.let { show(it.id) }
                    },
                    modifier = Modifier.padding(horizontal = WZ.Space.space6),
                )
            }
            if (modern) {
                var dockInset by remember { mutableStateOf(0.dp) }
                val selectedSpaceId = (top as? Route.Space)?.id
                val homeSelected = selectedSpaceId == null && tab != Tab.me
                val inboxBadge = roomList.mentionRooms.isNotEmpty() || roomList.invites.isNotEmpty()
                // Chats and the You screen take the whole screen: no rail, no dock. The rail and dock come and go
                // around the content, which stays composed in one place so its push and pop slides keep running
                val showShell = !chatOpen && tab != Tab.me
                val contentInset = if (showShell) dockInset else 0.dp
                Row(Modifier.fillMaxSize()) {
                    Row(Modifier.fillMaxHeight()) {
                        if (showShell) {
                            SpaceRailBar(
                                roomList,
                                selectedSpaceId = selectedSpaceId,
                                homeSelected = homeSelected,
                                onHome = {
                                    select(Tab.home)
                                    RailSelectionStore.save(context, null)
                                },
                                onSpace = ::showSpace,
                                onCreateSpace = { showCreateSpace = true },
                                onExplore = { showExplore = true },
                                bottomInset = dockInset,
                                listState = railListState,
                            )
                            Box(Modifier.width(1.dp).fillMaxHeight().background(theme.border))
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        CompositionLocalProvider(LocalBottomBarInset provides contentInset) {
                            Box(Modifier.weight(1f)) {
                                stateHolder.SaveableStateProvider(tab) {
                                    TabContent(
                                        tab,
                                        path,
                                        roomList,
                                        onOpenInbox = { showInbox = true },
                                        onCreateSpace = { showCreateSpace = true },
                                        onExplore = { showExplore = true },
                                        onCloseYou = ::closeYou,
                                    )
                                }
                            }
                        }
                    }
                }
                if (showShell) {
                    ModernDock(
                        Modifier.align(Alignment.BottomCenter),
                        keyboardVisible = keyboardVisible,
                        inboxBadge = inboxBadge,
                        inboxMention = roomList.mentionRooms.isNotEmpty(),
                        onProfile = { ownProfile = true },
                        onInbox = { showInbox = true },
                        onInset = { dockInset = it },
                    ) {
                        AnimatedVisibility(showsCallBar(tab), enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                            Box(Modifier.padding(bottom = WZ.Space.space2)) { callBar() }
                        }
                    }
                } else {
                    Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = WZ.Space.space1)) {
                        AnimatedVisibility(showsCallBar(tab), enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                            callBar()
                        }
                    }
                }
            } else {
                val inset = (if (showsIsland(tab)) islandHeight else 0.dp) + (if (showsCallBar(tab)) callBarHeight else 0.dp)
                CompositionLocalProvider(LocalBottomBarInset provides inset) {
                    stateHolder.SaveableStateProvider(tab) {
                        TabContent(
                            tab,
                            path,
                            roomList,
                            onOpenInbox = { showInbox = true },
                            onCreateSpace = { showCreateSpace = true },
                            onExplore = { showExplore = true },
                        )
                    }
                }

                Column(
                    Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = WZ.Space.space1),
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                ) {
                    AnimatedVisibility(showsCallBar(tab), enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                        callBar()
                    }
                    AnimatedVisibility(showsIsland(tab), enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                        TabIsland(roomList, tab, ::select, Modifier.padding(horizontal = WZ.Space.space6))
                    }
                }
            }

            session.userId?.takeIf { ownProfile }?.let { userId ->
                OwnProfilePage(userId, onClose = { ownProfile = false }, onOpenSettings = {
                    ownProfile = false
                    openYou()
                })
            }
            Column(
                Modifier.align(Alignment.TopCenter).statusBarsPadding(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                ConnectionBanner(Modifier.padding(top = WZ.Space.space1))
                CopyToastView(Modifier.padding(top = WZ.Space.space2))
                IncomingCallBanner(Modifier.padding(top = WZ.Space.space2))
                CallErrorBanner(Modifier.padding(top = WZ.Space.space2))
                org.wizardchat.android.ui.voice.AloneNotice(Modifier.padding(top = WZ.Space.space2), show = !calls.showCallScreen)
            }
        }

        if (calls.showCallScreen) DMCallScreen(onDismiss = { calls.showCallScreen = false })
        whatsNew?.let { entry ->
            org.wizardchat.android.ui.settings.WhatsNewSheet(entry) {
                org.wizardchat.android.ui.settings.WhatsNew.markSeen(context, entry)
                whatsNew = null
            }
        }
        if (showInbox) InboxSheet(roomList, { showInbox = false }, onOpenRoom = ::show, onOpenSpace = ::showSpace)
        if (showCreateSpace) CreateSpaceSheet({ showCreateSpace = false }, onCreated = ::showSpace)
        if (showExplore) {
            ExploreSheet(roomList, { showExplore = false }) { roomId ->
                if (roomList.room(roomId) != null) show(roomId) else showSpace(roomId)
            }
        }
        VerificationRequests.shared.presented?.let { model ->
            VerificationSheet(model) { VerificationRequests.shared.presented = null }
        }
    }
}

private fun Route?.isChatRoute() = this is Route.Room || this is Route.Chat || this is Route.Thread

@Composable
private fun TabContent(
    tab: Tab,
    path: List<Route>,
    roomList: RoomListModel,
    onOpenInbox: () -> Unit,
    onCreateSpace: () -> Unit,
    onExplore: () -> Unit,
    onCloseYou: () -> Unit = {},
) {
    val modernHeader = LocalPrefs.current.navigationStyle == NavigationStyle.rail
    if (tab == Tab.me) {
        // Modern has no rail to go back to, so the You screen gets a Done button
        if (modernHeader) SettingsScreen(isTab = false, onDismiss = onCloseYou) else SettingsScreen(isTab = true)
        return
    }
    val navigator = LocalNavigator.current
    val stateHolder = rememberSaveableStateHolder()
    AnimatedContent(
        targetState = path,
        transitionSpec = {
            val chat = initialState.lastOrNull().isChatRoute() || targetState.lastOrNull().isChatRoute()
            when {
                // Rail switches swap in place; only moving into or out of a chat slides
                modernHeader && !chat -> fadeIn(tween(120)) togetherWith fadeOut(tween(120))
                targetState.size >= initialState.size -> slideInHorizontally { it } togetherWith slideOutHorizontally { -it / 3 }
                else -> slideInHorizontally { -it / 3 } togetherWith slideOutHorizontally { it }
            }
        },
        contentKey = { it.size to it.lastOrNull() },
        label = "navigation",
    ) { stack ->
        val route = stack.lastOrNull()
        val key = route?.toString() ?: "root-$tab"
        stateHolder.SaveableStateProvider(key) {
            val previous = stack.getOrNull(stack.lastIndex - 1)
            val isChat = route is Route.Room || route is Route.Chat || route is Route.Thread
            if (isChat) {
                SwipeBack(
                    onBack = navigator.pop,
                    underlay = {
                        stateHolder.SaveableStateProvider("peek-$tab-$key") {
                            RouteView(tab, previous, roomList, onOpenInbox, onCreateSpace, onExplore, modernHeader)
                        }
                    },
                ) {
                    RouteView(tab, route, roomList, onOpenInbox, onCreateSpace, onExplore, modernHeader)
                }
            } else {
                RouteView(tab, route, roomList, onOpenInbox, onCreateSpace, onExplore, modernHeader)
            }
        }
    }
}

@Composable
private fun RouteView(
    tab: Tab,
    route: Route?,
    roomList: RoomListModel,
    onOpenInbox: () -> Unit,
    onCreateSpace: () -> Unit,
    onExplore: () -> Unit,
    modernHeader: Boolean,
) {
    val navigator = LocalNavigator.current
    when (route) {
        null -> when (tab) {
            Tab.home -> RoomListScreen(roomList, SidebarSelection.Home, onOpenInbox, onCreateSpace, onExplore, modernHeader)
            Tab.dms -> RoomListScreen(roomList, SidebarSelection.Dms, onOpenInbox, modernHeader = modernHeader)
            else -> SpacesScreen(roomList, onCreateSpace = onCreateSpace, onExplore = onExplore)
        }
        is Route.Space -> RoomListScreen(roomList, SidebarSelection.Space(route.id), null, modernHeader = modernHeader)
        is Route.Room, is Route.Chat -> {
            val id = if (route is Route.Room) route.id else (route as Route.Chat).id
            val room = roomList.room(id)
            when {
                room == null -> Box(Modifier.fillMaxSize().background(theme.bgPrimary), contentAlignment = Alignment.Center) { Spinner() }
                room.isVoice && route is Route.Room -> VoiceRoomScreen(room, onBack = navigator.pop, onOpenChat = { navigator.push(Route.Chat(id)) })
                else -> RoomScreen(room, roomList.client, onBack = navigator.pop)
            }
        }
        is Route.Thread -> {
            val room = roomList.room(route.roomId)
            if (room == null) {
                Box(Modifier.fillMaxSize().background(theme.bgPrimary), contentAlignment = Alignment.Center) { Spinner() }
            } else {
                RoomScreen(room, roomList.client, onBack = navigator.pop, threadRoot = route.rootEventId)
            }
        }
    }
}

@Composable
private fun TabIsland(roomList: RoomListModel, selected: Tab, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    val session = LocalSession.current
    val prefs = LocalPrefs.current
    val spacesUnread = roomList.spaces.fold(UnreadState()) { state, space ->
        val unread = roomList.unreadState(SidebarSelection.Space(space.id))
        UnreadState(state.unread || unread.unread, state.mention || unread.mention)
    }
    Surface(modifier.fillMaxWidth(), shape = CircleShape, color = theme.bgTertiary.copy(alpha = 0.96f), shadowElevation = 8.dp) {
        Row(Modifier.padding(WZ.Space.space2)) {
            TabItem(Tab.home, selected, tr("nav.home"), "house", roomList.unreadState(SidebarSelection.Home), onSelect)
            TabItem(Tab.dms, selected, tr("search.switcher.prefixDms"), "chat-circle", roomList.unreadState(SidebarSelection.Dms), onSelect)
            TabItem(Tab.spaces, selected, tr("room.settings.permissions.groups.spaces"), "stack", spacesUnread, onSelect)
            val isSelected = selected == Tab.me
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = WZ.Space.space11)
                    .clip(CircleShape)
                    .background(if (isSelected) theme.accent.copy(alpha = 0.14f) else androidx.compose.ui.graphics.Color.Transparent)
                    .clickable { onSelect(Tab.me) }
                    .padding(vertical = WZ.Space.space2),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
            ) {
                org.wizardchat.android.ui.cosmetics.CosmeticAvatar(
                    session.userId,
                    session.displayName ?: session.userId ?: "",
                    session.avatarUrl,
                    WZ.SizeAvatar.sm,
                    modifier = Modifier.border(WZ.BorderWidth.thick, if (isSelected) theme.accent else androidx.compose.ui.graphics.Color.Transparent, CircleShape),
                    presence = prefs.presenceChoice.presence(true).name,
                )
                Text(tr("nav.you"), style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold), color = if (isSelected) theme.accent else theme.textMuted)
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabItem(
    tab: Tab,
    selected: Tab,
    title: String,
    icon: String,
    unread: UnreadState,
    onSelect: (Tab) -> Unit,
) {
    val isSelected = selected == tab
    val color = if (isSelected) theme.accent else theme.textMuted
    Column(
        Modifier
            .weight(1f)
            .heightIn(min = WZ.Space.space11)
            .clip(CircleShape)
            .background(if (isSelected) theme.accent.copy(alpha = 0.14f) else androidx.compose.ui.graphics.Color.Transparent)
            .clickable { onSelect(tab) }
            .padding(vertical = WZ.Space.space2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
    ) {
        Box {
            PhIcon(icon, if (isSelected) PhWeight.fill else PhWeight.regular, size = WZ.SizeIcon.lg, tint = color)
            if (unread.unread) UnreadDot(unread.mention, Modifier.align(Alignment.TopEnd).offset(x = WZ.Space.space3))
        }
        Text(title, style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold), color = color, maxLines = 1)
    }
}

