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
    }
}
