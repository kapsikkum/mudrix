package org.wizardchat.android.integrations

import java.net.URI
import java.net.URISyntaxException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Integration repositories are data only: nothing from a repo.json is ever executed. This file holds the types and a strict
 * hand-written validator, the same rules as the web app's `features/integrations/manifest.ts`. Anything unknown is rejected
 * rather than ignored, so a manifest can never carry a capability the app does not know how to show for approval. Widgets
 * (pages that run code) are known by name so they get a clear message, but this app does not run them: an entry that asks
 * for one is listed and can never be installed.
 */

const val MANIFEST_SCHEMA = 1

/** Cap on the raw repo.json text, in bytes */
const val MAX_MANIFEST_BYTES = 256 * 1024
const val MAX_SETTING_TEXT = 200

val COMPOSER_ICON_NAMES = listOf("send", "download", "link", "plus")
val LINK_FACT_FORMATS = listOf("text", "count", "date")
val SETTING_TYPES = listOf("toggle", "text", "choice")

@Serializable
data class LinkCardRule(
    /** Exact lowercase hostnames. No wildcards, no IPs. */
    val hosts: List<String>,
    /** Only links whose path starts with this match. Exclusive with [pathPattern]. */
    val pathPrefix: String? = null,
    /** Segment pattern such as "/{owner}/{repo}": literal segments match exactly, each `{name}` takes one segment */
    val pathPattern: String? = null,
    val title: String,
    val subtitle: String? = null,
    val buttonLabel: String? = null,
    /** Accepted for compatibility but never shown or fetched */
    val icon: String? = null,
    /** Id of a lookup in this integration's `linkDetails.lookups`. Needs [pathPattern]. */
    val details: String? = null,
    /** Links under any of these paths (whole segments, ignoring case) never match this rule */
    val pathExclude: List<String>? = null,
)

@Serializable
data class ChoiceOption(val value: String, val label: String)

/** A per-integration option the person sets on their device (values are plain data, kept on this device only) */
@Serializable
sealed class IntegrationSetting {
    abstract val id: String
    abstract val label: String
    abstract val description: String?

    @Serializable
    @kotlinx.serialization.SerialName("toggle")
    data class Toggle(override val id: String, override val label: String, override val description: String? = null, val default: Boolean) : IntegrationSetting()

    @Serializable
    @kotlinx.serialization.SerialName("text")
    data class Text(
        override val id: String,
        override val label: String,
        override val description: String? = null,
        val default: String,
        val maxLength: Int,
    ) : IntegrationSetting()

    @Serializable
    @kotlinx.serialization.SerialName("choice")
    data class Choice(
        override val id: String,
        override val label: String,
        override val description: String? = null,
        val default: String,
        val options: List<ChoiceOption>,
    ) : IntegrationSetting()
}

@Serializable
data class LinkFact(val label: String, val field: String, val format: String? = null, @kotlinx.serialization.SerialName("if") val ifToggle: String? = null)

@Serializable
data class LinkLookup(
    val id: String,
    val path: String,
    val title: String? = null,
    val description: String? = null,
    val descriptionIf: String? = null,
    val facts: List<LinkFact>? = null,
)

@Serializable
data class LinkDetailsPermission(val host: String, val lookups: List<LinkLookup>)

@Serializable
data class ComposerAction(val id: String, val label: String, val icon: String? = null, val insert: String)

@Serializable
data class ApiAction(
    val id: String,
    val label: String,
    val path: String,
    val body: Map<String, String>? = null,
    val insertResultLink: String? = null,
)

@Serializable
data class ApiPermission(val host: String, val actions: List<ApiAction>)

@Serializable
data class SlashCommand(
    val name: String,
    val description: String,
    val usage: String? = null,
    val insert: String? = null,
    val api: String? = null,
)

@Serializable
data class Permissions(
    val linkCards: List<LinkCardRule>? = null,
    val linkDetails: LinkDetailsPermission? = null,
    val composerActions: List<ComposerAction>? = null,
    val commands: List<SlashCommand>? = null,
    val api: ApiPermission? = null,
)

enum class Capability { linkCards, linkDetails, composerActions, commands, api }

/** True when the permission set actually offers this capability (non-empty) */
fun Permissions.has(capability: Capability): Boolean = when (capability) {
    Capability.api -> (api?.actions?.size ?: 0) > 0
    Capability.linkDetails -> (linkDetails?.lookups?.size ?: 0) > 0
    Capability.linkCards -> (linkCards?.size ?: 0) > 0
    Capability.composerActions -> (composerActions?.size ?: 0) > 0
    Capability.commands -> (commands?.size ?: 0) > 0
}

@Serializable
data class Integration(
    val id: String,
    val name: String,
    val description: String,
    val version: String,
    val icon: String? = null,
    val permissions: Permissions,
    val settings: List<IntegrationSetting>? = null,
)

