package chat.mudrix.android.ui.composer

import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.LruCache
import android.widget.ImageView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.viewinterop.AndroidView
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import chat.mudrix.android.BuildConfig
import chat.mudrix.android.LocalMedia
import chat.mudrix.android.LocalPrefs
import chat.mudrix.android.LocalSession
import chat.mudrix.android.matrix.GifFavourites
import chat.mudrix.android.matrix.MediaMetadata
import chat.mudrix.android.media.GifApi
import chat.mudrix.android.media.GifItem
import chat.mudrix.android.media.GifLink
import chat.mudrix.android.ui.Chip
import chat.mudrix.android.ui.L10n
import chat.mudrix.android.ui.PhIcon
import chat.mudrix.android.ui.PhWeight
import chat.mudrix.android.ui.PrimaryButton
import chat.mudrix.android.ui.Spinner
import chat.mudrix.android.ui.theme.theme
import chat.mudrix.android.ui.theme.wizardFont
import chat.mudrix.android.ui.tr
import chat.mudrix.tokens.WZ

/**
 * The GIF picker's GIF: the providers share one shape (`media/GifItem.kt`), so the composer keeps sending the same
 * type it always did.
 */
typealias GiphyGif = GifItem

/** Set at build time (GIPHY_API_KEY / KLIPY_API_KEY, see docs/SECRETS.md); empty means that provider is not offered */
private val GIPHY_API_KEY: String = BuildConfig.GIPHY_API_KEY
private val KLIPY_API_KEY: String = BuildConfig.KLIPY_API_KEY

/** The composer preference the picker kept its favourites in before they moved to account data */
internal const val GIF_FAVOURITES_LEGACY_KEY = "gifFavourites"
private const val RECENT_KEY = "gifRecent"
private const val CONSENT_KEY = "gifConsent"

/** One tab of the picker: a provider's trending/search, the favourites, or the GIFs sent from this device */
private enum class GifTab(val provider: String?) {
    giphy(GifItem.GIPHY),
    klipy(GifItem.KLIPY),
    favourites(null),
    recent(null),
}

/** Downloads a URL's bytes (GIFs from Giphy and KLIPY) */
internal suspend fun download(url: String): ByteArray? = withContext(Dispatchers.IO) {
    runCatching {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            if (connection.responseCode !in 200..299) null else connection.inputStream.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
    }.getOrNull()
}

