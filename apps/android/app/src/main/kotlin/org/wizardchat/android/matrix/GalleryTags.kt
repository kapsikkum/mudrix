package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The gallery tag Mudrix puts on each image of a multi-image send so other clients show them as one set */
object GalleryTags {
    val KEY = Namespace.mudrixKey("gallery")
    private const val MAX_ID = 64

    /** Shared by every image sent together */
    data class Tag(val id: String, val index: Int, val count: Int)

    /** A still picture (GIFs included) can be in a gallery; SVG and anything else cannot */
    fun isGalleryImage(mimetype: String): Boolean = mimetype.startsWith("image/") && mimetype != "image/svg+xml"

    /** One tag per file, in order: the images of a send with two or more of them, null for the rest */
    fun plan(mimeTypes: List<String>, id: String): List<Tag?> {
        val images = mimeTypes.count(::isGalleryImage)
        if (images < 2 || id.isEmpty() || id.length > MAX_ID) return List(mimeTypes.size) { null }
        var index = 0
        return mimeTypes.map { if (isGalleryImage(it)) Tag(id, index++, images) else null }
    }

    /** The content key a tag is sent under, merged into the message */
    fun content(tag: Tag): JsonObject = buildJsonObject {
        put(KEY, buildJsonObject {
            put("id", tag.id)
            put("index", tag.index)
            put("count", tag.count)
        })
    }
}
