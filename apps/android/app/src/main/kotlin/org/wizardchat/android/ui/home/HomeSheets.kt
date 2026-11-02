package org.wizardchat.android.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.SidebarSelection
import org.wizardchat.android.matrix.UnreadState
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.CreateRoomOptions
import org.wizardchat.core.SpaceSummary
import org.wizardchat.tokens.WZ

/** The Spaces tab: a grid of the joined spaces, plus "Create or join" and "Explore" */
@Composable
fun SpacesScreen(roomList: RoomListModel, onCreateSpace: () -> Unit, onExplore: () -> Unit) {
    val navigator = LocalNavigator.current
    var search by remember { mutableStateOf("") }
    val spaces = if (search.isEmpty()) roomList.spaces else roomList.spaces.filter { it.name.contains(search, ignoreCase = true) }

    Column(Modifier.fillMaxSize().background(theme.bgPrimary)) {
        WizardTopBar(tr("room.settings.permissions.groups.spaces"), large = true)
        WizardTextField(
            search,
            { search = it },
            tr("common.search"),
            Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        )
        LazyVerticalGrid(
            GridCells.Adaptive(92.dp),
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = WZ.Space.space6,
                end = WZ.Space.space6,
                top = WZ.Space.space4,
                bottom = LocalBottomBarInset.current + WZ.Space.space6,
            ),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space7),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space6),
        ) {
            items(spaces, key = { it.id }) { space ->
                SpaceGridItem(space, roomList.unreadState(SidebarSelection.Space(space.id))) {
                    navigator.push(Route.Space(space.id))
                }
            }
            if (search.isEmpty()) {
                item(key = "create") {
                    SpaceTile(tr("home.createOrJoin"), UnreadState(), Modifier.clickable(onClick = onCreateSpace)) { ActionIcon("plus") }
                }
                item(key = "explore") {
                    SpaceTile(tr("explore.title"), UnreadState(), Modifier.clickable(onClick = onExplore)) { ActionIcon("compass") }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SpaceGridItem(space: SpaceSummary, unread: UnreadState, onOpen: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    Box {
        SpaceTile(space.name, unread, Modifier.combinedClickable(onClick = onOpen, onLongClick = { menuOpen = true })) {
            Avatar(space.name, space.avatarUrl, WZ.SizeAvatar.xl, cornerRadius = WZ.Radius.xl)
        }
        WizardMenu(
            menuOpen,
            { menuOpen = false },
            listOf(
                MenuItem(tr("common.copyLink"), "link-simple") {
                    copyToClipboard("https://matrix.to/#/${space.id}", L10n.format("timeline.linkCopied"))
                },
            ),
        )
    }
}

@Composable
private fun ActionIcon(name: String) {
    Box(
        Modifier
            .size(WZ.SizeAvatar.xl)
            .clip(RoundedCornerShape(WZ.Radius.xl))
            .background(theme.fill),
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(name, size = WZ.SizeIcon.xl, tint = theme.accent)
    }
}

@Composable
private fun SpaceTile(name: String, unread: UnreadState, modifier: Modifier = Modifier, icon: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box {
            icon()
            if (unread.unread) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = WZ.Space.space2, y = -WZ.Space.space2)
                        .size(WZ.Space.space6)
                        .clip(CircleShape)
                        .background(if (unread.mention) theme.mention else theme.accent)
                        .border(WZ.BorderWidth.thick, theme.bgPrimary, CircleShape),
                )
            }
        }
        Text(
            name,
            style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
            color = theme.textPrimary,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private enum class CreateSpaceMode { choose, create, join }

/** Create a new space or join one by address */
@Composable
fun CreateSpaceSheet(onDismiss: () -> Unit, onCreated: (String) -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf(CreateSpaceMode.choose) }
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var isPublic by remember { mutableStateOf(false) }
    var joinTarget by remember { mutableStateOf("") }
    var isWorking by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    fun create() {
        scope.launch {
            isWorking = true
            errorMessage = null
            try {
                val trimmedTopic = topic.trim()
                val spaceId = session.requireClient.createRoom(
                    CreateRoomOptions(name = name.trim(), topic = trimmedTopic.ifEmpty { null }, isPublic = isPublic, isSpace = true),
                )
                onCreated(spaceId)
                onDismiss()
            } catch (e: Exception) {
                errorMessage = L10n.format("space.failedToCreateSpace", e.message ?: e.toString())
            } finally {
                isWorking = false
            }
        }
    }

    fun join() {
        scope.launch {
            isWorking = true
            errorMessage = null
            try {
                val spaceId = session.joinTarget(joinTarget)
                onCreated(spaceId)
                onDismiss()
            } catch (e: Exception) {
                errorMessage = L10n.format("explore.failedToJoin", e.message ?: e.toString())
            } finally {
                isWorking = false
            }
        }
    }

    val title = when (mode) {
        CreateSpaceMode.choose -> tr("space.addASpace")
        CreateSpaceMode.create -> tr("room.space.create.title")
        CreateSpaceMode.join -> tr("room.space.join.title")
    }

    WizardSheet(onDismiss) {
        SheetTopBar(
            title,
            leading = {
                if (mode == CreateSpaceMode.choose) {
                    BarTextButton(tr("common.cancel"), onDismiss)
                } else {
                    BarTextButton(tr("common.back"), {
                        errorMessage = null
                        mode = CreateSpaceMode.choose
                    })
                }
            },
        )
        Column(
            Modifier
                .fillMaxWidth()
                .background(theme.bgSecondary)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(WZ.Space.space6),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
        ) {
            when (mode) {
                CreateSpaceMode.choose -> Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
                    Choice("plus-circle", tr("room.space.create.title"), tr("space.groupRoomsTogetherFor")) { mode = CreateSpaceMode.create }
                    Choice("arrow-circle-right", tr("room.space.join.title"), tr("space.joinWithASpace")) { mode = CreateSpaceMode.join }
                }
                CreateSpaceMode.create -> {
                    Field(tr("room.space.name")) { WizardTextField(name, { name = it }, tr("space.mySpace")) }
                    Field(tr("dialogs.topic")) { WizardTextField(topic, { topic = it }, tr("space.whatIsThisSpace")) }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                            Text(tr("room.space.create.public"), style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
                            Text(tr("room.space.create.publicNote"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                        }
                        Switch(
                            isPublic,
                            { isPublic = it },
                            colors = SwitchDefaults.colors(checkedTrackColor = theme.accent, checkedThumbColor = theme.textOnAccent),
                        )
                    }
                    PrimaryButton(
                        if (isWorking) tr("space.creating") else tr("common.create"),
                        ::create,
                        enabled = !isWorking && name.isNotBlank(),
                    )
                }
                CreateSpaceMode.join -> {
                    Field(tr("room.space.join.spaceId")) {
                        WizardTextField(
                            joinTarget,
                            { joinTarget = it },
                            "#spacename:server.org",
                            keyboardType = KeyboardType.Uri,
                            onSubmit = { if (!isWorking && joinTarget.isNotBlank()) join() },
                        )
                    }
                    PrimaryButton(
                        if (isWorking) tr("explore.joining") else tr("common.join"),
                        ::join,
                        enabled = !isWorking && joinTarget.isNotBlank(),
                    )
                }
            }
            errorMessage?.let { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.error) }
        }
    }
}

@Composable
private fun Choice(icon: String, title: String, note: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(WZ.Radius.md))
            .background(theme.bgPrimary)
            .border(1.dp, theme.border, RoundedCornerShape(WZ.Radius.md))
            .clickable(onClick = onClick)
            .padding(WZ.Space.space5),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Box(
            Modifier.size(WZ.Space.space10).clip(RoundedCornerShape(WZ.Radius.md)).background(theme.bgTertiary),
            contentAlignment = Alignment.Center,
        ) {
            PhIcon(icon, size = WZ.SizeIcon.lg, tint = theme.accent)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(title, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
            Text(note, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }
        PhIcon("caret-right", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textMuted)
    }
}

@Composable
private fun Field(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        Text(label, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
        content()
    }
}