/** An entry of a repository that this version of the app can not use: listed so the person sees why, never installable */
@Serializable
data class RejectedIntegration(
    val index: Int,
    val id: String? = null,
    val name: String? = null,
    val error: String,
    /** "unsupported": something this app does not know or does not run (a newer one, a widget); "invalid": a plain mistake */
    val reason: String,
) {
    companion object {
        const val UNSUPPORTED = "unsupported"
        const val INVALID = "invalid"
    }
}

class RepoManifest(
    val key: String,
    val serial: Long,
    val name: String,
    val integrations: List<Integration>,
    /** Entries left out, each with its reason */
    val rejected: List<RejectedIntegration>,
)

sealed interface ValidationResult<out T> {
    class Valid<T>(val value: T) : ValidationResult<T>
    class Invalid(val error: String) : ValidationResult<Nothing>
}

object IntegrationManifest {
    private val ID_PATTERN = Regex("^[a-z0-9][a-z0-9._-]{0,63}$")
    private val ACTION_ID_PATTERN = Regex("^[a-z0-9][a-z0-9._-]{0,31}$")
    private val HOST_LABEL = Regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
    private val COMMAND_NAME_PATTERN = Regex("^[a-z][a-z0-9-]{1,23}$")
    private val API_PATH_PATTERN = Regex("^/[A-Za-z0-9._~/-]*$")
    private val BODY_KEY_PATTERN = Regex("^[A-Za-z0-9_-]{1,32}$")
    private val RESULT_FIELD_PATTERN = Regex("^[A-Za-z0-9_]{1,32}$")
    private val SETTING_ID_PATTERN = Regex("^[a-z][a-zA-Z0-9]{0,23}$")
    private val CHOICE_VALUE_PATTERN = Regex("^[A-Za-z0-9._~-]{1,40}$")
    private val PATTERN_NAME = Regex("^[a-z][a-z0-9_]{0,15}$")
    private val PATTERN_LITERAL = Regex("^[A-Za-z0-9._~-]+$")
    private val FIELD_PART = Regex("^[A-Za-z0-9_]{1,32}$")
    private val FORBIDDEN_FIELD_PARTS = listOf("__proto__", "constructor", "prototype")
    private val LOOKUP_PLACEHOLDER = Regex("\\{([a-z][a-z0-9_]{0,15})\\}")

    private const val MAX_REPO_NAME = 60
    private const val MAX_INTEGRATIONS = 50
    const val MAX_NAME = 40
    private const val MAX_DESCRIPTION = 400
    private const val MAX_VERSION = 20
    private const val MAX_URL = 500
    private const val MAX_LINK_RULES = 10
    private const val MAX_HOSTS = 10
    private const val MAX_ACTIONS = 6
    private const val MAX_LABEL = 24
    private const val MAX_INSERT = 500
    private const val MAX_TEXT = 120
    private const val MAX_PATH_PREFIX = 200
    private const val MAX_API_ACTIONS = 4
    private const val MAX_API_PATH = 200
    private const val MAX_BODY_KEYS = 16
    private const val MAX_BODY_VALUE = 200
    private const val MAX_COMMANDS = 6
    private const val MAX_COMMAND_DESCRIPTION = 80
    private const val MAX_COMMAND_USAGE = 60
    private const val MAX_LOOKUPS = 4
    private const val MAX_FACTS = 6
    private const val MAX_PATH_EXCLUDES = 30
    private const val MAX_PATH_EXCLUDE = 100
    private const val MAX_SETTINGS = 8
    private const val MAX_SETTING_LABEL = 40
    private const val MAX_SETTING_DESCRIPTION = 120
    private const val DEFAULT_SETTING_TEXT = 100
    private const val MAX_CHOICES = 8
    private const val MAX_PATTERN_SEGMENTS = 8

    /** `{room}`-style placeholders and `{setting.<id>}` ones */
    val TEMPLATE_PLACEHOLDER = Regex("\\{(\\w+|setting\\.[a-zA-Z0-9]+)\\}")

    /** Placeholders usable inside `api` action body values */
    val API_PLACEHOLDERS = listOf("room", "text", "args")

    private const val WIDGET_UNSUPPORTED = "widgets are not supported in this app"

    sealed interface PatternSegment {
        class Literal(val text: String) : PatternSegment
        class Name(val name: String) : PatternSegment
    }

    /** Parsed "/{owner}/{repo}" segments, or an error text for a pattern that is not allowed */
    sealed interface PatternParse {
        class Ok(val segments: List<PatternSegment>) : PatternParse
        class Error(val message: String) : PatternParse
    }

