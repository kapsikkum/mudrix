package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** "Block all invites" (MSC4380): an account data event the homeserver reads to reject invites */
object InviteBlocking {
    const val STABLE_TYPE = "m.invite_permission_config"
    const val UNSTABLE_TYPE = "org.matrix.msc4380.invite_permission_config"

    private val blockedCodes = setOf("M_INVITE_BLOCKED", "ORG.MATRIX.MSC4155.INVITE_BLOCKED")

    /** The event type the server understands, or null when it has no invite blocking */
    fun eventType(unstableFeatures: List<String>): String? = when {
        "org.matrix.msc4380.stable" in unstableFeatures -> STABLE_TYPE
        "org.matrix.msc4380" in unstableFeatures -> UNSTABLE_TYPE
        else -> null
    }

    fun isBlocked(content: JsonElement?): Boolean =
        ((content as? JsonObject)?.get("default_action") as? JsonPrimitive)?.contentOrNull == "block"

    fun content(blocked: Boolean): JsonObject =
        if (blocked) JsonObject(mapOf("default_action" to JsonPrimitive("block"))) else JsonObject(emptyMap())

    fun isBlockedError(errcode: String?): Boolean = errcode != null && errcode.uppercase() in blockedCodes
}
