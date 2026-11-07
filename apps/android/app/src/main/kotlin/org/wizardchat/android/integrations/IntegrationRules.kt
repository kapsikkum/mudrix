package org.wizardchat.android.integrations

import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URI
import java.net.URISyntaxException
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.android.integrations.IntegrationManifest.hasUnsafeChars
import org.wizardchat.android.integrations.IntegrationManifest.stripUnsafeChars

@Serializable
data class PendingUpdate(
    val version: String,
    val name: String,
    val description: String,
    val iconUrl: String? = null,
    /** Not in force until approved */
    val permissions: Permissions,
    val settings: List<IntegrationSetting>? = null,
)

@Serializable
data class BlockedUpdate(val reason: String, val error: String)

@Serializable
data class InstalledIntegration(
    val id: String,
    val repoUrl: String,
    val name: String,
    val description: String,
    val version: String,
    /** Exactly what the user approved. Only this is ever acted on. */
    val permissions: Permissions,
    /** The setting declarations approved with those permissions (values are kept apart) */
    val settings: List<IntegrationSetting>? = null,
    val enabled: Boolean = true,
    val approvedAt: Long = 0,
    /** The repository it came from was removed */
    val sourceGone: Boolean = false,
    /** Fingerprint of the repository's pinned key when installed (kept in sync on refresh) */
    val publisherFingerprint: String? = null,
    /** The repository's key was the official one */
    val official: Boolean = false,
    val pendingUpdate: PendingUpdate? = null,
    /** Its repository now lists a version this app can not use; the approved one keeps working */
    val blockedUpdate: BlockedUpdate? = null,
)

@Serializable
data class RepositoryRecord(
    /** The URL actually fetched (a github.com URL is stored as its raw repo.json URL) */
    val url: String,
    val name: String,
    val addedAt: Long,
    val lastFetchedAt: Long? = null,
    val integrations: List<Integration>,
    val rejected: List<RejectedIntegration>? = null,
    /** The pinned signing key (base64 of the raw 32 bytes), trusted on first use */
    val key: String,
    /** Grouped hex fingerprint of [key] */
    val fingerprint: String,
    /** Highest serial seen; a lower one is refused */
    val serial: Long,
    val official: Boolean = false,
    val trustedAt: Long = 0,
    /** Why the last fetch failed; the previous integrations are kept */
    val error: String? = null,
    /** The last fetch was signed by a different key than the pinned one and was refused */
    val keyChanged: Boolean = false,
)

/** Per integration id: capability name -> still granted. Missing means not granted. */
typealias GrantMap = Map<String, Map<String, Boolean>>

/** Integration id -> setting id -> stored value (unchecked; see [IntegrationSettings.resolve]) */
typealias StoredSettings = Map<String, JsonElement>

/** A setting's value on this device: a Boolean (toggle) or a String (text, choice) */
typealias SettingValues = Map<String, Any>

/** Percent-encoding like JavaScript's `encodeURIComponent` */
internal fun encodeUriComponent(text: String): String {
    val out = StringBuilder()
    for (byte in text.toByteArray(Charsets.UTF_8)) {
        val c = byte.toInt() and 0xff
        if (c < 128 && (c.toChar().isLetterOrDigit() || c.toChar() in "-_.!~*'()")) out.append(c.toChar()) else out.append('%').append("%02X".format(c))
    }
    return out.toString()
}

/** Percent-decoding like JavaScript's `decodeURIComponent`: null for a malformed or non-UTF-8 sequence */
internal fun decodeUriComponent(text: String): String? {
    val bytes = java.io.ByteArrayOutputStream()
    var i = 0
    while (i < text.length) {
        val c = text[i]
        if (c == '%') {
            if (i + 3 > text.length) return null
            val hex = text.substring(i + 1, i + 3)
            val value = hex.toIntOrNull(16)?.takeIf { hex.all { ch -> ch in "0123456789abcdefABCDEF" } } ?: return null
            bytes.write(value)
            i += 3
        } else {
            bytes.write(c.toString().toByteArray(Charsets.UTF_8))
            i += 1
        }
    }
    return try {
        Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes.toByteArray())).toString()
    } catch (_: CharacterCodingException) {
        null
    }
}

