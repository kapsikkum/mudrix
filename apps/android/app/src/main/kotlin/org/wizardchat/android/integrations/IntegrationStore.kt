package org.wizardchat.android.integrations

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** What the person approved for a repository they are about to add: shown to them first, nothing stored until they confirm */
class RepositoryPreview(
    val url: String,
    val name: String,
    val key: String,
    val fingerprint: String,
    val serial: Long,
    val official: Boolean,
    val integrationCount: Int,
    val alreadyAdded: Boolean,
    /** The verified content, kept so confirming stores exactly what the user was shown */
    val integrations: List<Integration>,
    /** Entries this app can not use; listed, never installable */
    val rejected: List<RejectedIntegration>,
)

sealed interface ActionResult {
    data object Ok : ActionResult
    class Error(val error: String) : ActionResult
}

sealed interface PreviewResult {
    class Ok(val preview: RepositoryPreview) : PreviewResult
    class Error(val error: String) : PreviewResult
}

/**
 * Repositories, installed integrations, the capabilities the person switched on and their setting values. Everything lives on
 * this device only (device-only stores `integrations.*`, like the web app's) and is never synced. Failures to read or write
 * must never break the app. All changes are made on the main thread.
 */
class IntegrationStore(private val storage: Storage) {
    interface Storage {
        fun get(key: String): String?
        fun put(key: String, value: String)
    }

    var repositories by mutableStateOf(listOf<RepositoryRecord>())
        private set
    var installed by mutableStateOf(listOf<InstalledIntegration>())
        private set
    var grants by mutableStateOf<GrantMap>(emptyMap())
        private set

    /** Per integration id: the setting values as stored (never trusted; see [IntegrationSettings.resolve]) */
    var settings by mutableStateOf<StoredSettings>(emptyMap())
        private set

    init {
        repositories = read(KEY_REPOSITORIES, ListSerializer(RepositoryRecord.serializer())) ?: emptyList()
        installed = read(KEY_INSTALLED, ListSerializer(InstalledIntegration.serializer())) ?: emptyList()
        grants = read(KEY_GRANTS, MapSerializer(String.serializer(), MapSerializer(String.serializer(), Boolean.serializer()))) ?: emptyMap()
        settings = read(KEY_SETTINGS, MapSerializer(String.serializer(), JsonElement.serializer())) ?: emptyMap()
    }

    private fun <T> read(key: String, serializer: kotlinx.serialization.KSerializer<T>): T? =
        try {
            storage.get(key)?.let { JSON.decodeFromString(serializer, it) }
        } catch (_: Exception) {
            null
        }

    private fun <T> write(key: String, serializer: kotlinx.serialization.KSerializer<T>, value: T) {
        try {
            storage.put(key, JSON.encodeToString(serializer, value))
        } catch (_: Exception) {
            // Storage full or unavailable: keep working in memory
        }
    }

    private fun saveRepositories(list: List<RepositoryRecord>) {
        repositories = list
        write(KEY_REPOSITORIES, ListSerializer(RepositoryRecord.serializer()), list)
    }

    private fun saveInstalled(list: List<InstalledIntegration>) {
        installed = list
        write(KEY_INSTALLED, ListSerializer(InstalledIntegration.serializer()), list)
    }

    private fun saveGrants(map: GrantMap) {
        grants = map
        write(KEY_GRANTS, MapSerializer(String.serializer(), MapSerializer(String.serializer(), Boolean.serializer())), map)
    }

    private fun saveSettings(map: StoredSettings) {
        settings = map
        write(KEY_SETTINGS, MapSerializer(String.serializer(), JsonElement.serializer()), map)
    }

    // ---------- repositories ----------

    /** Step 1 of adding: fetch and verify, store nothing. The UI shows the key fingerprint. */
    suspend fun previewRepository(input: String, transport: IntegrationNetwork.Transport = IntegrationNetwork.connection): PreviewResult {
        val parsed = IntegrationRepository.parseRepoUrl(input)
        if (parsed !is IntegrationRepository.UrlResult.Ok) return PreviewResult.Error((parsed as IntegrationRepository.UrlResult.Error).error)
        val res = IntegrationRepository.fetch(parsed.url, transport)
        if (res !is IntegrationRepository.FetchResult.Ok) return PreviewResult.Error((res as IntegrationRepository.FetchResult.Error).error)
        return PreviewResult.Ok(
            RepositoryPreview(
                parsed.url, res.value.name, res.key, res.fingerprint, res.serial, res.official,
                res.value.integrations.size, repositories.any { it.url == parsed.url },
                res.value.integrations, res.value.rejected,
            ),
        )
    }

