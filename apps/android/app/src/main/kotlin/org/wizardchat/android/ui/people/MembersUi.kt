package org.wizardchat.android.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.zIndex
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.ExtendedProfile
import org.wizardchat.android.matrix.ProfileFields
import org.wizardchat.android.matrix.ignore
import org.wizardchat.android.matrix.profile
import org.wizardchat.android.matrix.startDirectMessage
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.SecondaryButton
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.android.ui.space.rememberRoomRoles
import org.wizardchat.core.HomeserverSoftware
import org.wizardchat.core.Member
import org.wizardchat.core.MemberEntry
import org.wizardchat.tokens.WZ

/** A room's members grouped by role (a page inside room info or space settings) */
@Composable
internal fun MembersScreen(roomId: String, onBack: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var members by remember { mutableStateOf(listOf<Member>()) }
    var loaded by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<String?>(null) }
    var showInvite by remember { mutableStateOf(false) }
    var canInvite by remember { mutableStateOf(false) }
    var canKick by remember { mutableStateOf(false) }
    var knockers by remember { mutableStateOf(listOf<MemberEntry>()) }
    var knockError by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        val client = session.client ?: return
        members = runCatching { client.members(roomId) }.getOrDefault(emptyList())
        val permissions = runCatching { client.roomDetails(roomId) }.getOrNull()?.permissions
        canInvite = permissions?.invite ?: false
        canKick = permissions?.kick ?: false
        knockers = if (canInvite || canKick) runCatching { client.membersInState(roomId, "knock") }.getOrDefault(emptyList()) else emptyList()
        loaded = true
    }
    LaunchedEffect(roomId) { load() }

    // Filtering and sorting thousands of members happens when the list or the search changes, not on every recomposition
    val roomRoles = rememberRoomRoles(roomId)
    val management = rememberRoleManagement(roomId)
    var assigning by remember { mutableStateOf<Member?>(null) }
    val groups = remember(members, search, roomRoles) {
        val filtered = if (search.isEmpty()) {
            members
        } else {
            members.filter { (it.displayName ?: "").contains(search, ignoreCase = true) || it.userId.contains(search, ignoreCase = true) }
        }
        val joined = filtered.filter { !it.isInvite }
        fun role(member: Member) = if (member.level >= 100) 0 else if (member.level >= 50) 1 else 2
        fun sorted(list: List<Member>) = list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
        val builtin = roomRoles.roles.builtin
        // Roles marked "show separately" get their own heading above the power level groups, in the order of the roles
        val hoisted = roomRoles.roles.roles.filter { it.hoist }
        val placed = mutableSetOf<String>()
        val separate = hoisted.map { role ->
            val people = joined.filter { it.userId !in placed && roomRoles.roles.byUser[it.userId]?.any { held -> held.id == role.id } == true }
            placed += people.map { it.userId }
            Triple("role-${role.id}", role.name, sorted(people))
        }
        val rest = joined.filter { it.userId !in placed }
        (separate + listOf(
            Triple("room.members.admins", builtin[SpaceModern.Builtin.Admin]?.name ?: L10n.format("room.members.admins"), sorted(rest.filter { role(it) == 0 })),
            Triple("room.members.moderators", builtin[SpaceModern.Builtin.Moderator]?.name ?: L10n.format("room.members.moderators"), sorted(rest.filter { role(it) == 1 })),
            Triple("common.members", builtin[SpaceModern.Builtin.Member]?.name ?: L10n.format("common.members"), sorted(rest.filter { role(it) == 2 })),
            Triple("room.members.invited", L10n.format("room.members.invited"), sorted(filtered.filter { it.isInvite })),
        )).filter { it.third.isNotEmpty() }
    }

    SheetPage {
        WizardTopBar(tr("common.members"), onBack = onBack)
        WizardTextField(
            search,
            { search = it },
            tr("room.settings.members.searchMembers"),
            Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
        )
        Box(Modifier.weight(1f)) {
            FormList {
                if (canInvite) {
                    item {
                        GroupedSection {
                            ActionRow(tr("room.members.invite"), "user-plus", { showInvite = true })
                        }
                    }
                }
                if (knockers.isNotEmpty()) {
                    lazyGroupedSection("knock", "${L10n.format("room.members.pending")}  ${knockers.size}", knockers, { it.userId }) { knocker ->
                        PersonRow(knocker.displayName, knocker.userId, knocker.avatarUrl, { selected = knocker.userId }) {
                            if (canKick) {
                                org.wizardchat.android.ui.BarButton("x-circle", tr("room.members.reject"), {
                                    scope.launch {
                                        try {
                                            session.requireClient.rejectKnock(roomId, knocker.userId)
                                            load()
                                        } catch (e: Exception) {
                                            knockError = L10n.format("room.members.rejectFailed", errorText(e))
                                        }
                                    }
                                }, tint = theme.danger, size = WZ.SizeIcon.md)
                            }
                            if (canInvite) {
                                org.wizardchat.android.ui.BarButton("check", tr("common.accept"), {
                                    scope.launch {
                                        try {
                                            session.requireClient.acceptKnock(roomId, knocker.userId)
                                            load()
                                        } catch (e: Exception) {
                                            knockError = errorText(e)
                                        }
                                    }
                                }, tint = theme.accent, size = WZ.SizeIcon.md)
                            }
                        }
                    }
                    item { ErrorText(knockError) }
                }
                groups.forEach { (id, title, list) ->
                    lazyGroupedSection(id, "$title  ${list.size}", list, { it.userId }) { member ->
                        MemberRow(
                            member,
                            roomRoles.colorOf(member.userId),
                            onAssign = if (management.canManage && management.modern && management.roles.roles.isNotEmpty() && !member.isInvite) ({ assigning = member }) else null,
                        ) { selected = member.userId }
                    }
                }
            }
            if (!loaded) Spinner(Modifier.align(Alignment.Center))
        }
    }

    assigning?.let { member ->
        AssignRolesDialog(roomId, member.userId, member.name, management) { assigning = null }
    }
    selected?.let { userId ->
        UserProfileSheet(userId, roomId, onDismiss = { selected = null }, onChanged = { scope.launch { load() } })
    }
    if (showInvite) {
        UserPickerSheet(UserPickerMode.Invite, { showInvite = false }, roomId, onDone = { scope.launch { load() } })
    }
}

