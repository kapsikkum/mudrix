package org.wizardchat.android.ui.home

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.matrix.SpaceModern
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

/** Everything a Modern space needs to draw its list: its categories, the rooms we are in, and which rooms are voice channels */
internal class ModernSpaceContent(
    val categories: List<SpaceModern.Category>,
    val spaceNames: Map<String, String>,
    val voiceChannels: Set<String>,
)

/**
 * The Modern list style of one space (`R1`): no avatars, the space's own rooms first, then each category (a sub-space) with
 * its rooms, voice channels below the text channels. Categories stay listed while empty. Only rooms we are in show, and
 * [rooms] are the ones this list may show (favourites and your own sections are listed above it already).
 */
internal fun LazyListScope.modernRooms(
    content: ModernSpaceContent,
    rooms: List<RoomSummary>,
    row: @Composable (RoomSummary, Boolean) -> Unit,
) {
    val byId = rooms.associateBy { it.id }
    for (category in content.categories) {
        val listed = SpaceModern.arrange(category.roomIds.mapNotNull { byId[it] }) { it.isVoice || it.id in content.voiceChannels }
        val header = category.spaceId?.let { content.spaceNames[it] }
        if (category.spaceId != null) {
            item(key = "category-${category.spaceId}", contentType = "category") {
                Text(
                    (header ?: tr("nav.rooms")).uppercase(),
                    Modifier.fillMaxWidth().padding(start = WZ.Space.space6 + 12.dp * (category.depth - 1).coerceAtLeast(0), top = WZ.Space.space6, bottom = WZ.Space.space2),
                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                    color = theme.textMuted,
                )
            }
        }
        for (room in listed) {
            item(key = "modern-${category.spaceId}-${room.id}", contentType = "room") {
                row(room, room.isVoice || room.id in content.voiceChannels)
            }
        }
    }
}

/** The space's banner: an uploaded picture or one of the preset gradients */
@Composable
internal fun SpaceBannerView(banner: SpaceModern.Banner, modifier: Modifier = Modifier) {
    val media = LocalMedia.current
    var image by remember(banner.url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(banner.url, media) {
        val url = banner.url ?: return@LaunchedEffect
        image = media?.thumbnail(url, 800)
    }
    val preset = SpaceModern.BANNER_PRESETS.firstOrNull { it.first == banner.color }
    val gradient = preset?.let { Brush.linearGradient(listOf(Color(it.second.toInt()), Color(it.third.toInt()))) }
        ?: Brush.linearGradient(listOf(theme.fill, theme.bgTertiary))
    Box(
        modifier.fillMaxWidth().height(112.dp).clip(RoundedCornerShape(WZ.Radius.lg)).background(gradient),
        contentAlignment = Alignment.Center,
    ) {
        image?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxWidth().height(112.dp), contentScale = ContentScale.Crop) }
    }
}
