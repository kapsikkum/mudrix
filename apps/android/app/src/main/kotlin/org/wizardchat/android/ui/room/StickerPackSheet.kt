package org.wizardchat.android.ui.room

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.composer.PackThumb
import org.wizardchat.android.ui.settings.LabelButton
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.EmojiPack
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

/** A read-only look at the sticker pack a sticker in the timeline came from, as the web shows it */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun StickerPackSheet(pack: EmojiPack, onOpenRoom: (String) -> Unit, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val roomId = pack.roomId.orEmpty()
    val room: RoomSummary? = session.roomList?.room(roomId)
    WizardSheet(onDismiss) {
        SheetTopBar(pack.name)
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                if (pack.avatarUrl != null) {
                    Avatar(pack.name, pack.avatarUrl, WZ.SizeAvatar.md)
                } else {
                    PhIcon("sticker", size = WZ.SizeAvatar.md, tint = theme.textMuted)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                    Text(
                        pack.name,
                        style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold),
                        color = theme.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        trPlural("timeline.stickerPack.stickerCount", pack.images.size) + " · " +
                            tr("timeline.stickerPack.fromRoom", room?.displayName ?: roomId),
                        style = wizardFont(WZ.FontSize.sm),
                        color = theme.textMuted,
                    )
                }
            }
            FlowRow(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                pack.images.forEach { sticker ->
                    PackThumb(sticker.url, Modifier.size(WZ.SizeAvatar.xl), animated = true)
                }
            }
            if (pack.roomId != null) {
                LabelButton(tr("timeline.stickerPack.viewRoom"), "arrow-right", {
                    onDismiss()
                    onOpenRoom(roomId)
                })
            }
        }
    }
}