/** Parses an address from a message, percent-encoding the characters a browser would accept (spaces, non-ASCII, brackets) */
internal fun lenientUri(raw: String): URI? {
    val fixed = buildString {
        for (byte in raw.toByteArray(Charsets.UTF_8)) {
            val c = byte.toInt() and 0xff
            if (c < 0x21 || c > 0x7e || c.toChar() in "\"<>\\^`{|}") append('%').append("%02X".format(c)) else append(c.toChar())
        }
    }
    return try {
        URI(fixed.substringBefore('#'))
    } catch (_: URISyntaxException) {
        null
    }
}

/** What a user's settings do: check, fill templates, decide what a card shows */
object IntegrationSettings {
    val NONE: SettingValues = emptyMap()

    private fun defaultOf(def: IntegrationSetting): Any = when (def) {
        is IntegrationSetting.Toggle -> def.default
        is IntegrationSetting.Text -> def.default
        is IntegrationSetting.Choice -> def.default
    }

    private fun stringOf(value: JsonElement?): String? = (value as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun boolOf(value: JsonElement?): Boolean? =
        (value as? JsonPrimitive)?.takeIf { !it.isString }?.content?.let { when (it) { "true" -> true; "false" -> false; else -> null } }

    /** True when [value] is acceptable for this setting as it is declared now */
    fun isValid(def: IntegrationSetting, value: JsonElement?): Boolean = when (def) {
        is IntegrationSetting.Toggle -> boolOf(value) != null
        is IntegrationSetting.Choice -> stringOf(value)?.let { v -> def.options.any { it.value == v } } == true
        is IntegrationSetting.Text -> stringOf(value)?.let { it.length <= minOf(def.maxLength, MAX_SETTING_TEXT) && !hasUnsafeChars(it) } == true
    }

    /** The value of every declared setting: the stored one when it still fits, else the default */
    fun resolve(defs: List<IntegrationSetting>?, stored: JsonElement?): SettingValues {
        if (defs.isNullOrEmpty()) return NONE
        val raw = stored as? JsonObject
        val out = LinkedHashMap<String, Any>()
        for (def in defs) {
            val v = raw?.get(def.id)
            out[def.id] = if (v != null && isValid(def, v)) {
                when (def) {
                    is IntegrationSetting.Toggle -> boolOf(v)!!
                    else -> stringOf(v)!!
                }
            } else {
                defaultOf(def)
            }
        }
        return out
    }

    /** What `{setting.<id>}` becomes: the text or choice value, plain and capped; "" otherwise */
    fun text(values: SettingValues, id: String): String =
        (values[id] as? String)?.let { stripUnsafeChars(it).take(MAX_SETTING_TEXT) } ?: ""

    /** A toggle's value; a missing or non-boolean one counts as off, and no id counts as on */
    fun on(values: SettingValues, id: String?): Boolean = id == null || values[id] == true

    /**
     * Fills `{name}` from [vars] and `{setting.<id>}` from [settings], in one pass so inserted text is never expanded again.
     * Unknown `{name}`s are kept as written.
     */
    fun render(template: String, vars: Map<String, String>, settings: SettingValues): String =
        IntegrationManifest.TEMPLATE_PLACEHOLDER.replace(template) { m ->
            val name = m.groupValues[1]
            if (name.startsWith("setting.")) text(settings, name.substring(8)) else vars[name] ?: m.value
        }

    /** Whether a lookup would show anything with these settings (if not, nothing is asked) */
    fun lookupShowsAnything(lookup: LinkLookup, settings: SettingValues): Boolean =
        lookup.title != null ||
            (lookup.description != null && on(settings, lookup.descriptionIf)) ||
            (lookup.facts.orEmpty()).any { on(settings, it.ifToggle) }

    /**
     * True when an update changes a setting in a way that could change what is inserted or sent without the templates
     * changing: another type, default, or a new choice value.
     */
    fun widened(prev: List<IntegrationSetting>?, next: List<IntegrationSetting>?): Boolean = next.orEmpty().any { n ->
        val p = prev.orEmpty().firstOrNull { it.id == n.id } ?: return@any false
        if (p::class != n::class || defaultOf(p) != defaultOf(n)) return@any true
        n is IntegrationSetting.Choice && p is IntegrationSetting.Choice && n.options.any { o -> p.options.none { it.value == o.value } }
    }
}

/** Which permissions an update widens, and which hosts an integration can reach */
object IntegrationPermissions {
    private fun ruleCovered(next: LinkCardRule, old: List<LinkCardRule>) = old.any { o ->
        next.hosts.all { it in o.hosts } &&
            (o.pathPrefix == null || (next.pathPrefix ?: "").startsWith(o.pathPrefix)) &&
            o.pathPattern == next.pathPattern &&
            // Dropping an exclusion lets the rule match more links
            (o.pathExclude.orEmpty()).all { it in next.pathExclude.orEmpty() } &&
            o.title == next.title && o.subtitle == next.subtitle && o.buttonLabel == next.buttonLabel && o.icon == next.icon &&
            (next.details == null || o.details == next.details)
    }

