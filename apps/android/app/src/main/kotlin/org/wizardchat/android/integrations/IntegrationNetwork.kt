package org.wizardchat.android.integrations

import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URI
import java.net.URISyntaxException
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * The only place integrations and link details reach a third-party host (PORT.md, "Network policy"). Nothing else under
 * `integrations` opens a connection, so every rule about outbound requests lives here, the same rules as the web app's
 * `util/integrationFetch.ts`:
 *
 * - https only, no credentials in the URL, default port only, never an IP address or a local-looking name (and, as the
 *   device can see where a name leads, never a name that resolves to a loopback, private or link-local address);
 * - only hosts in the allow-list the caller passes: what the user approved for that integration, or the one host of
 *   the repository address they typed;
 * - no cookies, no referrer, no cache, and the only headers set are Accept, a JSON Content-Type on a POST and, for a
 *   conditional GET, a well-formed If-None-Match;
 * - redirects are not followed by the connection: each hop is checked against the same allow-list, at most three, GET
 *   only (a redirect of a POST is refused);
 * - a size cap counted while the body streams, and a timeout for the whole request;
 * - the answer must be what the caller expects: JSON (parsed here), or for the two files a repository needs, the signed
 *   repo.json (GitHub serves it as `text/plain`) and its detached signature. Nothing else is accepted, so nothing from
 *   an answer is ever markup;
 * - a request nobody asked for (a link card looking something up while a message is on screen) is refused while the
 *   blocker is set, which the app uses for streamer mode.
 *
 * It never throws. Default headers the platform adds itself (User-Agent, Accept-Encoding) are not under its control;
 * icons are never fetched.
 */
object IntegrationNetwork {
    /** No answer may be bigger than this, whatever the caller asks for */
    const val MAX_RESPONSE_BYTES = 1024 * 1024
    const val DEFAULT_TIMEOUT_MS = 10_000
    const val MAX_TIMEOUT_MS = 30_000
    const val MAX_REDIRECTS = 3
    private const val MAX_URL_LENGTH = 2000
    private const val MAX_REQUEST_BODY_BYTES = 64 * 1024
    const val ERR_TOO_LARGE = "file is too large"

    /** What the answer has to be */
    enum class Expect(val accept: String) {
        /** `application/json` or a `+json` type, parsed into `json` */
        json("application/json"),

        /** A repo.json: JSON, but `text/plain` is accepted too */
        jsonFile("application/json, text/plain;q=0.9"),

        /** A short `text/plain` file, the detached signature of a repo.json, returned in `text` */
        signature("text/plain"),
    }

    enum class Reason { blocked, forbidden, redirect, tooLarge, timeout, type, invalid, network }

    class Request(
        val url: String,
        /** Exact lowercase hostnames this request (and every redirect it follows) may reach */
        val allow: List<String>,
        val expect: Expect,
        val maxBytes: Int = MAX_RESPONSE_BYTES,
        val timeoutMs: Int = DEFAULT_TIMEOUT_MS,
        /** A POST (the one thing a user confirmed). Never redirected. */
        val post: Boolean = false,
        /** With `post`: this JSON text as the body */
        val jsonBody: String? = null,
        /** A conditional GET: sent as If-None-Match, only if well formed */
        val ifNoneMatch: String? = null,
        /** Not started by a user action: refused while the blocker is on */
        val passive: Boolean = false,
    )

    sealed interface Result

    class Success(
        /** The URL that finally answered (after any checked redirect) */
        val url: String,
        val bytes: ByteArray,
        val contentType: String,
        /** For `json` and `jsonFile` */
        val json: JsonElement? = null,
        /** For `signature` */
        val text: String? = null,
        /** Only set for a well-formed entity tag */
        val etag: String? = null,
    ) : Result

