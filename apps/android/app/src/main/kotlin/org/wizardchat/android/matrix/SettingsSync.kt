package org.wizardchat.android.matrix

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.wizardchat.core.LoadState
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

/**
 * Settings in Matrix account data, compatible with the web app (`client/settingsSync.ts`): one
 * nested event `{ theme, customThemes, messageLayout, language, preferences: { ... } }`. Only
 * non-secret appearance and behaviour choices belong here; the homeserver admin can read it.
 */
object SettingsSync {
    /** The current event */
    val SETTINGS_TYPE = Namespace.mudrixKey("settings")

    /** Where earlier Mudrix versions kept the settings; every save also writes it, and it is read first */
    val PREVIOUS_SETTINGS_TYPE = Namespace.legacyMudrixKey("settings")

    /** Every name a save writes */
    val WRITE_TYPES = listOf(SETTINGS_TYPE, PREVIOUS_SETTINGS_TYPE)

    /** The WizardChat base's flat settings, a fallback that is never written */
    val WIZARDCHAT_SETTINGS_TYPE = Namespace.wizardchatKey("settings")

    /** The older WizardChat web app's event */
    const val LEGACY_SETTINGS_TYPE = "io.gitlab.wizardchat.settings"

    /** Every settings event, best source first */
    val READ_TYPES = listOf(PREVIOUS_SETTINGS_TYPE, SETTINGS_TYPE, WIZARDCHAT_SETTINGS_TYPE, LEGACY_SETTINGS_TYPE)

    /** The first settings event the account has, in the order of [READ_TYPES] */
    fun pick(contents: Map<String, JsonElement?>): JsonObject? =
        READ_TYPES.firstNotNullOfOrNull { contents[it] as? JsonObject }

    /** Whether the account has saved Mudrix settings yet (as opposed to only WizardChat's) */
    fun hasMudrixSettings(contents: Map<String, JsonElement?>): Boolean =
        WRITE_TYPES.any { contents[it] is JsonObject }

    /** The same text for equal values, whatever the key order */
    fun stable(value: JsonElement?): String = when (value) {
        null, JsonNull -> "null"
        is JsonObject -> value.entries.sortedBy { it.key }.joinToString(",", "{", "}") { (k, v) -> "${JsonPrimitive(k)}:${stable(v)}" }
        is JsonArray -> value.joinToString(",", "[", "]") { stable(it) }
        else -> value.toString()
    }

    /**
     * What to write to the settings event [type]: the content already stored there with only the
     * keys that differ from [current] replaced. Keys this version does not know (written by the
     * web app or a newer version) are kept. With no saved Mudrix settings yet ([writeAll]),
     * everything is written.
     */
    fun mergeForWrite(
        contents: Map<String, JsonElement?>,
        type: String,
        next: JsonObject,
        current: JsonObject,
        writeAll: Boolean,
    ): JsonObject {
        // A name nothing has been saved under yet starts from the other one, so it is not left partial
        val stored = (listOf(type) + WRITE_TYPES).firstNotNullOfOrNull { contents[it] as? JsonObject }
        val base = LinkedHashMap<String, JsonElement>(stored.orEmpty())
        fun changed(a: JsonElement?, b: JsonElement?) = writeAll || stable(a) != stable(b)

        for ((key, value) in next) {
            if (key == "preferences") continue
            if (changed(value, current[key])) base[key] = value
        }
        val nextPrefs = next["preferences"] as? JsonObject
        if (nextPrefs != null) {
            val currentPrefs = current["preferences"] as? JsonObject
            val prefs = LinkedHashMap<String, JsonElement>((base["preferences"] as? JsonObject).orEmpty())
            for ((key, value) in nextPrefs) {
                if (changed(value, currentPrefs?.get(key))) prefs[key] = value
            }
            base["preferences"] = JsonObject(prefs)
        }
        return JsonObject(base)
    }
}

/**
 * Keeps [prefs] and the account's settings in step: applies what the account has (live), and
 * writes local changes after a short pause.
 */
class SettingsSyncer(
    private val client: WizardClient,
    private val prefs: AppPreferences,
    private val scope: CoroutineScope,
) {
    private val contents = HashMap<String, JsonElement?>()
    private var subscriptions: List<Subscription> = emptyList()
    private var pushJob: Job? = null

    /** Whether the account's data has loaded; nothing is written before, or an empty account would be taken for a new one */
    private var ready = false

    fun start() {
        subscriptions = SettingsSync.READ_TYPES.map { type ->
            client.watchAccountData(type) { content ->
                scope.launch {
                    contents[type] = content
                    applyRemote()
                    if (ready) schedulePush()
                }
            }
        } + client.watchLoadState { state ->
            if (state != LoadState.loading) scope.launch { becomeReady() }
        }
        prefs.onSyncedSettingsChange = { if (ready) schedulePush() }
    }

    private suspend fun becomeReady() {
        if (ready) return
        for (type in SettingsSync.READ_TYPES) {
            if (type !in contents) contents[type] = runCatching { client.cachedAccountData(type) }.getOrNull()
        }
        ready = true
        applyRemote()
        schedulePush()
    }

    fun stop() {
        prefs.onSyncedSettingsChange = null
        pushJob?.cancel()
        subscriptions.forEach { it.cancel() }
        subscriptions = emptyList()
    }

    private fun applyRemote() {
        val raw = SettingsSync.pick(contents) ?: return
        prefs.applySettings(prefs.sanitizeSettings(raw))
    }

    private fun schedulePush() {
        pushJob?.cancel()
        pushJob = scope.launch {
            delay(PUSH_DELAY_MS)
            push()
        }
    }

    private suspend fun push() {
        val next = prefs.settingsSnapshot()
        val current = SettingsSync.pick(contents)?.let(prefs::sanitizeSettings) ?: JsonObject(emptyMap())
        // Until the first save there is no Mudrix event, only (maybe) WizardChat's copy to carry over
        val hasSaved = SettingsSync.hasMudrixSettings(contents)
        if (hasSaved && SettingsSync.stable(next) == SettingsSync.stable(current)) return
        // Under the current name and the one earlier versions read, so devices not updated yet keep following
        val writes = SettingsSync.WRITE_TYPES.map { type -> type to SettingsSync.mergeForWrite(contents, type, next, current, !hasSaved) }
        for ((type, content) in writes) {
            if (runCatching { client.setAccountData(type, content) }.isSuccess) contents[type] = content
        }
    }

    private companion object {
        const val PUSH_DELAY_MS = 500L
    }
}
