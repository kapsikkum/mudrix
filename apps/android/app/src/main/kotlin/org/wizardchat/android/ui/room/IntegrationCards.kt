package org.wizardchat.android.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import java.util.Locale
import org.wizardchat.android.integrations.IntegrationDetails
import org.wizardchat.android.integrations.IntegrationMatching
import org.wizardchat.android.integrations.IntegrationSettings
import org.wizardchat.android.integrations.IntegrationStore
import org.wizardchat.android.integrations.LinkDetailsLoader
import org.wizardchat.android.ui.isStreamerModeActive
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** A link in a message that an installed integration's rule matches, and the lookup it may make for it */
class IntegrationCardData(
    val url: String,
    val match: IntegrationMatching.LinkCardMatch,
    val lookup: IntegrationMatching.LinkLookupRef?,
)

private val URL_RE = Regex("https?://[^\\s<>\"']+", RegexOption.IGNORE_CASE)
private val TRAILING = Regex("[.,!?;:)\"'\\]]+$")
private const val MAX_CARDS = 3

/** What a card shows of its lookup */
private sealed interface DetailsState {
    data object None : DetailsState

    /** Encrypted room: nothing is asked until the person presses the button */
    class Ask(val host: String) : DetailsState

    /** Streamer mode is on: nothing is asked on its own until it ends */
    class Paused(val host: String) : DetailsState
    class Loading(val host: String) : DetailsState
    class Ready(val host: String, val details: IntegrationDetails.Details) : DetailsState
    class Failed(val host: String, val requested: Boolean) : DetailsState
}

/**
 * Cards for the links of a message that installed integrations recognise. Matching is local; a card whose integration may
 * look the link up asks its one approved host, when the card is shown in an unencrypted room and only when the person
 * presses its button in an encrypted one, and never on its own while streamer mode is on.
 */
@Composable
fun IntegrationCards(body: String?, isEncrypted: Boolean) {
    val store = IntegrationStore.get(LocalContext.current)
    val installed = store.installed
    if (installed.isEmpty() || body == null) return
    val grants = store.grants
    val settings = store.settings
    val cards = remember(body, installed, grants, settings) {
        val seen = HashSet<String>()
        val out = ArrayList<IntegrationCardData>()
        for (raw in URL_RE.findAll(body).map { it.value }) {
            if (out.size >= MAX_CARDS) break
            val url = raw.replace(TRAILING, "")
            if (!seen.add(url)) continue
            val match = IntegrationMatching.matchLinkCard(url, installed, grants, settings) ?: continue
            out += IntegrationCardData(url, match, IntegrationMatching.findLinkLookup(match, installed, grants))
        }
        out
    }
    cards.forEach { IntegrationCard(it, isEncrypted) }
}

@Composable
private fun IntegrationCard(card: IntegrationCardData, isEncrypted: Boolean) {
    val uriHandler = LocalUriHandler.current
    val streaming = isStreamerModeActive()
    val loader = LinkDetailsLoader.shared
    val lookup = card.lookup
    val settings = card.match.settings
    val captures = card.match.captures
    val locale = Locale.getDefault()
    // The exact request is the identity of everything below (the settings only choose what is shown)
    val url = remember(lookup, captures, settings) {
        lookup?.takeIf { IntegrationSettings.lookupShowsAnything(it.lookup, settings) }
            ?.let { (IntegrationDetails.buildLookupUrl(it.host, it.lookup, captures) as? IntegrationDetails.LookupUrl.Ok)?.url }
    }
    var requestedUrl by remember { mutableStateOf<String?>(null) }
    var settled by remember { mutableStateOf<Pair<String, DetailsState>?>(null) }
    val requested = url != null && requestedUrl == url
    val cached = url != null && loader.isCached(url)
    val auto = url != null && (!isEncrypted || cached)
    val key = "$url|$locale|$settings"
    // A cached answer needs no request, so it is shown even while streaming
    val waiting = streaming && !requested && !cached

    LaunchedEffect(key, auto, requested, waiting) {
        if (lookup == null || url == null || (!auto && !requested) || waiting) return@LaunchedEffect
        val res = loader.load(lookup.host, lookup.lookup, captures, lookup.allow, locale, settings, passive = !requested)
        if (res is LinkDetailsLoader.Result.Error && res.paused) return@LaunchedEffect
        settled = key to when (res) {
            is LinkDetailsLoader.Result.Ok -> DetailsState.Ready(lookup.host, res.details)
            is LinkDetailsLoader.Result.Error -> DetailsState.Failed(lookup.host, requested)
        }
    }

    val state: DetailsState = when {
        lookup == null || url == null -> DetailsState.None
        settled?.first == key -> settled!!.second
        waiting && auto -> DetailsState.Paused(lookup.host)
        !auto && !requested -> DetailsState.Ask(lookup.host)
        else -> DetailsState.Loading(lookup.host)
    }

    val ready = state as? DetailsState.Ready
    val title = ready?.details?.title ?: card.match.title
    val via = if (ready != null) tr("integrations.card.viaDetails", card.match.integrationName, ready.host) else tr("integrations.card.via", card.match.integrationName)
    val openLabel = card.match.rule.buttonLabel ?: tr("integrations.card.open")
    Row(
        Modifier
            .padding(top = WZ.Space.space2)
            .widthIn(max = WZ.Size.panel)
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(WZ.Radius.lg))
            .background(theme.fill)
            .padding(WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Box(Modifier.width(WZ.Space.space1).fillMaxHeight().background(theme.accent, RoundedCornerShape(WZ.Radius.xs)))
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(via, style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold), color = theme.textMuted)
            // Everything below is plain text; nothing from an answer is a link or markup
            Text(title, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 2, overflow = TextOverflow.Ellipsis)
            card.match.subtitle?.let { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            when (state) {
                is DetailsState.Ask -> CardButton(tr("integrations.card.loadDetails", state.host), theme.accent, WZ.FontSize.sm) { requestedUrl = url }
                is DetailsState.Paused -> Text(tr("integrations.card.paused", state.host), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                is DetailsState.Failed -> if (state.requested) Text(tr("integrations.card.noDetails", state.host), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                is DetailsState.Ready -> {
                    state.details.description?.let { Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textSecondary, maxLines = 4, overflow = TextOverflow.Ellipsis) }
                    if (state.details.facts.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                            state.details.facts.forEach { fact ->
                                Text("${fact.label} ${fact.value}", style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, maxLines = 1)
                            }
                        }
                    }
                }
                else -> Unit
            }
            CardButton(openLabel, theme.linkColor, WZ.FontSize.md) { runCatching { uriHandler.openUri(card.url) } }
        }
    }
}

/** A text button with a 44 dp touch area */
@Composable
private fun CardButton(text: String, color: androidx.compose.ui.graphics.Color, size: androidx.compose.ui.unit.TextUnit, onClick: () -> Unit) {
    Box(Modifier.heightIn(min = WZ.Space.space11).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.CenterStart) {
        Text(text, style = wizardFont(size, FontWeight.SemiBold), color = color, maxLines = 2)
    }
}
