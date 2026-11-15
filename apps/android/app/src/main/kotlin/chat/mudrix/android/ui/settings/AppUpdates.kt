package chat.mudrix.android.ui.settings

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** What the "Check for updates" row in Settings > About shows */
sealed interface AppUpdateState {
    data object Idle : AppUpdateState
    data object Checking : AppUpdateState
    data object UpToDate : AppUpdateState

    /** The newest release's version */
    data class Available(val version: String) : AppUpdateState
    data object Failed : AppUpdateState
}

/**
 * Whether this build is the newest release, like iOS's `AppUpdates.swift`: the app is handed out as a
 * build from the repository's releases, so the newest release there is what to compare against, and a
 * newer one is a link to its page (Android has no in-app updater either).
 */
object AppUpdates {
    const val RELEASES_URL = "https://github.com/kapsikkum/mudrix/releases/latest"
    const val LATEST_RELEASE_API = "https://api.github.com/repos/kapsikkum/mudrix/releases/latest"

    /** `v26.12.2` as `26.12.2`; a version without a prefix is left as it is */
    fun tidy(version: String): String {
        val trimmed = version.trim()
        return when {
            trimmed.startsWith("v") || trimmed.startsWith("V") -> trimmed.drop(1).trim()
            else -> trimmed
        }
    }

    /** The web treats any difference between the running and the newest version as newer (`isNewerVersion`) */
    fun isNewer(current: String, latest: String): Boolean = tidy(current) != tidy(latest)

    /** The version of a release, from GitHub's release JSON: `tag_name`, else `name` */
    fun latestVersion(json: String): String? {
        val root = runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull() ?: return null
        val tag = listOf("tag_name", "name")
            .mapNotNull { key -> (root[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull }
            .firstOrNull { it.trim().isNotEmpty() }
            ?: return null
        return tidy(tag).ifEmpty { null }
    }

    /** The newest release's version, or null when GitHub cannot be asked */
    suspend fun newestVersion(timeoutMs: Int = 15_000): String? = withContext(Dispatchers.IO) {
        runCatching {
            val connection = URL(LATEST_RELEASE_API).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = timeoutMs
                connection.readTimeout = timeoutMs
                connection.setRequestProperty("Accept", "application/vnd.github+json")
                connection.setRequestProperty("User-Agent", "Mudrix-Android")
                if (connection.responseCode != 200) return@runCatching null
                latestVersion(connection.inputStream.use { it.readBytes() }.decodeToString())
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }

    /** What the check found, from the running version */
    suspend fun check(current: String): AppUpdateState {
        val latest = newestVersion() ?: return AppUpdateState.Failed
        return if (isNewer(current = current, latest = latest)) AppUpdateState.Available(latest) else AppUpdateState.UpToDate
    }
}
