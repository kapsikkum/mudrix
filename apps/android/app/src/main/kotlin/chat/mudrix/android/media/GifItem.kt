package chat.mudrix.android.media

import kotlinx.serialization.Serializable

/**
 * One GIF from a provider, the web's `GifItem`: [previewUrl] is what the picker's grid shows, [url] is what is
 * downloaded and re-uploaded when it is sent, and [provider] says which service it came from.
 */
@Serializable
data class GifItem(
    val id: String,
    val title: String,
    val url: String,
    val previewUrl: String,
    val width: Int,
    val height: Int,
    val provider: String = GIPHY,
) {
    /** The provider's name as it is shown to people */
    val providerName: String
        get() = if (provider == KLIPY) KLIPY_LABEL else GIPHY_LABEL

    companion object {
        const val GIPHY = "giphy"
        const val KLIPY = "klipy"
        const val GIPHY_LABEL = "GIPHY"
        const val KLIPY_LABEL = "KLIPY"

        /** A stored value only ever names a provider we know */
        fun providerOf(value: String?): String = if (value == KLIPY) KLIPY else GIPHY

        /** Which service a GIF URL belongs to, by its host (`gifFavourites.ts`): everything else is GIPHY's */
        fun providerForUrl(url: String): String {
            val host = runCatching { java.net.URI(url).host?.lowercase() }.getOrNull() ?: return GIPHY
            return if (host == "klipy.com" || host.endsWith(".klipy.com")) KLIPY else GIPHY
        }

        /**
         * A saved favourite, like the web's `favouriteGifItem`: only the URL is stored, so the grid draws it
         * from that alone. A GIF favourited from a message lives on the homeserver, so its URL is `mxc://`.
         */
        fun favourite(url: String, size: Int = 200): GifItem = GifItem(
            id = url,
            title = "",
            url = url,
            previewUrl = url,
            width = size,
            height = size,
            provider = providerForUrl(url),
        )
    }
}