    fun parsePathPattern(pattern: String): PatternParse {
        if (!pattern.startsWith("/")) return PatternParse.Error("must start with \"/\"")
        val parts = pattern.substring(1).split("/")
        if (parts.size > MAX_PATTERN_SEGMENTS) return PatternParse.Error("at most $MAX_PATTERN_SEGMENTS segments")
        val names = HashSet<String>()
        val out = ArrayList<PatternSegment>()
        for (part in parts) {
            val m = Regex("^\\{([^{}]*)\\}$").matchEntire(part)
            if (m != null) {
                val name = m.groupValues[1]
                if (!PATTERN_NAME.matches(name)) return PatternParse.Error("invalid placeholder name \"$name\"")
                if (!names.add(name)) return PatternParse.Error("placeholder {$name} is used twice")
                out += PatternSegment.Name(name)
            } else {
                if (!PATTERN_LITERAL.matches(part) || part == "." || part == "..") {
                    return PatternParse.Error("each segment must be {name} or plain text (letters, digits, . _ ~ -)")
                }
                out += PatternSegment.Literal(part)
            }
        }
        return PatternParse.Ok(out)
    }

    /** Placeholder names a pattern captures */
    fun patternNames(pattern: String): List<String> =
        (parsePathPattern(pattern) as? PatternParse.Ok)?.segments?.filterIsInstance<PatternSegment.Name>()?.map { it.name } ?: emptyList()

    /** Placeholder names used in a lookup path */
    fun lookupNames(lookupPath: String): List<String> = LOOKUP_PLACEHOLDER.findAll(lookupPath).map { it.groupValues[1] }.toList()

    // Control characters (newlines included) and invisible or bidi formatting characters that can make text read differently
    private val UNSAFE_CHARS = Regex(
        "[\u0000-\u001F\u007F-\u009F­؜᠎​-‏ -‮⁠-⁯﻿￹-￻]",
    )

    fun hasUnsafeChars(value: String): Boolean = UNSAFE_CHARS.containsMatchIn(value)

    /** Removes the characters [hasUnsafeChars] rejects (for text that did not come from a manifest) */
    fun stripUnsafeChars(value: String): String = UNSAFE_CHARS.replace(value, "")

    private class Fail(message: String) : Exception(message)

    private fun fail(path: String, message: String): Nothing = throw Fail("$path: $message")

    private fun asObject(v: JsonElement?, path: String, allowed: Collection<String>): JsonObject {
        if (v !is JsonObject) fail(path, "must be an object")
        v.keys.forEach { if (it !in allowed) fail("$path.$it", "unknown key") }
        return v
    }

    private fun asArray(v: JsonElement?, path: String, max: Int): JsonArray {
        if (v !is JsonArray) fail(path, "must be an array")
        if (v.size > max) fail(path, "at most $max entries")
        return v
    }

    private fun asString(v: JsonElement?, path: String, max: Int, min: Int = 1): String {
        if (v !is JsonPrimitive || !v.isString) fail(path, "must be a string")
        val s = v.content
        if (s.length < min) fail(path, "must not be empty")
        if (s.length > max) fail(path, "at most $max characters")
        if (hasUnsafeChars(s)) fail(path, "contains control or invisible characters")
        return s
    }

    /** A JSON number as a double; null for anything else (strings, booleans, null) */
    private fun numberOf(v: JsonElement?): Double? =
        if (v is JsonPrimitive && !v.isString) v.content.toDoubleOrNull() else null

    /** true or false only (a string "true" is not a boolean) */
    private fun booleanOf(v: JsonElement?): Boolean? =
        if (v is JsonPrimitive && !v.isString) when (v.content) { "true" -> true; "false" -> false; else -> null } else null

    /** https only, no credentials, a real hostname. Returns the string unchanged. */
    private fun asHttpsUrl(v: JsonElement?, path: String): String {
        val s = asString(v, path, MAX_URL)
        val u = try {
            URI(s)
        } catch (_: URISyntaxException) {
            fail(path, "not a valid URL")
        }
        if (u.scheme?.lowercase() != "https") fail(path, "must be an https URL")
        if (u.rawUserInfo != null) fail(path, "must not contain credentials")
        if (u.host.isNullOrEmpty()) fail(path, "missing host")
        return s
    }

    private fun isIpLike(host: String) = host.contains(':') || host.startsWith("[") || Regex("^[0-9.]+$").matches(host)

    private fun asHost(v: JsonElement?, path: String): String {
        val s = asString(v, path, 253)
        if (s != s.lowercase()) fail(path, "must be lowercase")
        if (isIpLike(s)) fail(path, "IP addresses are not allowed")
        val labels = s.split(".")
        if (labels.size < 2 || !labels.all { HOST_LABEL.matches(it) }) fail(path, "not a valid hostname (no wildcards or ports)")
        return s
    }

