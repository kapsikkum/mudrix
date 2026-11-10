package org.wizardchat.android.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.searchUsers
import org.wizardchat.android.matrix.startDirectMessage
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.UserResult
import org.wizardchat.tokens.WZ

enum class UserPickerMode { DirectMessage, Invite, Select }

/** Finds people to start a conversation with or (with `roomId`) to invite; `onDone` runs after inviting */
@Composable
fun UserPickerSheet(
    mode: UserPickerMode,
    onDismiss: () -> Unit,
    roomId: String? = null,
    onDone: () -> Unit = {},
    title: String? = null,
    exclude: Set<String> = emptySet(),
    onSelect: (List<UserResult>) -> Unit = {},
) {
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val closeParents = LocalCloseParents.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(listOf<UserResult>()) }
    var selected by remember { mutableStateOf(listOf<UserResult>()) }
    var searching by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val isInvite = mode != UserPickerMode.DirectMessage

    val trimmed = query.trim()
    val typedId = if (trimmed.startsWith("@") && trimmed.contains(":") && results.none { it.userId == trimmed } && trimmed !in exclude) {
        UserResult(trimmed, null, null)
    } else {
        null
    }

    LaunchedEffect(query) {
        delay(300)
        searching = true
        results = session.searchUsers(query).filter { it.userId != session.userId && it.userId !in exclude }
        searching = false
    }

    fun toggle(user: UserResult) {
        selected = if (selected.any { it.userId == user.userId }) selected.filter { it.userId != user.userId } else selected + user
    }

    fun pick(user: UserResult) {
        if (isInvite) {
            toggle(user)
            return
        }
        scope.launch {
            busy = true
            try {
                val room = session.startDirectMessage(user.userId)
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

    fun invite() {
        val client = session.client ?: return
        val roomId = roomId ?: return
        scope.launch {
            busy = true
            val failed = mutableListOf<String>()
            for (user in selected) {
                try {
                    client.invite(roomId, user.userId)
                } catch (e: Exception) {
                    failed += user.userId
                }
            }
            busy = false
            onDone()
            if (failed.isEmpty()) {
                onDismiss()
            } else {
                error = L10n.format("invite.inviteFailed", failed.joinToString(", "))
                selected = selected.filter { it.userId in failed }
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetPage {
            SheetBar(
                title ?: tr(if (isInvite) "room.members.invite" else "common.newDm"),
                leading = { BarTextButton(tr("common.cancel"), onDismiss) },
                trailing = {
                    if (mode == UserPickerMode.Select) {
                        BarTextButton(tr("common.add"), { onSelect(selected); onDismiss() }, enabled = selected.isNotEmpty(), bold = true)
                    } else if (isInvite) {
                        BarTextButton(tr("common.invite"), ::invite, enabled = selected.isNotEmpty() && !busy, bold = true)
                    }
                },
            )
            WizardTextField(
                query,
                { query = it },
                tr("room.members.searchPlaceholder"),
                Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
                keyboardType = KeyboardType.Email,
            )
            FormList(Modifier.weight(1f)) {
                if (selected.isNotEmpty()) {
                    item {
                        GroupedSection {
                            LazyRow(
                                contentPadding = PaddingValues(WZ.Space.space4),
                                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                            ) {
                                items(selected, key = { it.userId }) { user -> SelectedChip(user) { toggle(user) } }
                            }
                        }
                    }
                }
                val people = listOfNotNull(typedId) + results
                item {
                    val footer = when {
                        query.isEmpty() -> tr("room.members.searchHint")
                        results.isEmpty() && typedId == null && !searching -> tr("room.members.noOneFound")
                        else -> null
                    }
                    if (people.isEmpty()) {
                        footer?.let {
                            Text(
                                it,
                                Modifier.padding(horizontal = WZ.Space.space8, vertical = WZ.Space.space6),
                                style = wizardFont(WZ.FontSize.sm),
                                color = theme.textMuted,
                            )
                        }
                    } else {
                        GroupedSection(footer = footer) {
                            people.forEachIndexed { index, user ->
                                if (index > 0) RowDivider()
                                PersonRow(user.displayName, user.userId, user.avatarUrl, { pick(user) }, enabled = !busy) {
                                    if (isInvite) {
                                        val on = selected.any { it.userId == user.userId }
                                        PhIcon(
                                            if (on) "check-circle" else "circle",
                                            if (on) PhWeight.fill else PhWeight.regular,
                                            size = WZ.SizeIcon.lg,
                                            tint = theme.accent,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                item { ErrorText(error) }
            }
        }
    }
}

@Composable
private fun SelectedChip(user: UserResult, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(CircleShape)
            .background(theme.fill)
            .clickable(onClick = onClick)
            .padding(start = WZ.Space.space2, end = WZ.Space.space4, top = WZ.Space.space2, bottom = WZ.Space.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Avatar(user.displayName ?: user.userId, user.avatarUrl, WZ.SizeAvatar.xs)
        Text(user.displayName ?: user.userId, style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
        PhIcon("x", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textPrimary)
    }
}