    private fun linkDetailsCovered(next: LinkDetailsPermission, old: LinkDetailsPermission?) =
        old != null && old.host == next.host && next.lookups.all { it in old.lookups }

    private fun actionCovered(next: ComposerAction, old: List<ComposerAction>) =
        old.any { it.id == next.id && it.insert == next.insert && it.label == next.label }

    private fun apiActionCovered(next: ApiAction, old: List<ApiAction>) = old.any { o ->
        o.id == next.id && o.label == next.label && o.path == next.path && o.insertResultLink == next.insertResultLink && o.body == next.body
    }

    private fun apiCovered(next: ApiPermission, old: ApiPermission?) =
        old != null && old.host == next.host && next.actions.all { apiActionCovered(it, old.actions) }

    private fun commandCovered(next: SlashCommand, old: List<SlashCommand>) = old.any { o ->
        o.name == next.name && o.description == next.description && o.usage == next.usage && o.insert == next.insert && o.api == next.api
    }

    /**
     * True when [next] lets the integration do anything [prev] did not already allow: a new capability, host, rule, action or
     * command, a broader path, or changed text, request or body the user would see, insert or send. Pure.
     */
    fun widened(prev: Permissions, next: Permissions): Boolean {
        val oldRules = prev.linkCards.orEmpty()
        if (next.linkCards.orEmpty().any { !ruleCovered(it, oldRules) }) return true
        if (next.linkDetails != null && !linkDetailsCovered(next.linkDetails, prev.linkDetails)) return true
        val oldActions = prev.composerActions.orEmpty()
        if (next.composerActions.orEmpty().any { !actionCovered(it, oldActions) }) return true
        if (next.api != null && !apiCovered(next.api, prev.api)) return true
        val oldCommands = prev.commands.orEmpty()
        return next.commands.orEmpty().any { !commandCovered(it, oldCommands) }
    }

    /** Every host an integration with these permissions may contact, for showing before installing: the lookup host and the api host */
    fun contactedHosts(p: Permissions): List<String> = listOfNotNull(p.linkDetails?.host, p.api?.host).distinct()
}

/** Which integrations are active, and what their rules match */
object IntegrationMatching {
    class LinkCardMatch(
        val integrationId: String,
        val integrationName: String,
        val rule: LinkCardRule,
        /** What the rule's `pathPattern` captured from the link (decoded); empty without a pattern */
        val captures: Map<String, String>,
        /** The rule's texts with the captures filled in */
        val title: String,
        val subtitle: String?,
        /** The integration's setting values (checked; defaults where nothing valid is stored) */
        val settings: SettingValues,
    )

    class ActiveComposerAction(val action: ComposerAction, val integrationId: String, val integrationName: String, val settings: SettingValues)

    class ActiveApiAction(val action: ApiAction, val integrationId: String, val integrationName: String, val host: String, val settings: SettingValues)

    class ActiveCommand(
        val name: String,
        val description: String,
        val usage: String?,
        /** Template, for an insert command */
        val insert: String?,
        /** Id of an action in the same integration's api actions, for an api command */
        val api: String?,
        val integrationId: String,
        val integrationName: String,
        val settings: SettingValues,
    ) {
        val isApi get() = api != null
    }

    class LinkLookupRef(val host: String, val lookup: LinkLookup, val allow: List<String>)

    private fun active(i: InstalledIntegration, grants: GrantMap, cap: Capability) = i.enabled && grants[i.id]?.get(cap.name) == true