    private fun <T> optional(obj: JsonObject, key: String, read: (JsonElement) -> T): T? = obj[key]?.let(read)

    /** Which declared settings a template may use: text and choice values may fill templates, only choice values may be sent */
    private class SettingIds(val text: List<String>, val choice: List<String>, val toggle: List<String>)

    private val NO_SETTINGS = SettingIds(emptyList(), emptyList(), emptyList())

    /** A string whose only braces are complete, allowed placeholders */
    private fun asTemplate(v: JsonElement?, path: String, max: Int, allowed: List<String>, min: Int = 1, settingIds: List<String> = emptyList()): String {
        val s = asString(v, path, max, min)
        val rest = TEMPLATE_PLACEHOLDER.replace(s) { m ->
            val name = m.groupValues[1]
            if (name.startsWith("setting.")) {
                if (name.substring(8) !in settingIds) {
                    fail(path, "{$name} is not a setting that can be used here (declare it in \"settings\"; toggles only work in \"if\", and only choice settings can be sent in an api body)")
                }
                ""
            } else if (name in allowed) {
                ""
            } else {
                m.value
            }
        }
        if (rest.contains('{') || rest.contains('}')) {
            val names = allowed.map { "{$it}" } + settingIds.map { "{setting.$it}" }
            fail(path, "only the ${names.joinToString(", ").ifEmpty { "no" }} placeholder(s) are allowed")
        }
        return s
    }

    /** A plain text that may still use `{setting.<id>}` (other braces are kept as written) */
    private fun asTextWithSettings(v: JsonElement?, path: String, max: Int, settingIds: List<String>): String {
        val s = asString(v, path, max)
        for (m in TEMPLATE_PLACEHOLDER.findAll(s)) {
            val name = m.groupValues[1]
            if (name.startsWith("setting.") && name.substring(8) !in settingIds) fail(path, "{$name} is not a declared text or choice setting")
        }
        return s
    }

    private fun validateLinkCard(v: JsonElement?, path: String, details: LinkDetailsPermission?, ids: SettingIds): LinkCardRule {
        val o = asObject(v, path, listOf("hosts", "pathPrefix", "pathPattern", "pathExclude", "title", "subtitle", "buttonLabel", "icon", "details"))
        val hosts = asArray(o["hosts"], "$path.hosts", MAX_HOSTS).mapIndexed { i, h -> asHost(h, "$path.hosts[$i]") }
        if (hosts.isEmpty()) fail("$path.hosts", "needs at least one host")
        if (hosts.toSet().size != hosts.size) fail("$path.hosts", "duplicate host")
        if (o["pathPrefix"] != null && o["pathPattern"] != null) fail(path, "use either \"pathPrefix\" or \"pathPattern\", not both")
        val pathPattern = optional(o, "pathPattern") { x ->
            val p = asString(x, "$path.pathPattern", MAX_PATH_PREFIX)
            val parsed = parsePathPattern(p)
            if (parsed is PatternParse.Error) fail("$path.pathPattern", parsed.message)
            p
        }
        // With a pattern, the texts may show what it captured; without one they are plain text
        val names = pathPattern?.let { patternNames(it) }
        fun text(x: JsonElement?, at: String) =
            if (names == null) asTextWithSettings(x, at, MAX_TEXT, ids.text) else asTemplate(x, at, MAX_TEXT, names, 1, ids.text)
        val title = text(o["title"], "$path.title")
        val pathPrefix = optional(o, "pathPrefix") { x ->
            val p = asString(x, "$path.pathPrefix", MAX_PATH_PREFIX)
            if (!p.startsWith("/")) fail("$path.pathPrefix", "must start with \"/\"")
            if (Regex("[?#\\s\\\\]").containsMatchIn(p)) fail("$path.pathPrefix", "must be a plain path")
            p
        }
        val pathExclude = optional(o, "pathExclude") { x -> validatePathExclude(x, "$path.pathExclude") }
        val subtitle = optional(o, "subtitle") { x -> text(x, "$path.subtitle") }
        val detailsId = optional(o, "details") { x ->
            val id = asString(x, "$path.details", 32)
            val lookup = details?.lookups?.firstOrNull { it.id == id } ?: fail("$path.details", "no such lookup in permissions.linkDetails.lookups")
            if (names == null) fail("$path.details", "needs a \"pathPattern\"")
            val missing = lookupNames(lookup.path).filter { it !in names }
            if (missing.isNotEmpty()) {
                fail("$path.details", "the lookup path uses ${missing.joinToString(", ") { "{$it}" }}, which this pathPattern does not capture")
            }
            id
        }
        val buttonLabel = optional(o, "buttonLabel") { x -> asString(x, "$path.buttonLabel", MAX_LABEL) }
        val icon = optional(o, "icon") { x -> asHttpsUrl(x, "$path.icon") }
        return LinkCardRule(hosts, pathPrefix, pathPattern, title, subtitle, buttonLabel, icon, detailsId, pathExclude)
    }

