package chat.mudrix.android.matrix

import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** What the event needs to know about an uploaded image */
data class UploadedImage(val mxc: String, val mimetype: String, val info: JsonObject)

/** Same order as the input; null where the upload failed or was left undone by a cancel */
data class PooledResult(val uploaded: List<UploadedImage?>, val errors: Map<Int, String>, val cancelled: Boolean)

/** Bulk upload for emoji and sticker packs: the web's `packUpload.ts` and `packSize.ts` rules */
object PackUpload {
    const val CONCURRENCY = 4
    const val MAX_SHORTCODE = 100

    val ALLOWED_MIME = setOf("image/png", "image/jpeg", "image/gif", "image/webp", "image/apng")

    private val SHORTCODE = Regex("^[a-zA-Z0-9_-]+$")

    fun isValidShortcode(code: String): Boolean = code.isNotEmpty() && code.length <= MAX_SHORTCODE && SHORTCODE.matches(code)

    /** A shortcode from a file name: letters, digits, `-` and `_` only */
    fun shortcodeFromFile(fileName: String, fallback: String = "image"): String =
        fileName
            .replace(Regex("\\.[^.]+$"), "")
            .lowercase()
            .replace(Regex("[^a-z0-9_-]"), "_")
            .replace(Regex("_+"), "_")
            .trim('_')
            .ifEmpty { fallback }

    /** [base], or `base_2`, `base_3` ... until it isn't in [used]; the winner is added to [used] */
    fun uniqueShortcode(base: String, used: MutableSet<String>): String {
        var candidate = base
        var index = 1
        while (candidate in used) {
            index += 1
            candidate = "${base}_$index"
        }
        used.add(candidate)
        return candidate
    }

    /** The key a file is remembered by after it uploaded, so retry and resume only upload what's missing */
    fun resumeKey(uri: String, size: Long?): String = "$uri:${size ?: -1}"

    fun numberedName(name: String, index: Int, total: Int): String = if (total > 1) "$name (${index + 1})" else name

    /** The size of one image in the event: its key, the colon and comma around it, and its entry */
    private fun entryBytes(code: String, entry: JsonElement): Int =
        JsonPrimitive(code).toString().toByteArray(Charsets.UTF_8).size + 1 + entry.toString().toByteArray(Charsets.UTF_8).size + 1

    /**
     * Splits [images] into chunks that each fit a pack event within [budget] bytes, once the pack's own
     * header ([header], the content without images) is counted. Always at least one chunk.
     */
    fun splitImagesBySize(header: JsonObject, images: Map<String, JsonElement>, budget: Int = PackSize.BUDGET_BYTES): List<Map<String, JsonElement>> {
        val headerBytes = PackSize.contentBytes(JsonObject(header + ("images" to JsonObject(emptyMap())))) + 32
        val chunks = mutableListOf<Map<String, JsonElement>>()
        var current = linkedMapOf<String, JsonElement>()
        var used = headerBytes
        for ((code, entry) in images) {
            val bytes = entryBytes(code, entry)
            if (used + bytes > budget && current.isNotEmpty()) {
                chunks.add(current)
                current = linkedMapOf()
                used = headerBytes
            }
            current[code] = entry
            used += bytes
        }
        if (current.isNotEmpty() || chunks.isEmpty()) chunks.add(current)
        return chunks
    }

    /** One image as the pack event holds it */
    fun imageEntry(mxc: String, body: String, info: JsonObject): JsonObject = buildJsonObject {
        put("url", mxc)
        put("body", body)
        put("info", info)
    }

    /**
     * The pack events for [images]: one, or several when they don't fit one event. Each part keeps [base]'s `pack`
     * fields under a numbered name; with [iconFromFirst] a part without an icon takes its first image as one.
     */
    fun partContents(base: JsonObject, name: String, images: Map<String, JsonElement>, iconFromFirst: Boolean = false): List<JsonObject> {
        val pack = base["pack"] as? JsonObject ?: JsonObject(emptyMap())
        // Room for the icon each part may get, so adding it never pushes a part over the budget
        val icon = if (iconFromFirst && "avatar_url" !in pack) mapOf("avatar_url" to JsonPrimitive("mxc://${"x".repeat(80)}")) else emptyMap()
        val header = JsonObject(base + ("pack" to JsonObject(pack + icon + ("display_name" to JsonPrimitive(name)))))
        val chunks = splitImagesBySize(header, images)
        return chunks.mapIndexed { index, chunk ->
            val fields = pack.toMutableMap()
            fields["display_name"] = JsonPrimitive(numberedName(name, index, chunks.size))
            val first = (chunk.values.firstOrNull() as? JsonObject)?.get("url")
            if (iconFromFirst && "avatar_url" !in fields && first != null) fields["avatar_url"] = first
            JsonObject(base + mapOf("pack" to JsonObject(fields), "images" to JsonObject(chunk.mapValues { it.value })))
        }
    }

