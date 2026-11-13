package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.core.EmojiPack
import org.wizardchat.core.WizardClient

/** Finds the pack a sticker in the timeline came from, as the web's sticker preview does */
object StickerPacks {
    /** What tapping a sticker found: the pack, or why it can't be shown */
    sealed interface Lookup {
        data class Found(val pack: EmojiPack) : Lookup
        data object Unknown : Lookup
        data object NotPublic : Lookup
    }

    /** The pack among [packs] that holds [url] */
    fun find(packs: List<EmojiPack>, url: String): EmojiPack? =
        packs.firstOrNull { pack -> pack.images.any { it.url == url } }

    /** The url of a media source (`{ url }`, or the encrypted file's url) */
    fun imageUrl(source: JsonElement?): String? {
        val obj = source as? JsonObject ?: return null
        return (obj["url"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?: ((obj["file"] as? JsonObject)?.get("url") as? JsonPrimitive)?.takeIf { it.isString }?.content
    }

    /** The rooms to look in: the one on screen first, then the others */
    fun roomOrder(current: String?, others: Collection<String>): List<String> =
        (listOfNotNull(current?.takeIf { it.isNotEmpty() }) + others.filter { it != current }).distinct()

    /** The room pack among [roomIds] that holds [url]; a pack in a room that isn't public stays hidden */
    suspend fun find(client: WizardClient, url: String, roomIds: List<String>): Lookup {
        for (roomId in roomIds) {
            // A room's packs include its spaces' packs and the ones the account subscribes to; the "user" pack is not a room
            val packs = runCatching { client.emojiPacks(roomId) }.getOrNull().orEmpty()
                .filter { it.roomId != null && it.roomId != "user" }
            val pack = find(packs, url) ?: continue
            val settings = runCatching { client.localRoomSettings(pack.roomId ?: roomId) }.getOrNull()
            if (settings?.joinRule != "public") return Lookup.NotPublic
            return Lookup.Found(pack)
        }
        return Lookup.Unknown
    }
}