    /**
     * The hosts a request for this capability may reach right now: the one host the person approved for it, and only while the
     * integration is enabled and the capability is still switched on. This is the allow-list [IntegrationNetwork] receives.
     */
    fun allowedHosts(i: InstalledIntegration, grants: GrantMap, cap: Capability): List<String> {
        if (cap != Capability.linkDetails && cap != Capability.api) return emptyList()
        if (!active(i, grants, cap)) return emptyList()
        val host = (if (cap == Capability.api) i.permissions.api?.host else i.permissions.linkDetails?.host)
        return listOfNotNull(host)
    }

    /** An installed integration's setting values, checked against what it declares */
    fun settingsOf(i: InstalledIntegration, stored: StoredSettings?): SettingValues {
        if (i.settings == null) return IntegrationSettings.NONE
        return IntegrationSettings.resolve(i.settings, stored?.get(i.id))
    }

    /** `/s` covers `/s` and `/s/...` but not `/sx` */
    private fun pathUnder(pathname: String, prefix: String): Boolean {
        if (prefix == "/") return true
        val base = prefix.removeSuffix("/")
        return pathname == base || pathname.startsWith("$base/")
    }

    private const val MAX_CAPTURE = 100

    /**
     * Matches a link path against a `pathPattern` by whole segments; the link may continue below the pattern. Returns the
     * decoded captures, or null. A capture that is empty, "." or "..", too long, not decodable or holds control or
     * invisible characters makes the rule not match.
     */
    fun matchPathPattern(pathname: String, pattern: String): Map<String, String>? {
        val want = (IntegrationManifest.parsePathPattern(pattern) as? IntegrationManifest.PatternParse.Ok)?.segments ?: return null
        val have = pathname.substring(1.coerceAtMost(pathname.length)).split("/")
        if (have.size < want.size) return null
        val out = LinkedHashMap<String, String>()
        for (i in want.indices) {
            when (val seg = want[i]) {
                is IntegrationManifest.PatternSegment.Literal -> if (have[i] != seg.text) return null
                is IntegrationManifest.PatternSegment.Name -> {
                    val value = decodeUriComponent(have[i]) ?: return null
                    if (value.isEmpty() || value == "." || value == ".." || value.length > MAX_CAPTURE || hasUnsafeChars(value)) return null
                    out[seg.name] = value
                }
            }
        }
        return out
    }

    /** Fills `{name}` placeholders from the captures and `{setting.<id>}` from the settings, in one pass */
    fun fillCaptures(template: String, captures: Map<String, String>, settings: SettingValues = IntegrationSettings.NONE) =
        IntegrationSettings.render(template, captures, settings)

    /** True when the path is under one of the rule's `pathExclude` paths (whole segments, any case) */
    private fun excluded(pathname: String, rule: LinkCardRule): Boolean {
        val p = pathname.lowercase()
        return rule.pathExclude.orEmpty().any { pathUnder(p, it.lowercase()) }
    }

    /** First enabled, granted link-card rule matching this link by exact host (default port) and path */
    fun matchLinkCard(url: String, installed: List<InstalledIntegration>, grants: GrantMap, stored: StoredSettings? = null): LinkCardMatch? {
        val u = lenientUri(url) ?: return null
        // Default port only: an approved host on another port is a different service
        if (u.scheme?.lowercase() != "https" || u.rawUserInfo != null || u.port != -1) return null
        val host = u.host?.lowercase() ?: return null
        val path = u.normalize().rawPath.takeUnless { it.isNullOrEmpty() } ?: "/"
        for (i in installed) {
            if (!active(i, grants, Capability.linkCards)) continue
            for (rule in i.permissions.linkCards.orEmpty()) {
                if (host !in rule.hosts || excluded(path, rule)) continue
                val settings = settingsOf(i, stored)
                if (rule.pathPattern != null) {
                    val captures = matchPathPattern(path, rule.pathPattern) ?: continue
                    return LinkCardMatch(
                        i.id, i.name, rule, captures,
                        fillCaptures(rule.title, captures, settings),
                        rule.subtitle?.takeIf { it.isNotEmpty() }?.let { fillCaptures(it, captures, settings) },
                        settings,
                    )
                } else if (pathUnder(path, rule.pathPrefix ?: "/")) {
                    return LinkCardMatch(
                        i.id, i.name, rule, emptyMap(),
                        fillCaptures(rule.title, emptyMap(), settings),
                        rule.subtitle?.takeIf { it.isNotEmpty() }?.let { fillCaptures(it, emptyMap(), settings) },
                        settings,
                    )
                }
            }
        }
        return null
    }