@Composable
private fun MemberRow(member: Member, nameColor: androidx.compose.ui.graphics.Color?, onAssign: (() -> Unit)? = null, onClick: () -> Unit) {
    PersonRow(member.displayName, member.userId, member.avatarUrl, onClick, nameColor = nameColor) {
        RoleBadge(member.level)
        if (onAssign != null) {
            org.wizardchat.android.ui.BarButton("plus", tr("room.settings.roles.assign"), onAssign, size = WZ.SizeIcon.md)
        }
    }
}

private enum class ProfileAction { Kick, Ban, Ignore }

/**
 * A user's profile and actions. [fullScreen] shows the same content as a page with no sheet handle or bar,
 * for a host that is a full-screen route and provides its own back navigation.
 */
@Composable
fun UserProfileSheet(
    userId: String,
    roomId: String?,
    onDismiss: () -> Unit,
    onChanged: () -> Unit = {},
    onOpenSettings: (() -> Unit)? = null,
    fullScreen: Boolean = false,
) {
    val session = LocalSession.current
    val prefs = LocalPrefs.current
    val navigator = LocalNavigator.current
    val closeParents = LocalCloseParents.current
    val scope = rememberCoroutineScope()
    var extended by remember { mutableStateOf(ExtendedProfile()) }
    var software by remember { mutableStateOf<HomeserverSoftware?>(null) }
    var name by remember { mutableStateOf<String?>(null) }
    var avatarUrl by remember { mutableStateOf<String?>(null) }
    var statusText by remember { mutableStateOf<String?>(null) }
    var presenceState by remember { mutableStateOf<String?>(null) }
    var rights by remember { mutableStateOf(RoleRights(0, false)) }
    var level by remember { mutableStateOf(0L) }
    var isMember by remember { mutableStateOf(false) }
    var canKick by remember { mutableStateOf(false) }
    var canBan by remember { mutableStateOf(false) }
    var canInviteHere by remember { mutableStateOf(false) }
    var canReject by remember { mutableStateOf(false) }
    var knocking by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<ProfileAction?>(null) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reloads by remember { mutableIntStateOf(0) }
    val isMe = userId == session.userId
    var tab by remember { mutableStateOf(ProfileTab.Details) }
    var modMenu by remember { mutableStateOf(false) }
    val mutual = rememberMutualRooms(userId, enabled = !isMe)
    val dmRoom = session.roomList?.joinedRooms?.firstOrNull { it.isDirect && it.dmUserId == userId }

    LaunchedEffect(userId, roomId, reloads) {
        val client = session.client
        val member = if (roomId != null && client != null) {
            runCatching { client.members(roomId) }.getOrNull()?.firstOrNull { it.userId == userId }
        } else {
            null
        }
        if (roomId != null && client != null && member != null) {
            name = member.displayName
            avatarUrl = member.avatarUrl
            level = member.level
            isMember = true
            rights = RoleRights.load(client, roomId)
            if (!isMe) {
                runCatching { client.roomDetails(roomId) }.getOrNull()?.permissions?.let { permissions ->
                    canKick = permissions.kick && level < rights.ownLevel
                    canBan = permissions.ban && level < rights.ownLevel
                }
            }
        }
        if (roomId != null && client != null && !isMe) {
            knocking = runCatching { client.membersInState(roomId, "knock") }.getOrNull()?.any { it.userId == userId } == true
            if (knocking) {
                runCatching { client.roomDetails(roomId) }.getOrNull()?.permissions?.let {
                    canInviteHere = it.invite
                    canReject = it.kick
                }
            }
        }
        // The whole profile in one request; a server without extended profiles just has nothing extra
        client?.let { c -> runCatching { c.profileFields(userId) }.getOrNull() }?.let { extended = ProfileFields.parse(it) }
        presenceState = client?.let { c -> runCatching { c.presence(userId) }.getOrNull() }?.state?.name
        run {
            session.profile(userId)?.let { profile ->
                name = name ?: profile.displayName
                avatarUrl = avatarUrl ?: profile.avatarUrl
                statusText = profile.customStatus?.takeIf { (it.expiresAt ?: Long.MAX_VALUE) > System.currentTimeMillis() }?.text
            }
        }
    }

    LaunchedEffect(userId, prefs.showHomeserverSoftware) {
        software = null
        if (!prefs.showHomeserverSoftware) return@LaunchedEffect
        val server = ProfileFields.serverNameOf(userId).ifEmpty { return@LaunchedEffect }
        software = session.client?.let { c -> runCatching { c.homeserverSoftware(server) }.getOrNull() }
    }

    fun message() {
        scope.launch {
            busy = true
            try {
                val room = session.startDirectMessage(userId)
                onDismiss()
                closeParents()
                navigator.openRoom(room)
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                busy = false
            }
        }
    }

    fun call() {
        val room = dmRoom ?: return
        val calls = CallManager.shared
        onDismiss()
        closeParents()
        calls.showCallScreen = true
        if (!calls.isInCall(room.id)) calls.launchJoin(room, session, "audio", ring = true)
    }

    fun answerKnock(accept: Boolean) {
        val roomId = roomId ?: return
        scope.launch {
            busy = true
            try {
                if (accept) session.requireClient.acceptKnock(roomId, userId) else session.requireClient.rejectKnock(roomId, userId)
                onChanged()
                onDismiss()
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                busy = false
            }
        }
    }

    fun perform(action: ProfileAction) {
        val why = reason.ifEmpty { null }
        reason = ""
        scope.launch {
            try {
                when (action) {
                    ProfileAction.Kick -> if (roomId != null) session.requireClient.kick(roomId, userId, why)
                    ProfileAction.Ban -> if (roomId != null) session.requireClient.ban(roomId, userId, why)
                    ProfileAction.Ignore -> session.ignore(userId)
                }
                onChanged()
                onDismiss()
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    val body: @Composable ColumnScope.() -> Unit = {
        val cosmetics = org.wizardchat.android.ui.cosmetics.resolveCosmetics(extended)
        val moderation = buildList {
            if (!isMe) {
                if (canKick) add(MenuItem(tr("profile.kick"), "user-minus", destructive = true) { confirm = ProfileAction.Kick })
                if (canBan) add(MenuItem(tr("room.members.ban"), "prohibit", destructive = true) { confirm = ProfileAction.Ban })
                add(MenuItem(tr("profile.ignoreUser"), "eye-slash", destructive = true) { confirm = ProfileAction.Ignore })
            }
        }
        val menuItems = listOf(
            MenuItem(tr("profile.copyId"), "copy") { copyToClipboard(userId, L10n.format("common.copied")) },
            MenuItem(tr("common.copyLink"), "link-simple") { copyToClipboard("https://matrix.to/#/$userId", L10n.format("common.copied")) },
        ) + moderation.mapIndexed { index, item -> if (index == 0) item.copy(divider = true) else item }
        val pronouns = extended.pronouns.joinToString(", ")
        val identity = listOf(userId, pronouns).filter { it.isNotEmpty() }.joinToString(" • ")
        val mutualLine = mutual?.let { found ->
            if (found.isEmpty) {
                tr("profile.mutualEmpty")
            } else {
                listOfNotNull(
                    if (found.rooms.isNotEmpty()) trPlural("profile.mutualRooms", found.rooms.size, found.rooms.size) else null,
                    if (found.spaces.isNotEmpty()) trPlural("profile.mutualSpaces", found.spaces.size, found.spaces.size) else null,
                ).joinToString(" · ")
            }
        }
        FormList {
            item {
                org.wizardchat.android.ui.cosmetics.FrameBox(cosmetics?.frame.orEmpty(), Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth()) {
                        // Above the nameplate, so the lower half of the avatar that overlaps it is not washed out
                        Box(Modifier.fillMaxWidth().zIndex(1f)) {
                            Box(Modifier.fillMaxWidth().aspectRatio(BANNER_RATIO).background(theme.fill)) {
                                ProfileBanner(userId)
                                org.wizardchat.android.ui.cosmetics.EffectOverlay(
                                    cosmetics?.effect,
                                    org.wizardchat.android.ui.cosmetics.rememberEffectIntro(cosmetics?.effect),
                                    Modifier.matchParentSize(),
                                )
                            }
                            ProfileMenuButton(
                                modMenu,
                                { modMenu = it },
                                menuItems,
                                Modifier.align(Alignment.TopEnd).padding(WZ.Space.space3),
                            )
                            Box(
                                Modifier.align(Alignment.BottomStart).padding(start = WZ.Space.space6).offset(y = WZ.SizeAvatar.xl / 2),
                                contentAlignment = Alignment.BottomEnd,
                            ) {
                                AccentAvatar(name ?: userId, avatarUrl, extended.accent, cosmetics?.decoration)
                                if (prefs.showPresence) {
                                    org.wizardchat.android.ui.cosmetics.PresenceDot(
                                        ProfileFields.effectiveDotPresence(
                                            presenceState,
                                            ProfileFields.activeStatus(extended.status)?.mode,
                                        ),
                                        WZ.SizeAvatar.xl,
                                        Modifier.padding(WZ.Space.space2),
                                    )
                                }
                            }
                        }
                        org.wizardchat.android.ui.cosmetics.NameplateBox(cosmetics?.nameplate, Modifier.fillMaxWidth()) {
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(
                                        start = WZ.Space.space6,
                                        end = WZ.Space.space6,
                                        top = WZ.SizeAvatar.xl / 2 + WZ.Space.space3,
                                        bottom = WZ.Space.space4,
                                    ),
                                verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                            ) {
                                Text(
                                    name ?: userId,
                                    style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold),
                                    color = theme.textPrimary,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                                    Text(
                                        identity,
                                        Modifier.weight(1f, fill = false),
                                        style = wizardFont(WZ.FontSize.md),
                                        color = theme.textMuted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (isMember) RoleBadge(level)
                                }
                                statusText?.let {
                                    Text(it, style = wizardFont(WZ.FontSize.md), color = theme.textSecondary)
                                }
                                ProfileBadges(extended.isMudrixUser, software)
                                mutualLine?.let {
                                    Text(
                                        it,
                                        Modifier.clickable { tab = ProfileTab.Mutual },
                                        style = wizardFont(WZ.FontSize.md, FontWeight.Medium),
                                        color = theme.accent,
                                    )
                                }
                                if (!isMe) {
                                    Row(Modifier.fillMaxWidth().padding(top = WZ.Space.space1), horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                                        ProfileActionButton(tr("profile.message"), ::message, Modifier.weight(1f), enabled = !busy)
                                        if (dmRoom != null) ProfileActionButton(tr("timeline.voiceCall"), ::call, Modifier.weight(1f), enabled = !busy)
                                    }
                                }
                                if (isMe && onOpenSettings != null) {
                                    SecondaryButton(tr("common.settings"), onOpenSettings, Modifier.padding(top = WZ.Space.space1))
                                }
                            }
                        }
                    }
                }
            }
            item { ProfileTabs(tab, if (mutual == null) 0 else mutual.rooms.size + mutual.spaces.size) { tab = it } }
            when (tab) {
                ProfileTab.Details -> {
                    item { Column(Modifier.padding(horizontal = WZ.Space.space6)) { ProfileAbout(extended, name ?: userId) } }
                    if (roomId != null && isMember && rights.canChange(level, isMe)) {
                        item {
                            GroupedSection {
                                RoleMenu(roomId, userId, level, rights) {
                                    reloads++
                                    onChanged()
                                }
                            }
                        }
                    }
                    if (extended.timezone != null) {
                        item {
                            GroupedSection {
                                Box(Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)) {
                                    ProfileLocalTime(extended)
                                }
                            }
                        }
                    }
                    if (!isMe) item { ProfileVerification(userId) }
                    if (!isMe) item { ProfileNote(userId) }
                    if (roomId != null && knocking && (canInviteHere || canReject)) {
                        item {
                            GroupedSection(header = tr("room.members.pending")) {
                                if (canInviteHere) {
                                    ActionRow(tr("common.accept"), "check", {
                                        answerKnock(true)
                                    }, enabled = !busy)
                                }
                                if (canInviteHere && canReject) RowDivider()
                                if (canReject) {
                                    ActionRow(tr("room.members.reject"), "x-circle", {
                                        answerKnock(false)
                                    }, theme.danger, enabled = !busy)
                                }
                            }
                        }
                    }
                }
                ProfileTab.Activity -> item { Column(Modifier.padding(horizontal = WZ.Space.space6)) { ProfileActivities(ProfileFields.live(extended.activities)) } }
                ProfileTab.Mutual -> item {
                    MutualRoomsList(mutual) { entry, isSpace ->
                        onDismiss()
                        closeParents()
                        if (isSpace) navigator.openSpace(entry.id) else navigator.openRoom(entry.id)
                    }
                }
            }
            item { ErrorText(error) }
        }
    }
    if (fullScreen) {
        SheetPage(body)
    } else {
        WizardSheet(onDismiss) {
            SheetBar("", trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) })
            body()
        }
    }

    confirm?.let { action ->
        val who = name ?: userId
        val title = when (action) {
            ProfileAction.Kick -> L10n.format("room.members.removeConfirm", who)
            ProfileAction.Ban -> L10n.format("room.members.banConfirm", who)
            ProfileAction.Ignore -> L10n.format("room.members.ignoreConfirm", who)
        }
        val label = when (action) {
            ProfileAction.Kick -> tr("common.remove")
            ProfileAction.Ban -> tr("room.members.ban")
            ProfileAction.Ignore -> tr("profile.ignoreUser")
        }
        TextFieldDialog(
            title,
            reason,
            { reason = it },
            tr("common.reasonOptional"),
            label,
            onConfirm = { perform(action) },
            onDismiss = { confirm = null },
            destructive = true,
            showField = action != ProfileAction.Ignore,
        )
    }
}

