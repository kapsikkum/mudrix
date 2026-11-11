package org.wizardchat.android.ui.cosmetics

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.matrix.ExtendedProfile
import org.wizardchat.android.matrix.ProfileActivity
import org.wizardchat.android.matrix.ProfileFields

/** The nameplates, frames and decorations that ship with the app (the web app's built-in art) */
object CosmeticCatalog {
    data class Nameplate(val id: String, val name: String, val palette: String, val file: String)

    data class FramePiece(val pos: String, val layer: String, val file: String)

    data class Frame(val id: String, val name: String, val pieces: List<FramePiece>)

    /** What a profile shows; only ids of the built-in art are ever kept */
    data class Cosmetics(
        val decoration: String? = null,
        val nameplate: Nameplate? = null,
        val frame: Frame? = null,
        /** What they are playing or listening to (read in the same request) */
        val activities: List<ProfileActivity> = emptyList(),
    ) {
        val isEmpty get() = decoration == null && nameplate == null && frame == null && activities.isEmpty()
    }

    /** Nameplate palette names to the "r, g, b" the web tints with */
    val PALETTES = mapOf(
        "none" to "0, 0, 0", "black" to "0, 0, 0", "crimson" to "144, 0, 7", "berry" to "137, 58, 153", "sky" to "0, 128, 183",
        "teal" to "8, 100, 96", "forest" to "38, 47, 33", "bubble_gum" to "220, 62, 151", "violet" to "115, 11, 200",
        "cobalt" to "1, 49, 194", "clover" to "4, 123, 32", "lemon" to "246, 205, 18", "white" to "255, 255, 255",
    )

    private const val ROOT = "cosmetics"
    private val SAFE_ID = Regex("^[a-z0-9-]{1,64}$")

    private var decorationIds: List<String>? = null
    private var nameplateList: List<Nameplate>? = null
    private var frameList: List<Frame>? = null

    fun assetPath(file: String) = "$ROOT/${file.removePrefix("assets/")}"

    fun decorations(context: Context): List<String> =
        decorationIds ?: runCatching { context.assets.list("$ROOT/decorations").orEmpty() }.getOrDefault(emptyArray())
            .filter { it.endsWith(".svg") }.map { it.removeSuffix(".svg") }.sorted().also { decorationIds = it }

    fun nameplates(context: Context): List<Nameplate> = nameplateList ?: parseNameplates(readJson(context, "nameplates.json")).also { nameplateList = it }

    fun frames(context: Context): List<Frame> = frameList ?: parseFrames(readJson(context, "frames.json")).also { frameList = it }

    private fun readJson(context: Context, name: String): String =
        runCatching { context.assets.open("$ROOT/$name").bufferedReader().use { it.readText() } }.getOrDefault("[]")

    internal fun parseNameplates(json: String): List<Nameplate> =
        (runCatching { Json.parseToJsonElement(json) }.getOrNull() as? JsonArray).orEmpty().mapNotNull { item ->
            val o = item as? JsonObject ?: return@mapNotNull null
            val id = o.text("id")?.takeIf(SAFE_ID::matches) ?: return@mapNotNull null
            val file = o.text("file") ?: return@mapNotNull null
            Nameplate(id, o.text("name") ?: id, o.text("palette") ?: "none", file)
        }

    internal fun parseFrames(json: String): List<Frame> =
        (runCatching { Json.parseToJsonElement(json) }.getOrNull() as? JsonArray).orEmpty().mapNotNull { item ->
            val o = item as? JsonObject ?: return@mapNotNull null
            val id = o.text("id")?.takeIf(SAFE_ID::matches) ?: return@mapNotNull null
            val pieces = (o["pieces"] as? JsonArray).orEmpty().mapNotNull { piece ->
                val p = piece as? JsonObject ?: return@mapNotNull null
                FramePiece(p.text("pos") ?: return@mapNotNull null, p.text("layer") ?: return@mapNotNull null, p.text("file") ?: return@mapNotNull null)
            }
            Frame(id, o.text("name") ?: id, pieces).takeIf { pieces.isNotEmpty() }
        }

    /** The art a profile asks for, limited to what is built in (a profile value is never turned into a path or URL otherwise) */
    fun resolve(context: Context, profile: ExtendedProfile): Cosmetics {
        val decoration = profile.avatarDecoration?.takeIf { it in decorations(context) }
        val nameplate = profile.nameplate?.let { id -> nameplates(context).firstOrNull { it.id == id } }
        val frame = profile.profileFrame?.let { id -> frames(context).firstOrNull { it.id == id } }
        return Cosmetics(decoration, nameplate, frame, ProfileFields.live(profile.activities))
    }

    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
}