    /** The approved lookup for a matched card, if its integration still has the linkDetails grant */
    fun findLinkLookup(match: LinkCardMatch, installed: List<InstalledIntegration>, grants: GrantMap): LinkLookupRef? {
        val detailsId = match.rule.details ?: return null
        val i = installed.firstOrNull { it.id == match.integrationId } ?: return null
        val details = i.permissions.linkDetails
        if (!active(i, grants, Capability.linkDetails) || details == null) return null
        val lookup = details.lookups.firstOrNull { it.id == detailsId } ?: return null
        return LinkLookupRef(details.host, lookup, allowedHosts(i, grants, Capability.linkDetails))
    }

    /** Composer actions of every enabled integration whose composerActions grant is still on */
    fun composerActions(installed: List<InstalledIntegration>, grants: GrantMap, stored: StoredSettings? = null): List<ActiveComposerAction> =
        installed.filter { active(it, grants, Capability.composerActions) }.flatMap { i ->
            val settings = settingsOf(i, stored)
            i.permissions.composerActions.orEmpty().map { ActiveComposerAction(it, i.id, i.name, settings) }
        }

    /** API actions of every enabled integration whose api grant is still on */
    fun apiActions(installed: List<InstalledIntegration>, grants: GrantMap, stored: StoredSettings? = null): List<ActiveApiAction> =
        installed.filter { active(it, grants, Capability.api) && it.permissions.api != null }.flatMap { i ->
            val api = i.permissions.api!!
            val settings = settingsOf(i, stored)
            api.actions.map { ActiveApiAction(it, i.id, i.name, api.host, settings) }
        }

    /**
     * Slash commands of enabled, granted integrations. Names in [reserved] (built-in commands and aliases) are dropped so an
     * integration can never shadow them; between integrations the first installed wins. Api commands also need the api grant
     * and an existing target action.
     */
    fun commands(installed: List<InstalledIntegration>, grants: GrantMap, reserved: Set<String>, stored: StoredSettings? = null): List<ActiveCommand> {
        val seen = HashSet<String>()
        val out = ArrayList<ActiveCommand>()
        for (i in installed) {
            if (!active(i, grants, Capability.commands)) continue
            for (c in i.permissions.commands.orEmpty()) {
                val name = c.name.lowercase()
                if (name in reserved || name in seen) continue
                if (c.api != null) {
                    if (!active(i, grants, Capability.api)) continue
                    if (i.permissions.api?.actions?.any { it.id == c.api } != true) continue
                } else if (c.insert == null) {
                    continue
                }
                seen += name
                out += ActiveCommand(c.name, c.description, c.usage, c.insert, c.api, i.id, i.name, settingsOf(i, stored))
            }
        }
        return out
    }

    private const val MAX_ARGS = 500

    /**
     * Fills `{room}` (URL-encoded), `{args}` (what was typed after the command, as plain text minus control and invisible
     * characters, capped) and `{setting.<id>}`. The result is plain text for the composer, in one pass.
     */
    fun renderInsert(insert: String, roomId: String, args: String = "", settings: SettingValues = IntegrationSettings.NONE): String =
        IntegrationSettings.render(insert, mapOf("room" to encodeUriComponent(roomId), "args" to stripUnsafeChars(args).take(MAX_ARGS)), settings)
}

/** Updating, versions and what to do when a repository is refreshed */
object IntegrationUpdates {
    /** Compares dotted versions numerically where possible; > 0 means [a] is newer */
    fun compareVersions(a: String, b: String): Int {
        val pa = a.replace(Regex("^v", RegexOption.IGNORE_CASE), "").split(Regex("[.\\-+]"))
        val pb = b.replace(Regex("^v", RegexOption.IGNORE_CASE), "").split(Regex("[.\\-+]"))
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrElse(i) { "0" }
            val y = pb.getOrElse(i) { "0" }
            val nx = x.isNotEmpty() && x.all { it in '0'..'9' }
            val ny = y.isNotEmpty() && y.all { it in '0'..'9' }
            val d = if (nx && ny) (x.toBigInteger() - y.toBigInteger()).signum() else x.compareTo(y)
            if (d != 0) return d
        }
        return 0
    }