/** A profile action on a solid surface, so it reads over any nameplate */
@Composable
private fun ProfileActionButton(text: String, onClick: () -> Unit, modifier: Modifier, enabled: Boolean) {
    Box(modifier.clip(CircleShape).background(theme.bgTertiary)) {
        SecondaryButton(text, onClick, enabled = enabled, color = theme.textPrimary)
    }
}

/** The tabs of a profile, as the web's full profile splits its card */
private enum class ProfileTab(val labelKey: String) {
    Details("profile.tabs.details"),
    Activity("profile.tabs.activity"),
    Mutual("profile.tabs.mutualRooms"),
}

/** The tab strip under the header, the mutual one carrying how many rooms and spaces there are */
@Composable
private fun ProfileTabs(selected: ProfileTab, mutualCount: Int, onSelect: (ProfileTab) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3)
            .clip(CircleShape)
            .background(theme.fill)
            .padding(WZ.Space.space1),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
    ) {
        ProfileTab.entries.forEach { tab ->
            val active = tab == selected
            Row(
                Modifier
                    .weight(1f)
                    .height(WZ.Space.space10)
                    .clip(CircleShape)
                    .background(if (active) theme.bgTertiary else Color.Transparent)
                    .clickable { onSelect(tab) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2, Alignment.CenterHorizontally),
            ) {
                Text(
                    tr(tab.labelKey),
                    style = wizardFont(WZ.FontSize.sm, if (active) FontWeight.SemiBold else FontWeight.Normal),
                    color = if (active) theme.textPrimary else theme.textMuted,
                    maxLines = 1,
                )
                if (tab == ProfileTab.Mutual && mutualCount > 0) {
                    Text(
                        if (mutualCount > 99) "99+" else "$mutualCount",
                        Modifier.clip(CircleShape).background(if (active) theme.accent else theme.textMuted).padding(horizontal = WZ.Space.space2),
                        style = wizardFont(WZ.FontSize.xs, FontWeight.Bold),
                        color = theme.textOnAccent,
                    )
                }
            }
        }
    }
}