    class Failure(
        val error: String,
        /** Set when the host answered with an HTTP error (or 304 for a conditional GET) */
        val status: Int? = null,
        /** Set when no answer arrived at all */
        val network: Boolean = false,
        /** Why the app itself refused or gave up, as opposed to the host's answer */
        val reason: Reason? = null,
    ) : Result

    // ---------- the wire: one request, redirects not followed ----------

    class WireRequest(val method: String, val url: String, val headers: Map<String, String>, val body: ByteArray?, val timeoutMs: Int)

    class WireResponse(val status: Int, headers: Map<String, String>, val body: InputStream?) : Closeable {
        /** Header names in lower case */
        val headers: Map<String, String> = headers.mapKeys { it.key.lowercase() }
        override fun close() {
            runCatching { body?.close() }
        }
    }

    /** Sends one request. Only the real one and the tests' fakes implement it. */
    fun interface Transport {
        fun send(request: WireRequest): WireResponse
    }

    /** The platform connection, with the settings the policy needs */
    val connection = Transport { request ->
        val target = URL(request.url)
        // Where a name leads is known here, unlike in a browser: a name that points inside the network is refused
        val host = target.host
        for (address in InetAddress.getAllByName(host)) {
            if (address.isLoopbackAddress || address.isAnyLocalAddress || address.isSiteLocalAddress || address.isLinkLocalAddress || address.isMulticastAddress) {
                throw IOException("$host resolves to a local address")
            }
        }
        val conn = target.openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = false
        conn.useCaches = false
        conn.defaultUseCaches = false
        conn.connectTimeout = request.timeoutMs
        conn.readTimeout = request.timeoutMs
        conn.requestMethod = request.method
        request.headers.forEach { (name, value) -> conn.setRequestProperty(name, value) }
        if (request.body != null) {
            conn.doOutput = true
            conn.setFixedLengthStreamingMode(request.body.size)
            conn.outputStream.use { it.write(request.body) }
        }
        val status = conn.responseCode
        val headers = HashMap<String, String>()
        conn.headerFields.forEach { (name, values) -> if (name != null && values.isNotEmpty()) headers[name] = values.last() }
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        WireResponse(status, headers, stream?.let { Closing(it, conn) })
    }

    /** Disconnects the connection when its body is closed */
    private class Closing(private val inner: InputStream, private val conn: HttpURLConnection) : InputStream() {
        override fun read() = inner.read()
        override fun read(b: ByteArray, off: Int, len: Int) = inner.read(b, off, len)
        override fun close() {
            runCatching { inner.close() }
            conn.disconnect()
        }
    }

    // ---------- the rules ----------

    private var passiveBlocker: (() -> Boolean)? = null

    /** While [blocker] returns true, requests marked `passive` are refused (streamer mode) */
    fun setPassiveBlocker(blocker: (() -> Boolean)?) {
        passiveBlocker = blocker
    }

    fun passiveBlocked(): Boolean = try {
        passiveBlocker?.invoke() == true
    } catch (_: Exception) {
        true
    }

    private val ETAG = Regex("^(W/)?\"[\\x21\\x23-\\x7e]{0,190}\"$")

    /** A strong or weak entity tag as RFC 9110 allows it, kept short; null for anything else */
    fun validEtag(value: String?): String? = value?.takeIf { ETAG.matches(it) }

    private fun isPrivateIpv4(host: String): Boolean {
        val m = Regex("^(\\d+)\\.(\\d+)\\.(\\d+)\\.(\\d+)$").matchEntire(host) ?: return false
        val a = m.groupValues[1].toInt()
        val b = m.groupValues[2].toInt()
        return a == 0 || a == 10 || a == 127 || (a == 100 && b in 64..127) || (a == 169 && b == 254) ||
            (a == 172 && b in 16..31) || (a == 192 && b == 168) || a >= 224
    }

    private val LOCAL_SUFFIX = Regex("\\.(local|localhost|internal|lan|home|corp|intranet)$")

