package chat.mudrix.android.matrix

import android.content.Context
import androidx.compose.runtime.mutableStateMapOf
import chat.mudrix.android.WizardApplication

/**
 * Per-message "Hide media", the web's `hiddenMediaAtom`: a message's pictures or videos stay covered on this device
 * until they are shown again. Choices are kept in an insertion-ordered list (`MAX` of them), so the oldest fall off
 * first, exactly like the web's `MAX_HIDDEN_MEDIA_EVENTS` list.
 */
object HiddenMedia {
    /** How many hidden messages are remembered; older ones are forgotten */
    const val MAX = 500

    private const val KEY = "ids"

    private val ids = mutableStateMapOf<String, Boolean>()
    private val prefs by lazy { WizardApplication.instance.getSharedPreferences("hidden_media", Context.MODE_PRIVATE) }
    private var loaded = false

    /** The order after hiding [events]: known ids keep their place, new ones go last, the oldest fall off past [max] */
    fun hiddenOrder(previous: List<String>, events: List<String>, max: Int = MAX): List<String> {
        val added = events.filter { it.isNotEmpty() && it !in previous }.distinct()
        return (previous + added).takeLast(max.coerceAtLeast(0))
    }

    /** The order after showing [events] again */
    fun revealedOrder(previous: List<String>, events: List<String>): List<String> =
        previous.filterNot { it in events }

    private fun load() {
        if (loaded) return
        loaded = true
        prefs.getString(KEY, null)?.split('\n')?.forEach { if (it.isNotEmpty()) ids[it] = true }
    }

    private fun save(order: List<String>) {
        ids.clear()
        order.forEach { ids[it] = true }
        prefs.edit().putString(KEY, order.joinToString("\n")).apply()
    }

    fun isHidden(eventId: String?): Boolean {
        if (eventId == null) return false
        load()
        return ids[eventId] == true
    }

    /** True when every one of [eventIds] is hidden; hiding covers a whole gallery at once */
    fun allHidden(eventIds: List<String>): Boolean {
        if (eventIds.isEmpty()) return false
        load()
        return eventIds.all { ids[it] == true }
    }

    fun hide(eventIds: List<String>) {
        if (eventIds.isEmpty()) return
        load()
        val order = hiddenOrder(ids.keys.toList(), eventIds)
        if (order.size != ids.size || order.any { ids[it] != true }) save(order)
    }

    fun reveal(eventIds: List<String>) {
        if (eventIds.isEmpty()) return
        load()
        val order = revealedOrder(ids.keys.toList(), eventIds)
        if (order.size != ids.size) save(order)
    }
}

/** The event ids "Hide media" covers: a gallery's pictures, otherwise the message itself */
fun ChatEntry.mediaEventIds(): List<String> {
    val gallery = galleryItems.mapNotNull { it.eventId }
    return if (gallery.isNotEmpty()) gallery else listOfNotNull(eventId)
}

/** Whether this message has media that can be hidden (the web's `hasMedia`: an image, a video or a gallery) */
fun ChatEntry.hasHideableMedia(): Boolean = when (kind) {
    is ChatEntry.Kind.Image, is ChatEntry.Kind.Video -> mediaEventIds().isNotEmpty()
    else -> false
}