/** The "..." button over the banner: the moderation actions, then copying the ID and the link */
@Composable
private fun ProfileMenuButton(expanded: Boolean, onExpanded: (Boolean) -> Unit, items: List<MenuItem>, modifier: Modifier) {
    Box(modifier.clip(CircleShape).background(theme.bgPrimary.copy(alpha = 0.6f))) {
        BarButton("dots-three", tr("common.more"), { onExpanded(true) }, weight = PhWeight.bold, tint = theme.textPrimary)
        WizardMenu(expanded, { onExpanded(false) }, items)
    }
}

/** What the signed-in user may do with roles in a room */
internal data class RoleRights(val ownLevel: Long, val canEditLevels: Boolean) {
    fun canChange(targetLevel: Long, isSelf: Boolean) = canEditLevels && (isSelf || targetLevel < ownLevel)

    fun canAssign(level: Long) = canEditLevels && level <= ownLevel

    companion object {
        suspend fun load(client: org.wizardchat.core.WizardClient?, roomId: String): RoleRights {
            val details = runCatching { client?.roomDetails(roomId) }.getOrNull() ?: return RoleRights(0, false)
            return RoleRights(details.ownPowerLevel ?: Long.MAX_VALUE, details.permissions.changePermissions)
        }
    }
}

internal enum class RoleLevel(val value: Long, val titleKey: String, val whoKey: String) {
    Member(0, "room.members.member", "room.members.everyone"),
    Moderator(50, "room.members.moderator", "room.members.moderators"),
    Admin(100, "room.members.admin", "room.members.admins"),
    ;