    /** Step 2 of adding: the user accepted the fingerprint, so the key is pinned */
    fun confirmRepository(preview: RepositoryPreview, now: Long = System.currentTimeMillis()): ActionResult {
        if (repositories.any { it.url == preview.url }) return ActionResult.Error("That repository is already added")
        if (repositories.size >= MAX_REPOSITORIES) return ActionResult.Error("You can add at most $MAX_REPOSITORIES repositories. Remove one first.")
        saveRepositories(
            repositories + RepositoryRecord(
                preview.url, preview.name, now, now, preview.integrations, preview.rejected.takeIf { it.isNotEmpty() },
                preview.key, preview.fingerprint, preview.serial, preview.official, now,
            ),
        )
        // A repository that returns after being removed re-adopts integrations installed from it, but only those approved
        // under exactly this key. Anything installed under another key stays cut off.
        saveInstalled(
            installed.map { i ->
                if (i.repoUrl != preview.url || i.publisherFingerprint != preview.fingerprint) i
                else i.copy(sourceGone = false, publisherFingerprint = preview.fingerprint, official = preview.official)
            },
        )
        return ActionResult.Ok
    }

    /** Removes the repository only. Installed integrations stay, marked as having lost their source. */
    fun removeRepository(url: String) {
        saveRepositories(repositories.filter { it.url != url })
        saveInstalled(installed.map { if (it.repoUrl == url) it.copy(sourceGone = true) else it })
    }

    suspend fun refreshRepository(url: String, transport: IntegrationNetwork.Transport = IntegrationNetwork.connection, now: Long = System.currentTimeMillis()): ActionResult {
        val current = repositories.firstOrNull { it.url == url } ?: return ActionResult.Error("Unknown repository")
        fun refuse(error: String, keyChanged: Boolean = false): ActionResult {
            saveRepositories(repositories.map { if (it.url == url) it.copy(error = error, keyChanged = it.keyChanged || keyChanged) else it })
            return ActionResult.Error(error)
        }
        val res = IntegrationRepository.fetch(url, transport)
        if (res !is IntegrationRepository.FetchResult.Ok) return refuse((res as IntegrationRepository.FetchResult.Error).error)
        // The repository may have been removed, or removed and added again under another key, while the request was in
        // flight; what was fetched was checked against the old pin.
        val still = repositories.firstOrNull { it.url == url }
        if (still == null || still.key != current.key || still.addedAt != current.addedAt) return ActionResult.Error("The repository changed while it was being refreshed")
        val decision = IntegrationSignature.checkRepoUpdate(current.key, current.serial, res.key, res.serial)
        if (decision is IntegrationSignature.Check.Failed) return refuse(decision.error, decision.keyChanged)
        saveRepositories(
            repositories.map {
                if (it.url != url) it
                else RepositoryRecord(
                    url, res.value.name, it.addedAt, now, res.value.integrations, res.value.rejected.takeIf { r -> r.isNotEmpty() },
                    it.key, it.fingerprint, res.serial, res.official, it.trustedAt,
                )
            },
        )
        saveInstalled(
            installed.map { i ->
                if (i.repoUrl == url && i.publisherFingerprint == current.fingerprint) {
                    IntegrationUpdates.reconcile(
                        i,
                        res.value.integrations.firstOrNull { it.id == i.id },
                        res.value.rejected.firstOrNull { it.id == i.id },
                    ).copy(publisherFingerprint = current.fingerprint, official = res.official)
                } else {
                    i
                }
            },
        )
        return ActionResult.Ok
    }

    // ---------- integrations ----------