    /** The capabilities an integration with these permissions asks to be granted */
    fun grantsFor(permissions: Permissions): Map<String, Boolean> =
        Capability.entries.filter { permissions.has(it) }.associate { it.name to true }

    /** Applies a refreshed repository's integration to an installed one. Permissions only change if not widened. */
    fun reconcile(inst: InstalledIntegration, fresh: Integration?, rejected: RejectedIntegration? = null): InstalledIntegration {
        if (fresh == null) {
            // Listed, but in a form this app can not use: keep the approved version as it is
            if (rejected != null) {
                val blocked = BlockedUpdate(rejected.reason, rejected.error)
                return if (inst.blockedUpdate == blocked && !inst.sourceGone) inst else inst.copy(sourceGone = false, blockedUpdate = blocked)
            }
            // No longer offered by its repository: it keeps working but is flagged, like a removed source
            return if (inst.sourceGone) inst else inst.copy(sourceGone = true)
        }
        // Settings travel with the permissions their templates were approved with: both or neither
        val widened = IntegrationPermissions.widened(inst.permissions, fresh.permissions) || IntegrationSettings.widened(inst.settings, fresh.settings)
        if (widened) {
            // Keep the approved permissions in force until the user re-approves (even if the version did not change)
            return inst.copy(
                sourceGone = false,
                blockedUpdate = null,
                pendingUpdate = PendingUpdate(fresh.version, fresh.name, fresh.description, fresh.icon, fresh.permissions, fresh.settings),
            )
        }
        val unchanged = inst.pendingUpdate == null && inst.blockedUpdate == null && !inst.sourceGone &&
            fresh.version == inst.version && fresh.name == inst.name && fresh.description == inst.description &&
            fresh.permissions == inst.permissions && fresh.settings == inst.settings
        if (unchanged) return inst
        // Narrower or equal: safe to take as is. This does not depend on the version string, so a publisher can always
        // withdraw a permission, even by re-using or lowering the version.
        return inst.copy(
            pendingUpdate = null,
            blockedUpdate = null,
            sourceGone = false,
            version = fresh.version,
            name = fresh.name,
            description = fresh.description,
            permissions = fresh.permissions,
            settings = fresh.settings,
        )
    }
}

/** API actions: one fixed-shape POST to the single host the user approved. The UI shows [preview] and asks before [call]. */
object IntegrationApi {
    const val MAX_API_BODY_BYTES = 8 * 1024
    const val MAX_API_RESPONSE_BYTES = 64 * 1024
    private const val MAX_RESULT_LINK = 500

    class Context(
        val roomId: String,
        /** The composer draft. For a command this equals [args]. */
        val text: String,
        /** Text after the slash command; empty for a menu action */
        val args: String,
        /** The integration's setting values; only choice values can appear in a body */
        val settings: SettingValues = IntegrationSettings.NONE,
    )

    sealed interface Preview {
        class Ok(val url: String, val host: String, val path: String, val body: String?) : Preview
        class Error(val error: String) : Preview
    }

    sealed interface CallResult {
        class Ok(val link: String? = null) : CallResult
        class Error(val error: String) : CallResult
    }

    /**
     * Builds exactly what will be sent. Placeholder values are substituted into the template's string values (as data, in one
     * pass so inserted text is never re-expanded) and the whole object is then serialised, so quotes and newlines in user
     * text can not break out of the JSON.
     */
    fun preview(permissions: Permissions, action: ApiAction, ctx: Context): Preview {
        val api = permissions.api ?: return Preview.Error("This integration has no API access")
        val url = "https://${api.host}${action.path}"
        try {
            val u = URI(url)
            if (u.host != api.host || u.rawPath != action.path || u.rawQuery != null || u.rawFragment != null || u.port != -1) return Preview.Error("Invalid request path")
        } catch (_: URISyntaxException) {
            return Preview.Error("Invalid request URL")
        }
        var body: String? = null
        if (action.body != null) {
            val values = mapOf("room" to ctx.roomId, "text" to ctx.text, "args" to ctx.args)
            val filled = JsonObject(action.body.mapValues { (_, v) -> JsonPrimitive(IntegrationSettings.render(v, values, ctx.settings)) })
            body = Json.encodeToString(JsonObject.serializer(), filled)
            if (body.toByteArray(Charsets.UTF_8).size > MAX_API_BODY_BYTES) return Preview.Error("The message is too long to send (max 8 KB)")
        }
        return Preview.Ok(url, api.host, action.path, body)
    }