/** Trending and searched GIFs from GIPHY and KLIPY (after consent), with favourites and the ones sent recently */
@Composable
fun GifPicker(onPick: suspend (GiphyGif) -> Unit) {
    val prefs = LocalPrefs.current
    val session = LocalSession.current
    var consented by remember { mutableStateOf(composerDefaults.getBoolean(CONSENT_KEY, false)) }
    var recentRaw by remember { mutableStateOf(composerDefaults.getString(RECENT_KEY, null)) }
    var search by remember { mutableStateOf("") }
    var tab by remember { mutableStateOf(defaultTab(prefs.gifProvider)) }
    var results by remember { mutableStateOf(listOf<GifItem>()) }
    var loading by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // Favourites live in account data (GifFavourites), so they follow the account like the web's
    val favourites = GifFavourites.shared.urls
    val favouriteGifs = remember(favourites) { favourites.map { GifItem.favourite(it) } }
    val recent = remember(recentRaw) { GifApi.parseRecent(recentRaw) }
    val klipyAvailable = KLIPY_API_KEY.isNotBlank()

    // A tab whose provider has no key in this build falls back to the other one
    LaunchedEffect(tab, klipyAvailable) {
        if (tab == GifTab.klipy && !klipyAvailable) tab = if (GIPHY_API_KEY.isNotBlank()) GifTab.giphy else GifTab.recent
    }

    fun rememberFavourite(gif: GifItem) {
        val client = session.client ?: return
        scope.launch { GifFavourites.shared.toggle(client, gif.url) }
    }

    fun pick(gif: GifItem) {
        // Record it in Recent first: picking closes the picker
        val next = GifApi.withRecent(recent, gif)
        recentRaw = GifApi.encodeRecent(next)
        composerDefaults.edit().putString(RECENT_KEY, recentRaw).apply()
        if (!sending) {
            scope.launch {
                sending = true
                onPick(gif)
                sending = false
            }
        }
    }

    if (GIPHY_API_KEY.isBlank() && KLIPY_API_KEY.isBlank()) {
        NotConfigured()
        return
    }

    if (!consented) {
        Column(
            Modifier.fillMaxSize().padding(WZ.Space.space8),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PhIcon("images", size = WZ.SizeIcon.xxl, tint = theme.accent)
            Text(tr("composer.gifConsentTitle"), style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary)
            Text(
                tr("composer.gifConsentBody", "api.giphy.com, *.giphy.com", "api.klipy.com, *.klipy.com"),
                style = wizardFont(WZ.FontSize.md),
                color = theme.textMuted,
                textAlign = TextAlign.Center,
            )
            PrimaryButton(tr("composer.gifConsentEnable"), {
                consented = true
                composerDefaults.edit().putBoolean(CONSENT_KEY, true).apply()
            }, Modifier.widthIn(max = WZ.Size.sidebar))
        }
        return
    }

    val provider = tab.provider
    LaunchedEffect(provider, search) {
        if (provider == null) return@LaunchedEffect
        if (search.isNotEmpty()) delay(350)
        loading = true
        results = loadGifs(provider, search.trim()).orEmpty()
        loading = false
    }

    val shown = when (tab) {
        GifTab.favourites -> favouriteGifs
        GifTab.recent -> recent
        else -> results
    }
    val gifTabsLabel = tr("composer.gifTabsLabel")

    Column(Modifier.fillMaxSize()) {
        // The providers, then the two local lists, like the web's tabs
        Column(Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space2)) {
            Row(
                Modifier
                    .horizontalScroll(rememberScrollState())
                    .semantics { contentDescription = gifTabsLabel },
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                GifTab.entries.forEach { entry ->
                    val available = entry != GifTab.klipy || klipyAvailable
                    Chip(
                        when (entry) {
                            GifTab.giphy -> GifItem.GIPHY_LABEL
                            GifTab.klipy -> GifItem.KLIPY_LABEL
                            GifTab.favourites -> tr("composer.favourites")
                            GifTab.recent -> tr("composer.gifTabRecent")
                        },
                        tab == entry,
                        { if (available) tab = entry },
                    )
                }
            }
        }
        if (provider != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SearchBar(
                    search,
                    { search = it },
                    tr(if (provider == GifItem.KLIPY) "composer.searchKlipy" else "composer.searchGiphy"),
                    Modifier.weight(1f),
                )
                Box(
                    Modifier
                        .padding(end = WZ.Space.space3)
                        .size(WZ.Space.space10)
                        .clip(CircleShape)
                        .clickable { tab = GifTab.favourites },
                    contentAlignment = Alignment.Center,
                ) {
                    PhIcon("star", PhWeight.regular, tint = theme.textMuted, contentDescription = tr("composer.favourites"))
                }
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            LazyVerticalGrid(
                GridCells.Fixed(2),
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = WZ.Space.space5),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            ) {
                items(shown, key = { "${it.provider}:${it.id}" }) { gif ->
                    val isFavourite = GifFavourites.shared.isFavourite(gif.url)
                    Box(Modifier.semantics { contentDescription = gif.title }) {
                        GifThumb(
                            gif,
                            Modifier
                                .fillMaxWidth()
                                .aspectRatio(gif.width.toFloat() / gif.height.coerceAtLeast(1))
                                .clip(RoundedCornerShape(WZ.Radius.lg))
                                .clickable { pick(gif) },
                        )
                        Box(
                            Modifier
                                .align(Alignment.TopEnd)
                                .padding(WZ.Space.space2)
                                .size(WZ.Space.space9)
                                .clip(CircleShape)
                                .background(theme.overlay)
                                .clickable { rememberFavourite(gif) },
                            contentAlignment = Alignment.Center,
                        ) {
                            PhIcon(
                                "star",
                                if (isFavourite) PhWeight.fill else PhWeight.regular,
                                size = WZ.SizeIcon.xs,
                                tint = if (isFavourite) theme.warningColor else theme.textOnAccent,
                                contentDescription = if (isFavourite) tr("room.removeFavourite") else tr("room.addFavourite"),
                            )
                        }
                    }
                }
            }
            when {
                tab == GifTab.favourites && favouriteGifs.isEmpty() -> Text(
                    tr("composer.noFavourites"),
                    Modifier.padding(WZ.Space.space9),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                    textAlign = TextAlign.Center,
                )
                tab == GifTab.recent && recent.isEmpty() -> Text(
                    tr("composer.noRecent"),
                    Modifier.padding(WZ.Space.space9),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                    textAlign = TextAlign.Center,
                )
                provider != null && loading && results.isEmpty() -> Spinner()
                provider != null && !loading && results.isEmpty() -> Text(
                    tr(if (search.isNotBlank()) "composer.noResults" else "composer.searchGifsHint"),
                    Modifier.padding(WZ.Space.space9),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                    textAlign = TextAlign.Center,
                )
            }
            if (sending) {
                Column(
                    Modifier
                        .clip(RoundedCornerShape(WZ.Radius.xl))
                        .background(theme.bgTertiary)
                        .padding(WZ.Space.space7),
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spinner(color = theme.textMuted)
                    Text(tr("composer.sendingGif"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                }
            }
        }
        // The providers whose GIFs this list comes from, as both ask for
        Row(
            Modifier.align(Alignment.CenterHorizontally).padding(vertical = WZ.Space.space3),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            val credited = if (provider != null) listOf(provider) else listOf(GifItem.GIPHY, GifItem.KLIPY)
            credited.forEach { id ->
                Text(
                    L10n.format("composer.poweredBy", if (id == GifItem.KLIPY) GifItem.KLIPY_LABEL else GifItem.GIPHY_LABEL),
                    style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
                    color = theme.textMuted,
                )
            }
        }
    }
}

