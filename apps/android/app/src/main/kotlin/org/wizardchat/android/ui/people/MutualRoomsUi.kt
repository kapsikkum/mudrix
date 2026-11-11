package org.wizardchat.android.ui.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MutualEntry
import org.wizardchat.android.matrix.MutualRooms
import org.wizardchat.android.matrix.MutualRoomsLookup
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.tokens.WZ

/** "3 mutual rooms · 1 mutual space" on a profile; tapping lists them. Nothing shows when the server can't tell or there are none. */
@Composable
internal fun ProfileMutualRooms(userId: String, name: String) {
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val closeParents = LocalCloseParents.current
    var mutual by remember(userId) { mutableStateOf<MutualRooms?>(null) }
    var open by remember { mutableStateOf(false) }
    LaunchedEffect(userId) {
        val stored = session.client?.session ?: return@LaunchedEffect
        val list = session.roomList ?: return@LaunchedEffect
        val ids = MutualRoomsLookup.fetch(stored.homeserverUrl, stored.accessToken, userId) ?: return@LaunchedEffect
        mutual = MutualRoomsLookup.classify(ids, list.joinedRooms, list.spaces, list.graph)
    }
    val found = mutual?.takeIf { !it.isEmpty } ?: return
    val summary = listOfNotNull(
        found.rooms.takeIf { it.isNotEmpty() }?.let { trPlural("profile.mutualRooms", it.size, it.size) },
        found.spaces.takeIf { it.isNotEmpty() }?.let { trPlural("profile.mutualSpaces", it.size, it.size) },
    ).joinToString(" · ")
    GroupedSection {
        GroupedRow(summary, icon = "users", onClick = { open = true })
    }
    if (open) {
        WizardSheet({ open = false }) {
            SheetBar(
                L10n.format("profile.mutualTitle", name),
                trailing = { BarTextButton(tr("common.done"), { open = false }, bold = true) },
            )
            FormList {
                if (found.spaces.isNotEmpty()) {
                    item {
                        GroupedSection(header = tr("profile.mutualSpacesHeading")) {
                            found.spaces.forEach { entry ->
                                MutualRow(entry) { open = false; closeParents(); navigator.openSpace(entry.id) }
                            }
                        }
                    }
                }
                if (found.rooms.isNotEmpty()) {
                    item {
                        GroupedSection(header = tr("profile.mutualRoomsHeading")) {
                            found.rooms.forEach { entry ->
                                MutualRow(entry) { open = false; closeParents(); navigator.openRoom(entry.id) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MutualRow(entry: MutualEntry, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Avatar(entry.name, entry.avatarUrl, WZ.SizeAvatar.sm)
        Text(entry.name, style = wizardFont(WZ.FontSize.lg, FontWeight.Medium), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