    /** The link only if it stays on the api host or one of the integration's own link-card hosts */
    private fun safeResultLink(raw: JsonElement?, perms: Permissions): String? {
        val text = (raw as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
        if (text.length > MAX_RESULT_LINK || hasUnsafeChars(text)) return null
        val u = try {
            URI(text)
        } catch (_: URISyntaxException) {
            return null
        }
        if (u.scheme?.lowercase() != "https" || u.rawUserInfo != null || u.port != -1) return null
        val hosts = HashSet<String>(perms.linkCards.orEmpty().flatMap { it.hosts })
        perms.api?.let { hosts += it.host }
        val host = u.host?.lowercase() ?: return null
        val href = u.toString()
        if (host !in hosts || href.length > MAX_RESULT_LINK) return null
        return href
    }

    /** Sends the request, only to the hosts in [allow]. Never throws; errors only ever name the host and status. */
    suspend fun call(permissions: Permissions, action: ApiAction, ctx: Context, allow: List<String>, transport: IntegrationNetwork.Transport = IntegrationNetwork.connection): CallResult {
        return try {
            val req = preview(permissions, action, ctx)
            if (req !is Preview.Ok) return CallResult.Error((req as Preview.Error).error)
            val res = IntegrationNetwork.fetch(
                IntegrationNetwork.Request(
                    url = req.url,
                    allow = allow,
                    expect = IntegrationNetwork.Expect.json,
                    maxBytes = MAX_API_RESPONSE_BYTES,
                    post = true,
                    jsonBody = req.body,
                ),
                transport,
            )
            when (res) {
                // An oversized answer, or one that is not JSON, still means the service responded; there is just no link to read
                is IntegrationNetwork.Failure -> if (res.reason in listOf(IntegrationNetwork.Reason.tooLarge, IntegrationNetwork.Reason.invalid, IntegrationNetwork.Reason.type)) CallResult.Ok() else CallResult.Error(res.error)
                is IntegrationNetwork.Success -> {
                    val field = action.insertResultLink
                    val json = res.json
                    if (field != null && json is JsonObject) CallResult.Ok(safeResultLink(json[field], permissions)) else CallResult.Ok()
                }
            }
        } catch (_: Exception) {
            CallResult.Error("Request failed")
        }
    }
}

/** Link details: what a lookup asks for, and the plain text taken out of the answer. Nothing here renders. */
object IntegrationDetails {
    private const val MAX_TITLE = 120
    private const val MAX_DESCRIPTION = 300
    private const val MAX_FACT = 60

    class Fact(val label: String, val value: String)

    class Details(val title: String?, val description: String?, val facts: List<Fact>) {
        companion object {
            val EMPTY = Details(null, null, emptyList())
        }
    }

    sealed interface LookupUrl {
        class Ok(val url: String) : LookupUrl
        class Error(val error: String) : LookupUrl
    }

    /**
     * The exact URL a lookup requests for these captures, or why there is none. Values are percent-encoded, so they can not add
     * segments, a query or a fragment; a path that would still contain a "." or ".." segment is refused.
     */
    fun buildLookupUrl(host: String, lookup: LinkLookup, captures: Map<String, String>): LookupUrl {
        var missing = false
        val path = Regex("\\{([a-z][a-z0-9_]{0,15})\\}").replace(lookup.path) { m ->
            val value = captures[m.groupValues[1]]
            if (value == null) {
                missing = true
                ""
            } else {
                encodeUriComponent(value)
            }
        }
        if (missing) return LookupUrl.Error("The link does not fill the lookup path")
        if (path.split("/").any { it == "." || it == ".." }) return LookupUrl.Error("Invalid lookup path")
        val url = "https://$host$path"
        try {
            val u = URI(url)
            if (u.host != host || u.rawPath != path || u.rawQuery != null || u.rawFragment != null || u.port != -1) return LookupUrl.Error("Invalid lookup path")
        } catch (_: URISyntaxException) {
            return LookupUrl.Error("Invalid lookup URL")
        }
        return LookupUrl.Ok(url)
    }

