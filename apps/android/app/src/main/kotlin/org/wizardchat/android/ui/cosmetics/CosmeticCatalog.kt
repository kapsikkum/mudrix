package org.wizardchat.android.ui.cosmetics

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.matrix.CosmeticPacks
import org.wizardchat.android.matrix.ExtendedProfile
import org.wizardchat.android.matrix.ProfileActivity
import org.wizardchat.android.matrix.ProfileFields

/** The nameplates, frames and decorations that ship with the app (the web app's built-in art) */
object CosmeticCatalog {
    data class Nameplate(val id: String, val name: String, val palette: String, val file: String)

    data class FramePiece(val pos: String, val layer: String, val file: String)

    data class Frame(val id: String, val name: String, val pieces: List<FramePiece>)

    /** Where a cosmetic's picture comes from: shipped art, or media fetched with the viewer's login */
    sealed interface Image {
        data class Asset(val path: String) : Image
        data class Media(val mxc: String) : Image
    }

    data class NameplateArt(val image: Image, val palette: String)

    data class FrameArt(val pos: String, val layer: String, val image: Image)

    /** What a profile shows, already resolved: only shipped art or `mxc://` media is ever drawn */
    data class Cosmetics(
        val decoration: Image? = null,
        val nameplate: NameplateArt? = null,
        val frame: List<FrameArt> = emptyList(),
        val effect: Image? = null,
        /** The one-shot image a pack effect opens with */
        val effectIntro: String? = null,
        /** What they are playing or listening to (read in the same request) */
        val activities: List<ProfileActivity> = emptyList(),
    ) {
        val isEmpty get() = decoration == null && nameplate == null && frame.isEmpty() && effect == null && activities.isEmpty()
    }

    /** Nameplate palette names to the "r, g, b" the web tints with */
    val PALETTES = mapOf(
        "none" to "0, 0, 0", "black" to "0, 0, 0", "crimson" to "144, 0, 7", "berry" to "137, 58, 153", "sky" to "0, 128, 183",
        "teal" to "8, 100, 96", "forest" to "38, 47, 33", "bubble_gum" to "220, 62, 151", "violet" to "115, 11, 200",
        "cobalt" to "1, 49, 194", "clover" to "4, 123, 32", "lemon" to "246, 205, 18", "white" to "255, 255, 255",
    )

    /** The effect ids the web app draws with particles; Android has no art for them, so they are neither listed nor drawn */
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

    /** The art a profile asks for; every value goes through [CosmeticPacks.resolve] first */
    fun resolve(context: Context, profile: ExtendedProfile, showPacks: Boolean): Cosmetics = Cosmetics(
        decoration = decoration(context, CosmeticPacks.resolve(profile.avatarDecoration, showPacks)),
        nameplate = nameplate(context, CosmeticPacks.resolve(profile.nameplate, showPacks)),
        frame = frame(context, CosmeticPacks.resolve(profile.profileFrame, showPacks)),
        effect = effect(CosmeticPacks.resolve(profile.profileEffect, showPacks)),
        activities = ProfileFields.live(profile.activities),
    )

    /** A decoration's art, shipped or from a pack */
    fun decoration(context: Context, value: CosmeticPacks.Value?): Image? = when (value) {
        is CosmeticPacks.Value.Id -> value.id.takeIf { it in decorations(context) }?.let { Image.Asset("$ROOT/decorations/$it.svg") }
        is CosmeticPacks.Value.Media -> value.url.takeIf { it.isNotEmpty() }?.let(Image::Media)
        null -> null
    }

    /** A nameplate's art and the palette its strip is tinted with */
    fun nameplate(context: Context, value: CosmeticPacks.Value?): NameplateArt? = when (value) {
        is CosmeticPacks.Value.Id -> nameplates(context).firstOrNull { it.id == value.id }
            ?.let { NameplateArt(Image.Asset(assetPath(it.file)), it.palette) }
        is CosmeticPacks.Value.Media -> value.url.takeIf { it.isNotEmpty() }
            ?.let { NameplateArt(Image.Media(it), value.palette?.lowercase()?.takeIf(PALETTES::containsKey) ?: "none") }
        null -> null
    }

    /** A profile frame's pieces, by position and layer; a pack frame without pieces is one centred picture */
    fun frame(context: Context, value: CosmeticPacks.Value?): List<FrameArt> = when (value) {
        is CosmeticPacks.Value.Id -> frames(context).firstOrNull { it.id == value.id }
            ?.pieces.orEmpty().map { FrameArt(it.pos, it.layer, Image.Asset(assetPath(it.file))) }
        is CosmeticPacks.Value.Media -> value.pieces.map { FrameArt(it.pos, it.layer ?: "front", Image.Media(it.url)) }
            .ifEmpty { value.url.takeIf { it.isNotEmpty() }?.let { listOf(FrameArt("center", "front", Image.Media(it))) }.orEmpty() }
        null -> emptyList()
    }

    /** A profile effect's art; only pack media is drawn (the shipped effects are web-only particle drawings) */
    fun effect(value: CosmeticPacks.Value?): Image? =
        (value as? CosmeticPacks.Value.Media)?.url?.takeIf { it.isNotEmpty() }?.let(Image::Media)

    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
}
