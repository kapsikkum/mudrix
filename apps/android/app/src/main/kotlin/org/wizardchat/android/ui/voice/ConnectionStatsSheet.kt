package org.wizardchat.android.ui.voice

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
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
import kotlinx.coroutines.delay
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.rtc.ConnectionStats
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The call's connection info, polled from LiveKit's stats while open, as the web popover shows it */
@Composable
internal fun ConnectionStatsSheet(onDismiss: () -> Unit) {
    val calls = CallManager.shared
    var summary by remember { mutableStateOf<ConnectionStats.Summary?>(null) }
    var unavailable by remember { mutableStateOf(false) }
    var pings by remember { mutableStateOf(emptyList<Int>()) }
    LaunchedEffect(Unit) {
        var previous: ConnectionStats.Sample? = null
        while (true) {
            val sample = runCatching { calls.connectionStats() }.getOrNull()
            if (sample == null) {
                unavailable = true
            } else {
                val next = ConnectionStats.summarise(sample, previous)
                previous = sample
                unavailable = false
                summary = next
                next.ping?.let { ping -> pings = (pings + ping).takeLast(60) }
            }
            delay(1000)
        }
    }
    val average = if (pings.isEmpty()) null else Math.round(pings.average()).toInt()
    val last = pings.lastOrNull()
    val audio = summary?.sendAudio
    val video = summary?.sendVideo
    val sendingVideo = video != null && (video.resolution != null || (video.bitrate ?: 0.0) > 0)
    WizardSheet(onDismiss) {
        SheetTopBar(tr("voice.stats.title"))
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
        ) {
            if (unavailable) {
                Text(
                    tr("voice.stats.unavailable"),
                    Modifier.padding(vertical = WZ.Space.space4),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                )
            } else {
                Row(
                    Modifier.fillMaxWidth().padding(vertical = WZ.Space.space3),
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space6),
                ) {
                    Text(
                        tr("voice.stats.averagePing") + " " + (average?.let { "$it ms" } ?: "—"),
                        style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                        color = theme.textPrimary,
                    )
                    Text(
                        tr("voice.stats.lastPing") + " " + (last?.let { "$it ms" } ?: "—"),
                        style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                        color = theme.textPrimary,
                    )
                }
                RowDivider()
                StatsRow(tr("voice.stats.server"), summary?.server)
                StatsRow(tr("voice.stats.transport"), summary?.transport)
                StatsRow(tr("voice.stats.outboundLoss"), summary?.outboundLoss?.let { "%.1f%%".format(it) })
                StatsRow(tr("voice.stats.inboundLoss"), summary?.inboundLoss?.let { "%.1f%%".format(it) })
                StatsRow(tr("voice.stats.jitter"), summary?.jitter?.let { "$it ms" })
                StatsRow(tr("voice.stats.sendingAudio"), audio?.let { stream(it) })
                if (sendingVideo && video != null) StatsRow(tr("voice.stats.sendingVideo"), stream(video, withResolution = true))
                StatsRow(tr("voice.stats.receiving"), summary?.receiveBitrate?.let { kbps(it) })
            }
        }
    }
}

@Composable
private fun StatsRow(label: String, value: String?) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = WZ.Space.space3),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
        Text(value ?: "—", style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
    }
}

private fun kbps(value: Double): String = "${Math.round(value)} kbps"

private fun stream(stream: ConnectionStats.Stream, withResolution: Boolean = false): String? {
    val parts = buildList {
        stream.codec?.let { add(it) }
        if (withResolution) {
            stream.resolution?.let { resolution -> add(stream.fps?.let { "$resolution @ ${Math.round(it)}" } ?: resolution) }
        }
        stream.bitrate?.let { add(kbps(it)) }
    }
    return parts.joinToString(" · ").ifEmpty { null }
}
