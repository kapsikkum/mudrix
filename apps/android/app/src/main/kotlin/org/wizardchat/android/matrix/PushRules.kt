package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.WizardClient

/** How loudly a group of push rules notifies */
enum class NotifLevel {
    off, on, noisy;

    val id: String get() = name

    val title: String
        get() = when (this) {
            off -> L10n.format("settings.notifications.level.off")
            on -> L10n.format("settings.notifications.level.on")
            noisy -> L10n.format("settings.notifications.level.noisy")
        }
}

data class ManagedRule(val ruleId: String, val kind: String)

/** The server-default rules the notification settings control together */
object PushRuleSets {
    val dms = listOf(
        ManagedRule(".m.rule.room_one_to_one", "underride"),
        ManagedRule(".m.rule.encrypted_room_one_to_one", "underride"),
    )
    val rooms = listOf(
        ManagedRule(".m.rule.message", "underride"),
        ManagedRule(".m.rule.encrypted", "underride"),
    )
    val userMention = listOf(
        ManagedRule(".m.rule.is_user_mention", "override"),
        ManagedRule(".m.rule.contains_display_name", "override"),
        ManagedRule(".m.rule.contains_user_name", "content"),
    )
    val roomMention = listOf(
        ManagedRule(".m.rule.is_room_mention", "override"),
        ManagedRule(".m.rule.roomnotif", "override"),
    )
}

/** The account's push rules (`/pushrules/`), read for the notification settings */
class PushRules(json: JsonElement) {
    val global: Map<String, List<JsonElement>>

    init {
        val root = (json as? JsonObject)?.get("global") ?: json
        global = (root as? JsonObject).orEmpty().mapNotNull { (kind, rules) ->
            (rules as? JsonArray)?.let { kind to it.toList() }
        }.toMap()
    }

    private fun rule(managed: ManagedRule): JsonObject? =
        global[managed.kind]?.firstOrNull { it.field("rule_id")?.string == managed.ruleId } as? JsonObject

    fun present(rules: List<ManagedRule>): List<ManagedRule> = rules.filter { rule(it) != null }

    fun level(rules: List<ManagedRule>): NotifLevel {
        val audible = rules.mapNotNull(::rule).filter { rule ->
            (rule["enabled"] as? JsonPrimitive)?.booleanOrNull != false && !isMuted(rule["actions"])
        }
        if (audible.isEmpty()) return NotifLevel.off
        return if (audible.any { hasTweak("sound", it["actions"]) }) NotifLevel.noisy else NotifLevel.on
    }

    val keywords: List<String>
        get() = global["content"].orEmpty().mapNotNull { it.field("rule_id")?.string }.filter { !it.startsWith(".") }

    /** Mention rules keep their highlight; the rest only change sound */
    suspend fun setLevel(level: NotifLevel, rules: List<ManagedRule>, client: WizardClient) {
        for (managed in rules) {
            val rule = rule(managed) ?: continue
            val highlight = hasTweak("highlight", rule["actions"])
            val name = when (level) {
                NotifLevel.off -> "off"
                NotifLevel.on -> if (highlight) "highlightSilent" else "silent"
                NotifLevel.noisy -> if (highlight) "highlight" else "loud"
            }
            client.setPushRuleLevel(managed.kind, managed.ruleId, name)
        }
    }

    private companion object {
        fun JsonElement.field(name: String): JsonElement? = (this as? JsonObject)?.get(name)

        val JsonElement.string: String? get() = (this as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

        fun actions(value: JsonElement?): List<JsonElement> = (value as? JsonArray)?.toList().orEmpty()

        fun isMuted(value: JsonElement?): Boolean {
            val actions = actions(value)
            return actions.isEmpty() || actions.any { it.string == "dont_notify" }
        }

        fun hasTweak(tweak: String, value: JsonElement?): Boolean = actions(value).any {
            it.field("set_tweak")?.string == tweak && (it.field("value") as? JsonPrimitive)?.booleanOrNull != false
        }
    }
}
