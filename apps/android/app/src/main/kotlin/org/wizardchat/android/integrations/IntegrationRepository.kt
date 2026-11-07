package org.wizardchat.android.integrations

import java.net.URI
import java.net.URISyntaxException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Fetching a repository: repo.json and its detached signature, checked before anything is read from it */
object IntegrationRepository {
    /** Cap on the detached signature file (a 64-byte signature is 88 base64 characters) */
    private const val MAX_SIGNATURE_BYTES = 1024

    sealed interface UrlResult {
        class Ok(val url: String) : UrlResult
        class Error(val error: String) : UrlResult
    }

    sealed interface FetchResult {
        class Ok(
            val value: RepoManifest,
            val key: String,
            val fingerprint: String,
            val serial: Long,
            val official: Boolean,
        ) : FetchResult

        class Error(val error: String) : FetchResult
    }

    /**
     * Normalises what the user typed into the URL to fetch. A github.com repo URL becomes the raw repo.json at its root.
     * Rejects http, credentials, ports and local or private hosts.
     */
    fun parseRepoUrl(input: String): UrlResult {
        val text = input.trim()
        if (text.isEmpty()) return UrlResult.Error("Enter a repository URL")
        if (text.length > 500) return UrlResult.Error("URL is too long")
        val u = try {
            URI(text)
        } catch (_: URISyntaxException) {
            return UrlResult.Error("Not a valid URL")
        }
        if (u.rawUserInfo != null) return UrlResult.Error("URLs with credentials are not allowed")
        val host = u.host?.lowercase() ?: return UrlResult.Error("Not a valid URL")
        if (u.scheme?.lowercase() != "https") return UrlResult.Error("Only https URLs are allowed")
        if (u.port != -1) return UrlResult.Error("URLs with a port are not allowed")
        if (IntegrationNetwork.isForbiddenHost(host)) return UrlResult.Error("That host is not allowed")

        if (host == "github.com" || host == "www.github.com") {
            val parts = (u.rawPath ?: "").split("/").filter { it.isNotEmpty() }
            val owner = parts.getOrNull(0)
            val repo = parts.getOrNull(1)?.removeSuffix(".git")
            val safe = Regex("^[A-Za-z0-9._-]+$")
            if (owner == null || repo.isNullOrEmpty() || !safe.matches(owner) || !safe.matches(repo)) return UrlResult.Error("Use https://github.com/<owner>/<repo>")
            var ref = "HEAD"
            if (parts.size > 2) {
                if (parts[2] != "tree" || parts.size < 4) return UrlResult.Error("Use https://github.com/<owner>/<repo>[/tree/<ref>]")
                // Branch names may contain "/", so everything after /tree/ is the ref
                ref = parts.drop(3).joinToString("/")
                if (!Regex("^[A-Za-z0-9._\\-/]+$").matches(ref) || ref.split("/").contains("..")) return UrlResult.Error("Invalid branch or tag name")
            }
            return UrlResult.Ok("https://raw.githubusercontent.com/$owner/$repo/$ref/repo.json")
        }
        val path = u.rawPath.takeUnless { it.isNullOrEmpty() } ?: "/"
        return UrlResult.Ok(buildString {
            append("https://").append(host).append(path)
            u.rawQuery?.let { append('?').append(it) }
        })
    }

    /** The one host a repository address talks to (repo.json and its signature); "" if unusable */
    fun repoHost(url: String): String = (parseRepoUrl(url) as? UrlResult.Ok)?.let { URI(it.url).host.lowercase() } ?: ""

    /** The detached signature lives next to repo.json: same URL plus ".sig" */
    private fun signatureUrl(repoUrl: String): String {
        val u = URI(repoUrl)
        return buildString {
            append("https://").append(u.host).append(u.rawPath).append(".sig")
            u.rawQuery?.let { append('?').append(it) }
        }
    }

    /**
     * "Official" needs the official key AND the official address: an old release signed with the official key could otherwise
     * be hosted anywhere and still wear the badge, frozen in time.
     */
    private fun isOfficialSource(url: String, key: String): Boolean {
        if (!IntegrationSignature.isOfficialKey(key)) return false
        val official = parseRepoUrl(OFFICIAL_REPO_URL)
        return official is UrlResult.Ok && official.url == url
    }

    /**
     * Downloads repo.json and repo.json.sig, checks the signature over the exact bytes with the key the file carries, and only
     * then runs the strict validator. Never throws.
     */
    suspend fun fetch(url: String, transport: IntegrationNetwork.Transport = IntegrationNetwork.connection): FetchResult {
        val checked = parseRepoUrl(url)
        if (checked !is UrlResult.Ok) return FetchResult.Error((checked as UrlResult.Error).error)
        val allow = listOf(repoHost(checked.url))
        val (res, sigRes) = coroutineScope {
            val file = async {
                IntegrationNetwork.fetch(
                    IntegrationNetwork.Request(checked.url, allow, IntegrationNetwork.Expect.jsonFile, maxBytes = MAX_MANIFEST_BYTES),
                    transport,
                )
            }
            val signature = async {
                IntegrationNetwork.fetch(
                    IntegrationNetwork.Request(signatureUrl(checked.url), allow, IntegrationNetwork.Expect.signature, maxBytes = MAX_SIGNATURE_BYTES),
                    transport,
                )
            }
            file.await() to signature.await()
        }
        if (res !is IntegrationNetwork.Success) return FetchResult.Error((res as IntegrationNetwork.Failure).error)
        if (sigRes !is IntegrationNetwork.Success) {
            val error = (sigRes as IntegrationNetwork.Failure).error
            if (error.endsWith(" answered 404")) return FetchResult.Error("This repository is not signed, so it cannot be added.")
            return FetchResult.Error("Could not load the signature file: $error")
        }
        val json = res.json
        val keyField = ((json as? JsonObject)?.get("key") as? JsonPrimitive)?.takeIf { it.isString }?.content
        if (keyField == null || !IntegrationSignature.isValidKey(keyField)) return FetchResult.Error("The repository carries a malformed or missing signing key.")
        val verified = IntegrationSignature.verifyRepoSignature(res.bytes, sigRes.text ?: "", keyField)
        if (verified is IntegrationSignature.Check.Failed) return FetchResult.Error(verified.error)
        val parsed = IntegrationManifest.validate(json!!)
        if (parsed !is ValidationResult.Valid) return FetchResult.Error((parsed as ValidationResult.Invalid).error)
        val fingerprint = IntegrationSignature.fingerprintKey(parsed.value.key)
        if (fingerprint.isEmpty()) return FetchResult.Error("This device cannot compute the key fingerprint.")
        return FetchResult.Ok(parsed.value, parsed.value.key, fingerprint, parsed.value.serial, isOfficialSource(url, parsed.value.key))
    }
}