    /** Installs with exactly the permissions the user approved (which may be fewer than offered) */
    fun install(integration: Integration, repoUrl: String, approved: Permissions, now: Long = System.currentTimeMillis()): ActionResult {
        if (IntegrationPermissions.widened(integration.permissions, approved)) return ActionResult.Error("Approved permissions exceed what the integration offers")
        val repo = repositories.firstOrNull { it.url == repoUrl } ?: return ActionResult.Error("Unknown repository")
        // Only an entry that passed validation as part of this repository can be installed
        if (repo.integrations.none { it.id == integration.id }) return ActionResult.Error("This integration is not offered by that repository")
        val clash = installed.firstOrNull { it.id == integration.id }
        if (clash != null && clash.repoUrl != repoUrl && !clash.sourceGone) {
            return ActionResult.Error("\"${clash.name}\" with the same id is already installed from another repository. Uninstall it first.")
        }
        val entry = InstalledIntegration(
            id = integration.id,
            repoUrl = repoUrl,
            name = integration.name,
            description = integration.description,
            version = integration.version,
            permissions = approved,
            settings = integration.settings,
            enabled = true,
            approvedAt = now,
            publisherFingerprint = repo.fingerprint,
            official = repo.official,
        )
        saveInstalled(installed.filter { it.id != entry.id } + entry)
        saveGrants(grants + (entry.id to IntegrationUpdates.grantsFor(approved)))
        return ActionResult.Ok
    }

    fun uninstall(id: String) {
        saveInstalled(installed.filter { it.id != id })
        saveSettings(settings - id)
        saveGrants(grants - id)
    }

    fun setEnabled(id: String, enabled: Boolean) {
        saveInstalled(installed.map { if (it.id == id) it.copy(enabled = enabled) else it })
    }

    /** Turns one capability off (granted = false) or back on, only if it was approved */
    fun setGrant(id: String, capability: Capability, granted: Boolean) {
        val inst = installed.firstOrNull { it.id == id } ?: return
        if (!inst.permissions.has(capability)) return
        saveGrants(grants + (id to ((grants[id] ?: emptyMap()) + (capability.name to granted))))
    }

    /** Accepts the pending update: new permissions take effect and new capabilities are granted */
    fun approveUpdate(id: String, now: Long = System.currentTimeMillis()): ActionResult {
        val inst = installed.firstOrNull { it.id == id }
        val pending = inst?.pendingUpdate ?: return ActionResult.Error("No update pending")
        saveInstalled(
            installed.map {
                if (it.id != id) it
                else it.copy(
                    version = pending.version, name = pending.name, description = pending.description,
                    permissions = pending.permissions, settings = pending.settings, approvedAt = now, pendingUpdate = null,
                )
            },
        )
        val next = LinkedHashMap(grants[id] ?: emptyMap())
        Capability.entries.forEach { c ->
            // Capabilities the user had switched off stay off; new ones start granted
            val offered = pending.permissions.has(c)
            if (offered && next[c.name] == null) next[c.name] = true
            if (!offered) next.remove(c.name)
        }
        saveGrants(grants + (id to next))
        return ActionResult.Ok
    }

    /** Drops a pending update without applying it */
    fun dismissUpdate(id: String) {
        saveInstalled(installed.map { if (it.id == id) it.copy(pendingUpdate = null) else it })
    }

    // ---------- setting values ----------

    /** Stores one setting value, only if the installed integration declares it and the value fits */
    fun setSetting(id: String, settingId: String, value: JsonElement) {
        val def = installed.firstOrNull { it.id == id }?.settings?.firstOrNull { it.id == settingId } ?: return
        if (!IntegrationSettings.isValid(def, value)) return
        val own = (settings[id] as? JsonObject) ?: JsonObject(emptyMap())
        saveSettings(settings + (id to JsonObject(own + (settingId to value))))
    }

    /** Back to the declared defaults */
    fun resetSettings(id: String) {
        saveSettings(settings - id)
    }

    companion object {
        private const val KEY_REPOSITORIES = "integrations.repositories"
        private const val KEY_INSTALLED = "integrations.installed"
        private const val KEY_GRANTS = "integrations.grants"
        private const val KEY_SETTINGS = "integrations.settings"

        /** A sanity cap: each repository can hold up to 256 KB of integrations */
        const val MAX_REPOSITORIES = 20

        private val JSON = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

        private var instance: IntegrationStore? = null

        /** The store of this device, in its own preferences file (not the synced one) */
        fun get(context: Context): IntegrationStore = instance ?: synchronized(this) {
            instance ?: IntegrationStore(
                object : Storage {
                    private val prefs = context.applicationContext.getSharedPreferences("integrations", Context.MODE_PRIVATE)
                    override fun get(key: String): String? = prefs.getString(key, null)
                    override fun put(key: String, value: String) {
                        prefs.edit().putString(key, value).apply()
                    }
                },
            ).also { instance = it }
        }
    }
}