/** The tab the settings' preferred provider asks for */
private fun defaultTab(preferred: String): GifTab {
    val provider = GifItem.providerOf(preferred)
    val key = if (provider == GifItem.KLIPY) KLIPY_API_KEY else GIPHY_API_KEY
    return if (key.isNotBlank()) {
        if (provider == GifItem.KLIPY) GifTab.klipy else GifTab.giphy
    } else {
        if (GIPHY_API_KEY.isNotBlank()) GifTab.giphy else GifTab.klipy
    }
}

@Composable
private fun NotConfigured() {
    Column(
        Modifier.fillMaxSize().padding(WZ.Space.space8),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space5, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        PhIcon("images", size = WZ.SizeIcon.xxl, tint = theme.textMuted)
        Text(
            tr("composer.gifNotConfiguredTooltip"),
            style = wizardFont(WZ.FontSize.md),
            color = theme.textMuted,
            textAlign = TextAlign.Center,
        )
    }
}

private fun parseFavourites(raw: String?): List<GifItem> = GifApi.parseRecent(raw)

private fun encodeFavourites(list: List<GifItem>): String = GifApi.encodeRecent(list)


/** Trending (an empty query) or searched GIFs from one provider */
private suspend fun loadGifs(provider: String, query: String): List<GifItem>? {
    val key = if (provider == GifItem.KLIPY) KLIPY_API_KEY else GIPHY_API_KEY
    if (key.isBlank()) return null
    val url = if (provider == GifItem.KLIPY) GifApi.klipyUrl(key, query) else GifApi.giphyUrl(key, query)
    val data = download(url) ?: return null
    val body = data.decodeToString()
    return if (provider == GifItem.KLIPY) GifApi.parseKlipy(body) else GifApi.parseGiphy(body)
}

/** The build's key for a provider, empty when this build has none */
internal fun gifApiKey(provider: String): String = if (provider == GifItem.KLIPY) KLIPY_API_KEY else GIPHY_API_KEY

/** Turns a bare GIPHY/KLIPY link into the GIF to send, or null when it cannot be fetched (the link is sent instead) */
internal suspend fun gifFromLink(target: GifLink.Target): GiphyGif? {
    GifLink.direct(target)?.let { return it }
    val slug = (target as? GifLink.KlipySlug)?.slug ?: return null
    val key = gifApiKey(GifItem.KLIPY)
    if (key.isEmpty()) return null
    val body = download(GifApi.klipyItemUrl(key, slug))?.decodeToString() ?: return null
    return GifApi.parseKlipy(body).firstOrNull()
}

private val gifBytes = object : LruCache<String, ByteArray>(24 * 1024 * 1024) {
    override fun sizeOf(key: String, value: ByteArray) = value.size
}

/** The picker's picture: a provider's URL plays as it is, a favourite from a message (mxc://) is fetched with the login */
@Composable
private fun GifThumb(gif: GifItem, modifier: Modifier) {
    if (!gif.previewUrl.startsWith("mxc://")) {
        RemoteAnimatedImage(gif.previewUrl, modifier)
        return
    }
    val loader = LocalMedia.current
    var bitmap by remember(gif.previewUrl) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(gif.previewUrl, loader) { bitmap = loader?.thumbnail(gif.previewUrl, 320) }
    Box(modifier.background(theme.fill), contentAlignment = Alignment.Center) {
        bitmap?.let {
            androidx.compose.foundation.Image(
                it.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            )
        }
    }
}

/** A playing GIF from the web */
@Composable
fun RemoteAnimatedImage(url: String, modifier: Modifier = Modifier) {    var drawable by remember(url) { mutableStateOf<Drawable?>(null) }
    LaunchedEffect(url) {
        val data = gifBytes.get(url) ?: download(url)?.also { gifBytes.put(url, it) } ?: return@LaunchedEffect
        drawable = withContext(Dispatchers.Default) { decodeAnimated(data) }
    }
    Box(modifier.background(theme.fill)) {
        val current = drawable
        if (current != null) {
            AndroidView(
                factory = { context -> ImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP } },
                modifier = Modifier.fillMaxSize(),
                update = { view ->
                    if (view.drawable !== current) {
                        view.setImageDrawable(current)
                        (current as? AnimatedImageDrawable)?.start()
                    }
                },
            )
        }
    }
}

private fun decodeAnimated(data: ByteArray): Drawable? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        return MediaMetadata.decodeDrawable(data)
    }
    val bitmap = MediaMetadata.decodeImage(data, 400) ?: return null
    return BitmapDrawable(chat.mudrix.android.MudrixApplication.instance.resources, bitmap)
}