    private fun validateSetting(v: JsonElement?, path: String): IntegrationSetting {
        val o = asObject(v, path, listOf("id", "label", "description", "type", "default", "maxLength", "options"))
        val id = asString(o["id"], "$path.id", 24)
        if (!SETTING_ID_PATTERN.matches(id)) fail("$path.id", "must start with a lowercase letter, then letters and digits (up to 24)")
        val label = asString(o["label"], "$path.label", MAX_SETTING_LABEL)
        val description = optional(o, "description") { x -> asString(x, "$path.description", MAX_SETTING_DESCRIPTION) }
        val type = (o["type"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        if (type == null || type !in SETTING_TYPES) fail("$path.type", "must be one of ${SETTING_TYPES.joinToString(", ")}")
        fun only(key: String, forType: String) {
            if (o[key] != null) fail("$path.$key", "only for \"$forType\" settings")
        }
        if (type == "toggle") {
            only("maxLength", "text")
            only("options", "choice")
            val default = booleanOf(o["default"]) ?: fail("$path.default", "must be true or false")
            return IntegrationSetting.Toggle(id, label, description, default)
        }
        if (type == "text") {
            only("options", "choice")
            val maxLength = if (o["maxLength"] == null) {
                DEFAULT_SETTING_TEXT
            } else {
                val n = numberOf(o["maxLength"])
                if (n != null && n == Math.floor(n) && n >= 1 && n <= MAX_SETTING_TEXT) n.toInt() else fail("$path.maxLength", "must be a whole number from 1 to $MAX_SETTING_TEXT")
            }
            val default = asString(o["default"], "$path.default", maxLength, 0)
            return IntegrationSetting.Text(id, label, description, default, maxLength)
        }
        only("maxLength", "text")
        val options = asArray(o["options"], "$path.options", MAX_CHOICES).mapIndexed { i, c ->
            val co = asObject(c, "$path.options[$i]", listOf("value", "label"))
            val value = asString(co["value"], "$path.options[$i].value", 40)
            if (!CHOICE_VALUE_PATTERN.matches(value)) fail("$path.options[$i].value", "letters, digits and . _ ~ - only (up to 40)")
            ChoiceOption(value, asString(co["label"], "$path.options[$i].label", MAX_SETTING_LABEL))
        }
        if (options.size < 2) fail("$path.options", "needs at least two options")
        if (options.map { it.value }.toSet().size != options.size) fail("$path.options", "duplicate option value")
        val default = (o["default"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        if (default == null || options.none { it.value == default }) fail("$path.default", "must be the value of one of the options")
        return IntegrationSetting.Choice(id, label, description, default, options)
    }

    private fun validateSettings(v: JsonElement?, path: String): List<IntegrationSetting> {
        val list = asArray(v, path, MAX_SETTINGS).mapIndexed { i, s -> validateSetting(s, "$path[$i]") }
        if (list.map { it.id }.toSet().size != list.size) fail(path, "duplicate setting id")
        return list
    }

    private fun settingIdsOf(settings: List<IntegrationSetting>?): SettingIds {
        val all = settings.orEmpty()
        return SettingIds(
            text = all.filter { it is IntegrationSetting.Text || it is IntegrationSetting.Choice }.map { it.id },
            choice = all.filterIsInstance<IntegrationSetting.Choice>().map { it.id },
            toggle = all.filterIsInstance<IntegrationSetting.Toggle>().map { it.id },
        )
    }

    private fun asToggleRef(v: JsonElement?, path: String, ids: SettingIds): String {
        val s = asString(v, path, 24)
        if (s !in ids.toggle) fail(path, "must be the id of a toggle setting in \"settings\"")
        return s
    }

    private fun validatePathExclude(v: JsonElement?, path: String): List<String> {
        val list = asArray(v, path, MAX_PATH_EXCLUDES).mapIndexed { i, x ->
            val p = asString(x, "$path[$i]", MAX_PATH_EXCLUDE)
            if (!p.startsWith("/") || p == "/") fail("$path[$i]", "must start with \"/\" and not be \"/\"")
            if (Regex("[?#\\s\\\\{}]").containsMatchIn(p)) fail("$path[$i]", "must be a plain path")
            p
        }
        if (list.isEmpty()) fail(path, "leave it out instead of giving an empty list")
        if (list.map { it.lowercase() }.toSet().size != list.size) fail(path, "duplicate path")
        return list
    }

    private fun validateApiAction(v: JsonElement?, path: String, ids: SettingIds): ApiAction {
        val o = asObject(v, path, listOf("id", "label", "path", "body", "insertResultLink"))
        val id = asString(o["id"], "$path.id", 32)
        if (!ACTION_ID_PATTERN.matches(id)) fail("$path.id", "invalid id")
        val apiPath = asString(o["path"], "$path.path", MAX_API_PATH)
        if (!API_PATH_PATTERN.matches(apiPath) || apiPath.split("/").any { it == ".." || it == "." }) {
            fail("$path.path", "must start with \"/\" and be a plain path (letters, digits, . _ ~ / -)")
        }
        val label = asString(o["label"], "$path.label", MAX_LABEL)
        val body = optional(o, "body") { x ->
            if (x !is JsonObject) fail("$path.body", "must be an object")
            if (x.size > MAX_BODY_KEYS) fail("$path.body", "at most $MAX_BODY_KEYS keys")
            val out = LinkedHashMap<String, String>()
            x.keys.forEach { k ->
                if (!BODY_KEY_PATTERN.matches(k) || k == "__proto__") fail("$path.body.$k", "invalid key")
                // Only choice values may be sent: a free-text setting must never carry a secret to a host
                out[k] = asTemplate(x[k], "$path.body.$k", MAX_BODY_VALUE, API_PLACEHOLDERS, 0, ids.choice)
            }
            out
        }
        val link = optional(o, "insertResultLink") { x ->
            val s = (x as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (s == null || !RESULT_FIELD_PATTERN.matches(s)) fail("$path.insertResultLink", "must be a plain JSON field name")
            s
        }
        return ApiAction(id, label, apiPath, body, link)
    }

    private fun validateApi(v: JsonElement?, path: String, ids: SettingIds): ApiPermission {
        val o = asObject(v, path, listOf("host", "actions"))
        val host = asHost(o["host"], "$path.host")
        val actions = asArray(o["actions"], "$path.actions", MAX_API_ACTIONS).mapIndexed { i, a -> validateApiAction(a, "$path.actions[$i]", ids) }
        if (actions.isEmpty()) fail("$path.actions", "needs at least one action")
        if (actions.map { it.id }.toSet().size != actions.size) fail("$path.actions", "duplicate action id")
        return ApiPermission(host, actions)
    }

    private fun asField(v: JsonElement?, path: String): String {
        val s = asString(v, path, 140)
        val parts = s.split(".")
        if (parts.size > 4 || !parts.all { FIELD_PART.matches(it) && it !in FORBIDDEN_FIELD_PARTS }) {
            fail(path, "must be a JSON field name, or up to 4 of them joined with \".\" (such as owner.login)")
        }
        return s
    }

    private fun validateFact(v: JsonElement?, path: String, ids: SettingIds): LinkFact {
        val o = asObject(v, path, listOf("label", "field", "format", "if"))
        val label = asString(o["label"], "$path.label", MAX_LABEL)
        val field = asField(o["field"], "$path.field")
        val format = optional(o, "format") { x ->
            val s = (x as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (s == null || s !in LINK_FACT_FORMATS) fail("$path.format", "must be one of ${LINK_FACT_FORMATS.joinToString(", ")}")
            s
        }
        val cond = optional(o, "if") { x -> asToggleRef(x, "$path.if", ids) }
        return LinkFact(label, field, format, cond)
    }

    private fun validateLookup(v: JsonElement?, path: String, ids: SettingIds): LinkLookup {
        val o = asObject(v, path, listOf("id", "path", "title", "description", "descriptionIf", "facts"))
        val id = asString(o["id"], "$path.id", 32)
        if (!ACTION_ID_PATTERN.matches(id)) fail("$path.id", "invalid id")
        val lookupPath = asString(o["path"], "$path.path", MAX_API_PATH)
        val rest = LOOKUP_PLACEHOLDER.replace(lookupPath, "x")
        if (!API_PATH_PATTERN.matches(rest) || rest.split("/").any { it == ".." || it == "." } || lookupPath.split("/").any { it == "." || it == ".." }) {
            fail("$path.path", "must start with \"/\" and be a plain path (letters, digits, . _ ~ / -) with {name} placeholders")
        }
        val title = optional(o, "title") { x -> asField(x, "$path.title") }
        val description = optional(o, "description") { x -> asField(x, "$path.description") }
        val descriptionIf = optional(o, "descriptionIf") { x ->
            if (description == null) fail("$path.descriptionIf", "only makes sense together with \"description\"")
            asToggleRef(x, "$path.descriptionIf", ids)
        }
        val facts = optional(o, "facts") { x ->
            asArray(x, "$path.facts", MAX_FACTS).mapIndexed { i, f -> validateFact(f, "$path.facts[$i]", ids) }
        }?.takeIf { it.isNotEmpty() }
        if (title == null && description == null && facts == null) fail(path, "shows nothing: give it a \"title\", a \"description\" or \"facts\"")
        return LinkLookup(id, lookupPath, title, description, descriptionIf, facts)
    }

    private fun validateLinkDetails(v: JsonElement?, path: String, ids: SettingIds): LinkDetailsPermission {
        val o = asObject(v, path, listOf("host", "lookups"))
        val host = asHost(o["host"], "$path.host")
        val lookups = asArray(o["lookups"], "$path.lookups", MAX_LOOKUPS).mapIndexed { i, l -> validateLookup(l, "$path.lookups[$i]", ids) }
        if (lookups.isEmpty()) fail("$path.lookups", "needs at least one lookup")
        if (lookups.map { it.id }.toSet().size != lookups.size) fail("$path.lookups", "duplicate lookup id")
        return LinkDetailsPermission(host, lookups)
    }

    private fun validateCommand(v: JsonElement?, path: String, api: ApiPermission?, ids: SettingIds): SlashCommand {
        val o = asObject(v, path, listOf("name", "description", "usage", "insert", "api", "widget"))
        val name = asString(o["name"], "$path.name", 24)
        if (!COMMAND_NAME_PATTERN.matches(name)) fail("$path.name", "invalid command name")
        val description = asString(o["description"], "$path.description", MAX_COMMAND_DESCRIPTION)
        val usage = optional(o, "usage") { x ->
            val u = asString(x, "$path.usage", MAX_COMMAND_USAGE)
            if (u != "/$name" && !u.startsWith("/$name ")) fail("$path.usage", "must start with \"/$name\"")
            u
        }
        if (listOf(o["insert"], o["api"], o["widget"]).count { it != null } != 1) fail(path, "needs exactly one of \"insert\" or \"api\"")
        if (o["widget"] != null) fail("$path.widget", WIDGET_UNSUPPORTED)
        if (o["insert"] != null) {
            return SlashCommand(name, description, usage, insert = asTemplate(o["insert"], "$path.insert", MAX_INSERT, listOf("room", "args"), 1, ids.text))
        }
        val target = asString(o["api"], "$path.api", 32)
        if (api?.actions?.any { it.id == target } != true) fail("$path.api", "no such action in permissions.api.actions")
        return SlashCommand(name, description, usage, api = target)
    }

    private fun validateAction(v: JsonElement?, path: String, ids: SettingIds): ComposerAction {
        val o = asObject(v, path, listOf("id", "label", "icon", "insert"))
        val id = asString(o["id"], "$path.id", 32)
        if (!ACTION_ID_PATTERN.matches(id)) fail("$path.id", "invalid id")
        val label = asString(o["label"], "$path.label", MAX_LABEL)
        val insert = asTemplate(o["insert"], "$path.insert", MAX_INSERT, listOf("room"), 1, ids.text)
        val icon = optional(o, "icon") { x ->
            val s = (x as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (s == null || s !in COMPOSER_ICON_NAMES) fail("$path.icon", "must be one of ${COMPOSER_ICON_NAMES.joinToString(", ")}")
            s
        }
        return ComposerAction(id, label, icon, insert)
    }

    private fun validatePermissions(v: JsonElement?, path: String, ids: SettingIds): Permissions {
        val o = asObject(v, path, Capability.entries.map { it.name } + "widget")
        if (o["widget"] != null) fail("$path.widget", WIDGET_UNSUPPORTED)
        // linkDetails first: link cards cross-check their `details` against it
        val details = o["linkDetails"]?.let { validateLinkDetails(it, "$path.linkDetails", ids) }
        val linkCards = o["linkCards"]?.let { cards ->
            asArray(cards, "$path.linkCards", MAX_LINK_RULES).mapIndexed { i, r -> validateLinkCard(r, "$path.linkCards[$i]", details, ids) }
        }
        details?.lookups?.forEachIndexed { i, l ->
            if (linkCards?.any { it.details == l.id } != true) fail("$path.linkDetails.lookups[$i]", "no link card uses lookup \"${l.id}\"")
        }
        val composerActions = o["composerActions"]?.let { list ->
            val actions = asArray(list, "$path.composerActions", MAX_ACTIONS).mapIndexed { i, a -> validateAction(a, "$path.composerActions[$i]", ids) }
            if (actions.map { it.id }.toSet().size != actions.size) fail("$path.composerActions", "duplicate action id")
            actions
        }
        // api first: commands cross-check their targets against it
        val api = o["api"]?.let { validateApi(it, "$path.api", ids) }
        val commands = o["commands"]?.let { list ->
            val commands = asArray(list, "$path.commands", MAX_COMMANDS).mapIndexed { i, c -> validateCommand(c, "$path.commands[$i]", api, ids) }
            if (commands.map { it.name }.toSet().size != commands.size) fail("$path.commands", "duplicate command name")
            commands
        }
        return Permissions(linkCards, details, composerActions, commands, api)
    }

    private fun validateIntegration(v: JsonElement?, path: String): Integration {
        val o = asObject(v, path, listOf("id", "name", "description", "version", "icon", "permissions", "settings"))
        val id = asString(o["id"], "$path.id", 64)
        if (!ID_PATTERN.matches(id)) fail("$path.id", "invalid id")
        // Settings first: the permissions' templates may only use settings that exist
        val settings = optional(o, "settings") { x -> validateSettings(x, "$path.settings") }
        val name = asString(o["name"], "$path.name", MAX_NAME)
        val description = asString(o["description"], "$path.description", MAX_DESCRIPTION)
        val version = asString(o["version"], "$path.version", MAX_VERSION)
        val permissions = validatePermissions(o["permissions"], "$path.permissions", settingIdsOf(settings))
        val icon = optional(o, "icon") { x -> asHttpsUrl(x, "$path.icon") }
        // An empty list is the same as none; one canonical shape
        return Integration(id, name, description, version, icon, permissions, settings?.takeIf { it.isNotEmpty() })
    }

    /** Something this app does not know or does not do (an unknown key or value, a widget), as opposed to a plain mistake */
    private fun looksNewer(error: String) =
        error.endsWith(" unknown key") || error.contains(" must be one of ") || error.contains("widgets are not supported")

    /** The entry's id and name for listing it, only when they are well-formed */
    private fun describeRejected(v: JsonElement, index: Int, error: String): RejectedIntegration {
        val o = v as? JsonObject
        val id = (o?.get("id") as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { ID_PATTERN.matches(it) }
        val name = (o?.get("name") as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?.let { stripUnsafeChars(it).trim().take(MAX_NAME) }?.takeIf { it.isNotEmpty() }
        return RejectedIntegration(index, id, name, error, if (looksNewer(error)) RejectedIntegration.UNSUPPORTED else RejectedIntegration.INVALID)
    }

    /**
     * Validates an already parsed value. Never throws. The repository itself (schema, key, serial, name, the list) must be
     * valid or the whole file is refused; each integration is then checked on its own, and one this app can not use is
     * listed in `rejected` instead of failing the rest.
     */
    fun validate(raw: JsonElement): ValidationResult<RepoManifest> {
        return try {
            val o = asObject(raw, "repo", listOf("schema", "key", "serial", "name", "integrations"))
            if (numberOf(o["schema"]) != MANIFEST_SCHEMA.toDouble()) fail("repo.schema", "must be $MANIFEST_SCHEMA")
            val key = asString(o["key"], "repo.key", 44, 44)
            if (!IntegrationSignature.isValidKey(key)) fail("repo.key", "must be base64 of a 32-byte public key")
            val serial = numberOf(o["serial"])
            if (serial == null || serial != Math.floor(serial) || serial < 1 || serial > IntegrationSignature.MAX_SERIAL) {
                fail("repo.serial", "must be an integer from 1 to ${IntegrationSignature.MAX_SERIAL}")
            }
            val name = asString(o["name"], "repo.name", MAX_REPO_NAME)
            val integrations = ArrayList<Integration>()
            val rejected = ArrayList<RejectedIntegration>()
            val seen = HashSet<String>()
            asArray(o["integrations"], "repo.integrations", MAX_INTEGRATIONS).forEachIndexed { i, entry ->
                val path = "repo.integrations[$i]"
                try {
                    val integration = validateIntegration(entry, path)
                    // The first entry with an id wins; a later one with the same id is never offered
                    if (!seen.add(integration.id)) fail("$path.id", "duplicate integration id")
                    integrations += integration
                } catch (e: Fail) {
                    rejected += describeRejected(entry, i, e.message ?: "invalid")
                }
            }
            ValidationResult.Valid(RepoManifest(key, serial.toLong(), name, integrations, rejected))
        } catch (e: Fail) {
            ValidationResult.Invalid(e.message ?: "invalid repository file")
        } catch (_: Exception) {
            ValidationResult.Invalid("invalid repository file")
        }
    }

    /** Size-checks and parses raw repo.json text, then validates it. Never throws. */
    fun parseText(text: String): ValidationResult<RepoManifest> {
        return try {
            if (text.toByteArray(Charsets.UTF_8).size > MAX_MANIFEST_BYTES) return ValidationResult.Invalid("repository file is too large (max 256 KB)")
            val json = try {
                Json.parseToJsonElement(text)
            } catch (_: Exception) {
                return ValidationResult.Invalid("repository file is not valid JSON")
            }
            validate(json)
        } catch (_: Exception) {
            ValidationResult.Invalid("invalid repository file")
        }
    }
}