    /** Reads a dotted field from parsed JSON, own properties only */
    private fun readField(json: JsonElement?, field: String): JsonElement? {
        var cur = json
        for (part in field.split(".")) {
            if (cur !is JsonObject) return null
            cur = cur[part] ?: return null
        }
        return cur
    }

    private val WHITESPACE = Regex("[\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]")

    /** Plain, single-line, capped text; "" when nothing is left */
    fun cleanText(value: String, max: Int): String {
        // Newlines are unsafe characters too, so turn whitespace into spaces before stripping the rest
        val s = stripUnsafeChars(WHITESPACE.replace(value, " ")).replace(Regex(" {2,}"), " ").trim()
        return if (s.length > max) s.take(max - 1) + "…" else s
    }

    private fun numberOf(value: JsonElement?): Double? =
        (value as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()?.takeIf { it.isFinite() }

    private fun compact(value: Double, locale: Locale): String {
        val suffixes = listOf("", "K", "M", "B", "T")
        var n = BigDecimal(value)
        var index = 0
        while (n.abs() >= BigDecimal(1000) && index < suffixes.lastIndex) {
            n = n.divide(BigDecimal(1000))
            index++
            // A value that rounds up to 1000 belongs to the next unit
            if (n.abs().setScale(1, RoundingMode.HALF_EVEN) >= BigDecimal(1000) && index < suffixes.lastIndex) {
                n = n.divide(BigDecimal(1000))
                index++
            }
        }
        val format = NumberFormat.getInstance(locale).apply {
            maximumFractionDigits = 1
            minimumFractionDigits = 0
            roundingMode = RoundingMode.HALF_EVEN
        }
        return format.format(n) + suffixes[index]
    }

    private fun parseDate(text: String, zone: ZoneId): java.time.ZonedDateTime? {
        runCatching { return Instant.parse(text).atZone(zone) }
        runCatching { return OffsetDateTime.parse(text).atZoneSameInstant(zone) }
        runCatching { return LocalDateTime.parse(text).atZone(zone) }
        // A bare date is read as UTC, like a browser does
        runCatching { return LocalDate.parse(text).atStartOfDay(ZoneId.of("UTC")).withZoneSameInstant(zone) }
        return null
    }

    /** Formats a value for display, or "" when it cannot be shown in that format */
    fun formatValue(value: JsonElement?, format: String, locale: Locale = Locale.getDefault(), zone: ZoneId = ZoneId.systemDefault()): String {
        if (format == "count") {
            val n = numberOf(value) ?: return ""
            return runCatching { compact(n, locale) }.getOrDefault(n.toString())
        }
        if (format == "date") {
            val text = (value as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return ""
            if (text.length > 40) return ""
            val date = parseDate(text, zone) ?: return ""
            return runCatching { DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(date) }.getOrDefault(date.toLocalDate().toString())
        }
        (value as? JsonPrimitive)?.takeIf { it.isString }?.let { return cleanText(it.content, MAX_FACT) }
        numberOf(value)?.let { return if (it == Math.floor(it) && Math.abs(it) < 1e15) it.toLong().toString() else it.toString() }
        return ""
    }

    /** Picks the approved fields out of an answer. Missing, empty or unusable fields are left out, and so are the ones switched off in settings. */
    fun extract(json: JsonElement?, lookup: LinkLookup, locale: Locale = Locale.getDefault(), settings: SettingValues = IntegrationSettings.NONE, zone: ZoneId = ZoneId.systemDefault()): Details {
        var title: String? = null
        var description: String? = null
        val facts = ArrayList<Fact>()
        if (lookup.title != null) {
            val v = (readField(json, lookup.title) as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (v != null && cleanText(v, MAX_TITLE).isNotEmpty()) title = cleanText(v, MAX_TITLE)
        }
        if (lookup.description != null && IntegrationSettings.on(settings, lookup.descriptionIf)) {
            val v = (readField(json, lookup.description) as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (v != null && cleanText(v, MAX_DESCRIPTION).isNotEmpty()) description = cleanText(v, MAX_DESCRIPTION)
        }
        for (f in lookup.facts.orEmpty()) {
            if (!IntegrationSettings.on(settings, f.ifToggle)) continue
            val value = formatValue(readField(json, f.field), f.format ?: "text", locale, zone)
            if (value.isNotEmpty()) facts += Fact(f.label, value)
        }
        return Details(title, description, facts)
    }
}