    /**
     * How many pack events [shortcodes] will take once uploaded, before they are: each is guessed as a typical
     * entry on [domain] (the web's `estimateEntryBytes`)
     */
    fun plannedPackCount(shortcodes: List<String>, domain: String, name: String): Int {
        val info = buildJsonObject {
            put("w", 1024)
            put("h", 1024)
            put("mimetype", "image/png")
        }
        val images = shortcodes.associateWith { imageEntry("mxc://$domain/${"x".repeat(24)}", it, info) }
        val base = buildJsonObject {
            put("pack", buildJsonObject {
                put("display_name", name)
                put("usage", JsonArray(listOf(JsonPrimitive("emoticon"), JsonPrimitive("sticker"))))
            })
        }
        return partContents(base, name, images).size
    }

    /** The server refused the event for its size (`M_TOO_LARGE`, or HTTP 413) */
    fun isTooLarge(error: Throwable): Boolean {
        val text = error.message.orEmpty()
        return Regex("M_TOO_LARGE|too large|\\b413\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)
    }

    fun isRateLimited(error: Throwable): Boolean =
        Regex("M_LIMIT_EXCEEDED|\\b429\\b|too many requests", RegexOption.IGNORE_CASE).containsMatchIn(error.message.orEmpty())

    /** Waits 1 s, 2 s, 4 s ... (at most 30 s) between tries; a Retry-After hint wins when the message carries one */
    fun retryDelayMs(error: Throwable, attempt: Int): Long {
        val hinted = Regex("retry_after_ms\\D{0,4}(\\d+)").find(error.message.orEmpty())?.groupValues?.get(1)?.toLongOrNull()
        return (hinted ?: (1000L shl attempt.coerceAtMost(5))).coerceIn(250L, 30_000L)
    }

    /** Runs [block] again on a rate limit, up to [attempts] tries; [sleep] is replaced in tests */
    suspend fun <T> withRateLimitRetry(attempts: Int = 4, sleep: suspend (Long) -> Unit = { delay(it) }, block: suspend () -> T): T {
        var attempt = 0
        while (true) {
            try {
                return block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (!isRateLimited(e) || attempt >= attempts - 1) throw e
                sleep(retryDelayMs(e, attempt))
                attempt += 1
            }
        }
    }

    /**
     * Uploads [files] with bounded [concurrency]. [done] maps resume keys of earlier attempts to their result, so
     * those files aren't uploaded again; it is filled with every upload that succeeds. [isCancelled] is checked before
     * each file starts, so a cancel lets the running uploads finish and keeps them in [done].
     */
    suspend fun <F> uploadPooled(
        files: List<F>,
        key: (F) -> String,
        upload: suspend (F) -> UploadedImage,
        done: MutableMap<String, UploadedImage>,
        concurrency: Int = CONCURRENCY,
        isCancelled: () -> Boolean = { false },
        onProgress: (completed: Int, total: Int, failed: Int) -> Unit = { _, _, _ -> },
    ): PooledResult {
        val uploaded = arrayOfNulls<UploadedImage>(files.size)
        val errors = java.util.concurrent.ConcurrentHashMap<Int, String>()
        val completed = AtomicInteger(0)
        val next = AtomicInteger(0)
        files.forEachIndexed { i, file ->
            done[key(file)]?.let {
                uploaded[i] = it
                completed.incrementAndGet()
            }
        }
        onProgress(completed.get(), files.size, 0)
        if (files.isEmpty()) return PooledResult(emptyList(), emptyMap(), false)

        coroutineScope {
            List(minOf(concurrency, files.size)) {
                async {
                    while (!isCancelled()) {
                        val i = next.getAndIncrement()
                        if (i >= files.size) break
                        if (uploaded[i] != null) continue
                        try {
                            val result = upload(files[i])
                            uploaded[i] = result
                            synchronized(done) { done[key(files[i])] = result }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            errors[i] = e.message ?: e.toString()
                        }
                        onProgress(completed.incrementAndGet(), files.size, errors.size)
                    }
                }
            }.awaitAll()
        }
        return PooledResult(uploaded.toList(), errors.toMap(), isCancelled())
    }

    /** Whether a GIF has more than one frame: each frame after the first has its own graphic control extension */
    fun isAnimatedGif(bytes: ByteArray): Boolean {
        var frames = 0
        var i = 0
        while (i + 3 < bytes.size) {
            if (bytes[i] == 0x21.toByte() && bytes[i + 1] == 0xF9.toByte() && bytes[i + 2] == 0x04.toByte()) {
                frames += 1
                if (frames > 1) return true
                i += 3
            }
            i += 1
        }
        return false
    }
}