    /** True for hosts that are never contacted: IP literals, single-label and local-looking names */
    fun isForbiddenHost(host: String): Boolean {
        if (host.isEmpty() || host.startsWith("[") || host.contains(':')) return true
        if (Regex("^[0-9.]+$").matches(host) || isPrivateIpv4(host)) return true
        if (!host.contains('.') || host.endsWith(".")) return true
        return LOCAL_SUFFIX.containsMatchIn(host)
    }

    sealed interface UrlCheck {
        class Ok(val uri: URI, val host: String) : UrlCheck
        class Refused(val error: String) : UrlCheck
    }

    /** Whether this address may be requested for an allow-list. Pure. */
    fun checkRequestUrl(raw: String, allow: List<String>): UrlCheck {
        if (raw.length > MAX_URL_LENGTH) return UrlCheck.Refused("invalid address")
        val uri = try {
            URI(raw)
        } catch (_: URISyntaxException) {
            return UrlCheck.Refused("invalid address")
        }
        if (uri.scheme?.lowercase() != "https") return UrlCheck.Refused("only https addresses are allowed")
        if (uri.rawUserInfo != null) return UrlCheck.Refused("addresses with credentials are not allowed")
        // The default port only: an approved host on another port is a different service
        if (uri.port != -1) return UrlCheck.Refused("addresses with a port are not allowed")
        val host = uri.host?.lowercase() ?: return UrlCheck.Refused("invalid address")
        if (isForbiddenHost(host)) return UrlCheck.Refused("$host is not allowed")
        if (host !in allow) return UrlCheck.Refused("$host is not allowed here")
        // Rebuilt from the raw parts, so nothing is decoded or re-encoded; the fragment is dropped
        val text = buildString {
            append("https://").append(host)
            append(uri.rawPath ?: "")
            uri.rawQuery?.let { append('?').append(it) }
        }
        return UrlCheck.Ok(URI(text), host)
    }

    private fun contentTypeAllowed(expect: Expect, type: String): Boolean {
        val isJson = type == "application/json" || Regex("^application/[a-z0-9.+-]+\\+json$").matches(type)
        return when (expect) {
            Expect.json -> isJson
            Expect.jsonFile -> isJson || type == "text/plain"
            Expect.signature -> type == "text/plain"
        }
    }

    private fun fail(error: String, reason: Reason) = Failure(error, reason = reason)

    private class TooLarge : Exception()

    /** Reads the body, giving up as soon as it passes the cap or the time is up */
    private fun readCapped(body: InputStream?, max: Int, deadline: Long): ByteArray {
        if (body == null) return ByteArray(0)
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            if (System.currentTimeMillis() > deadline) throw SocketTimeoutException()
            val read = body.read(buffer)
            if (read < 0) break
            if (out.size() + read > max) throw TooLarge()
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }

    private fun decodeUtf8(bytes: ByteArray): String? = try {
        val text = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes)).toString()
        // Like a browser's decoder, a byte order mark is not part of the text
        text.removePrefix("﻿")
    } catch (_: CharacterCodingException) {
        null
    }

    /**
     * Makes one request under every rule above. [transport] is only for tests; the app never passes it.
     * Never throws.
     */
    suspend fun fetch(request: Request, transport: Transport = connection): Result = withContext(Dispatchers.IO) {
        try {
            run(request, transport)
        } catch (_: Exception) {
            Failure("could not load the file", network = true, reason = Reason.network)
        }
    }

    private fun run(request: Request, transport: Transport): Result {
        val timeoutMs = request.timeoutMs.coerceIn(1, MAX_TIMEOUT_MS)
        val maxBytes = request.maxBytes.coerceIn(1, MAX_RESPONSE_BYTES)
        val hasBody = request.jsonBody != null
        val post = request.post || hasBody
        val allow = request.allow.map { it.lowercase() }
        val first = checkRequestUrl(request.url, allow)
        if (first !is UrlCheck.Ok) return fail((first as UrlCheck.Refused).error, Reason.forbidden)
        if (request.passive && passiveBlocked()) return fail("not asking while streamer mode is on", Reason.blocked)
        val bodyBytes = request.jsonBody?.toByteArray(Charsets.UTF_8)
        if (bodyBytes != null && bodyBytes.size > MAX_REQUEST_BODY_BYTES) return fail("the request is too large", Reason.invalid)

        val headers = LinkedHashMap<String, String>()
        headers["Accept"] = request.expect.accept
        if (hasBody) headers["Content-Type"] = "application/json"
        if (!post) validEtag(request.ifNoneMatch)?.let { headers["If-None-Match"] = it }

        val deadline = System.currentTimeMillis() + timeoutMs
        var current: UrlCheck.Ok = first
        var hop = 0
        while (true) {
            val host = current.host
            val response = try {
                transport.send(WireRequest(if (post) "POST" else "GET", current.uri.toString(), headers, bodyBytes, timeoutMs))
            } catch (_: SocketTimeoutException) {
                return fail("timed out", Reason.timeout)
            } catch (_: IOException) {
                return Failure("could not ${if (post) "reach" else "load"} $host", network = true, reason = Reason.network)
            }
            response.use { res ->
                if (res.status in 300..399 && res.status != 304) {
                    if (post) return fail("$host answered with a redirect, which is not followed", Reason.redirect)
                    val location = res.headers["location"] ?: return fail("$host answered with a redirect, which is not followed", Reason.redirect)
                    if (hop >= MAX_REDIRECTS) return fail("too many redirects", Reason.redirect)
                    val next = try {
                        current.uri.resolve(location).toString()
                    } catch (_: Exception) {
                        return fail("invalid redirect", Reason.redirect)
                    }
                    val check = checkRequestUrl(next, allow)
                    if (check !is UrlCheck.Ok) return fail("redirect refused: ${(check as UrlCheck.Refused).error}", Reason.redirect)
                    current = check
                    hop += 1
                    return@use null
                }
                if (res.status !in 200..299) return Failure("$host answered ${res.status}", status = res.status)
                val declared = res.headers["content-length"]?.toLongOrNull()
                if (declared != null && declared > maxBytes) return Failure(ERR_TOO_LARGE, reason = Reason.tooLarge)
                val contentType = (res.headers["content-type"] ?: "").substringBefore(';').trim().lowercase()
                if (!contentTypeAllowed(request.expect, contentType)) return fail("$host did not answer with the expected kind of file", Reason.type)
                val bytes = try {
                    readCapped(res.body, maxBytes, deadline)
                } catch (_: TooLarge) {
                    return Failure(ERR_TOO_LARGE, reason = Reason.tooLarge)
                } catch (_: SocketTimeoutException) {
                    return fail("timed out", Reason.timeout)
                } catch (_: IOException) {
                    return Failure("could not load $host", network = true, reason = Reason.network)
                }
                val etag = validEtag(res.headers["etag"])
                val text = decodeUtf8(bytes) ?: return fail("$host sent text that is not UTF-8", Reason.invalid)
                return if (request.expect == Expect.signature) {
                    Success(current.uri.toString(), bytes, contentType, text = text, etag = etag)
                } else {
                    val json = try {
                        Json.parseToJsonElement(text)
                    } catch (_: SerializationException) {
                        return fail("$host sent an answer that is not JSON", Reason.invalid)
                    } catch (_: IllegalArgumentException) {
                        return fail("$host sent an answer that is not JSON", Reason.invalid)
                    }
                    // The parser reads a bare word as a string; JSON has none (only numbers, true, false and null)
                    if (json is JsonPrimitive && !json.isString && json !is JsonNull && json.content != "true" && json.content != "false" && json.content.toDoubleOrNull() == null) {
                        return fail("$host sent an answer that is not JSON", Reason.invalid)
                    }
                    Success(current.uri.toString(), bytes, contentType, json = json, etag = etag)
                }
            }
        }
    }
}
