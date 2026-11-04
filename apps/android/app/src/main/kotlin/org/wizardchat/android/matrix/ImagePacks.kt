package org.wizardchat.android.matrix

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Locale
import kotlinx.serialization.Serializable
import org.wizardchat.android.WizardApplication
import org.wizardchat.core.CoreJson
import org.wizardchat.core.EmojiPack
import org.wizardchat.core.PackImage

typealias ImagePack = EmojiPack

val PackImage.key: String get() = "$url|$shortcode"
val PackImage.text: String get() = body ?: shortcode

/** Custom emoji and sticker packs per room, cached between pickers */
object ImagePacks {
    private val cache = HashMap<String, List<ImagePack>>()

    fun cached(roomId: String): List<ImagePack>? = cache[roomId]

    /** Drops cached packs after one is edited, so the picker reloads them */
    fun forget() = cache.clear()

    suspend fun load(session: MatrixSession, roomId: String): List<ImagePack> {
        val packs = runCatching { session.client?.emojiPacks(roomId) }.getOrNull() ?: return cache[roomId].orEmpty()
        cache[roomId] = packs
        return packs
    }
}

class PacksStore {
    var packs by mutableStateOf(listOf<ImagePack>())
        private set
    var isLoading by mutableStateOf(true)
        private set

    suspend fun load(session: MatrixSession, roomId: String) {
        ImagePacks.cached(roomId)?.let {
            packs = it
            isLoading = false
        }
        packs = ImagePacks.load(session, roomId)
        isLoading = false
    }
}

/** An emoji from packages/emoji (names and keywords per language, in display order) */
@Serializable
data class Emoji(
    val e: String,
    val g: Int,
    val s: List<String>,
    val n: Map<String, String>,
    val k: Map<String, List<String>>,
) {
    val id get() = e
    val label: String get() = n[language] ?: n["en"] ?: ""

    fun matches(query: String): Boolean =
        label.contains(query, ignoreCase = true) ||
            s.any { it.contains(query, ignoreCase = true) } ||
            (k[language] ?: k["en"].orEmpty()).any { it.contains(query, ignoreCase = true) }

    @Serializable
    data class Group(val id: Int, val key: String, val name: Map<String, String>)

    data class GroupInfo(val index: Int, val icon: String, val name: String)

    @Serializable
    private data class File(val groups: List<Group>, val emoji: List<Emoji>)

    companion object {
        private val language get() = Locale.getDefault().language

        private val file: File? by lazy {
            runCatching {
                val json = WizardApplication.instance.assets.open("emoji.json").bufferedReader().use { it.readText() }
                CoreJson.decodeFromString(File.serializer(), json)
            }.getOrNull()
        }

        val all: List<Emoji> get() = file?.emoji.orEmpty()
        private val byCharacter by lazy { all.associateBy { it.e } }

        /** The English name, which the web stores with recent emoji */
        fun labelOf(emoji: String): String = byCharacter[emoji]?.n?.get("en") ?: emoji

        private val icons = mapOf(
            "smileys-emotion" to "smiley", "people-body" to "user", "animals-nature" to "paw-print",
            "food-drink" to "fork-knife", "travel-places" to "airplane", "activities" to "soccer-ball",
            "objects" to "lightbulb", "symbols" to "heart", "flags" to "flag",
        )

        val groups: List<GroupInfo>
            get() = file?.groups.orEmpty().mapNotNull { group ->
                val icon = icons[group.key] ?: return@mapNotNull null
                val name = group.name[language] ?: group.name["en"] ?: group.key
                GroupInfo(group.id, icon, name.replaceFirstChar { it.titlecase() })
            }
    }
}