    companion object {
        fun closest(level: Long) = if (level >= 100) Admin else if (level >= 50) Moderator else Member
    }
}

/** The name of a power level: creator, admin, moderator, member or a custom number */
internal fun roleName(level: Long): String = when {
    level == Long.MAX_VALUE -> L10n.format("room.members.owner")
    level >= 100 -> L10n.format("room.members.admin")
    level >= 50 -> L10n.format("room.members.moderator")
    level == 0L -> L10n.format("room.members.member")
    else -> L10n.format("room.members.customLevel", "$level")
}

/** The role row in a profile; picking a level that can't be undone asks first */
@Composable
private fun RoleMenu(roomId: String, userId: String, currentLevel: Long, rights: RoleRights, onChanged: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var expanded by remember { mutableStateOf(false) }
    var confirmLevel by remember { mutableStateOf<RoleLevel?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val isSelf = userId == session.userId

    fun set(level: RoleLevel) {
        scope.launch {
            try {
                session.requireClient.setPowerLevel(roomId, userId, level.value.toDouble())
                error = null
                onChanged()
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    Box {
        GroupedRow(tr("room.members.role"), icon = "shield-check", iconTint = theme.accent, onClick = { expanded = true }) {
            Text(roleName(currentLevel), style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
        }
        PickMenu(
            expanded,
            { expanded = false },
            RoleLevel.entries.map { level ->
                PickItem(tr(level.titleKey), checked = currentLevel == level.value, enabled = rights.canAssign(level.value)) {
                    // Making someone your equal, or lowering yourself, can't be undone by you
                    if ((level.value >= rights.ownLevel && !isSelf) || (isSelf && level.value < currentLevel)) {
                        confirmLevel = level
                    } else {
                        set(level)
                    }
                }
            },
        )
    }
    ErrorText(error)
    confirmLevel?.let { level ->
        ConfirmDialog(
            title = tr(if (isSelf) "room.members.selfDemoteTitle" else "room.members.equalLevelTitle"),
            confirmLabel = tr("room.members.changeRole"),
            onConfirm = { set(level) },
            onDismiss = { confirmLevel = null },
            message = tr(if (isSelf) "room.members.selfDemoteWarning" else "room.members.equalLevelWarning"),
        )
    }
}
