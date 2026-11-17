package chat.mudrix.android.matrix

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** [PackUpload]: shortcodes, splitting by size, rate-limit retry and the resumable pool */
class PackUploadTest {
    private fun uploaded(name: String) = UploadedImage("mxc://x/$name", "image/png", JsonObject(emptyMap()))

    @Test
    fun shortcodesFromFileNames() {
        assertEquals("party_parrot", PackUpload.shortcodeFromFile("Party Parrot!.GIF"))
        assertEquals("a-b_c", PackUpload.shortcodeFromFile("a-b_c.png"))
        assertEquals("item", PackUpload.shortcodeFromFile("???.png", "item"))
        assertEquals("image", PackUpload.shortcodeFromFile("__.png"))
    }

    @Test
    fun uniqueShortcodesCount_from_two() {
        val used = mutableSetOf("cat")
        assertEquals("cat_2", PackUpload.uniqueShortcode("cat", used))
        assertEquals("cat_3", PackUpload.uniqueShortcode("cat", used))
        assertEquals("dog", PackUpload.uniqueShortcode("dog", used))
    }

    @Test
    fun shortcodeRules() {
        assertTrue(PackUpload.isValidShortcode("ok_1-x"))
        assertFalse(PackUpload.isValidShortcode(""))
        assertFalse(PackUpload.isValidShortcode("no spaces"))
        assertFalse(PackUpload.isValidShortcode("a".repeat(101)))
    }

    @Test
    fun numberedNames() {
        assertEquals("Cats", PackUpload.numberedName("Cats", 0, 1))
        assertEquals("Cats (2)", PackUpload.numberedName("Cats", 1, 3))
    }

    private fun entry(i: Int) = buildJsonObject {
        put("url", "mxc://example.org/" + "x".repeat(24))
        put("body", "image$i")
        put("info", buildJsonObject { put("mimetype", "image/png"); put("w", 128); put("h", 128) })
    }

    private val header = buildJsonObject {
        put("pack", buildJsonObject { put("display_name", "Cats") })
    }

    @Test
    fun smallPackStaysInOnePart() {
        val images = (1..5).associate { "i$it" to entry(it) }
        val chunks = PackUpload.splitImagesBySize(header, images)
        assertEquals(1, chunks.size)
        assertEquals(5, chunks[0].size)
    }

    @Test
    fun emptyPackIsOneEmptyPart() {
        assertEquals(listOf(emptyMap<String, JsonObject>()), PackUpload.splitImagesBySize(header, emptyMap()).map { it.mapValues { e -> e.value as JsonObject } })
    }

    @Test
    fun bigPackSplitsAndEveryPartFits() {
        val images = (1..900).associate { "image_$it" to entry(it) }
        val chunks = PackUpload.splitImagesBySize(header, images)
        assertTrue(chunks.size > 1)
        assertEquals(900, chunks.sumOf { it.size })
        assertEquals(images.keys.toList(), chunks.flatMap { it.keys })
        for (chunk in chunks) {
            val content = JsonObject(header + ("images" to JsonObject(chunk.mapValues { it.value })))
            assertTrue(PackSize.contentBytes(content) <= PackSize.BUDGET_BYTES)
        }
    }

    @Test
    fun splitHonoursSmallBudget() {
        val images = (1..10).associate { "i$it" to entry(it) }
        val chunks = PackUpload.splitImagesBySize(header, images, 600)
        assertTrue(chunks.size > 1)
        assertTrue(chunks.all { it.isNotEmpty() })
    }

    @Test
    fun oneHugeImageStillGetsAPart() {
        val chunks = PackUpload.splitImagesBySize(header, mapOf("big" to entry(1)), 10)
        assertEquals(1, chunks.size)
    }

    @Test
    fun errorKinds() {
        assertTrue(PackUpload.isTooLarge(RuntimeException("M_TOO_LARGE: event too large")))
        assertTrue(PackUpload.isTooLarge(RuntimeException("HTTP 413")))
        assertFalse(PackUpload.isTooLarge(RuntimeException("M_FORBIDDEN")))
        assertTrue(PackUpload.isRateLimited(RuntimeException("M_LIMIT_EXCEEDED retry_after_ms: 2500")))
        assertTrue(PackUpload.isRateLimited(RuntimeException("status 429")))
        assertFalse(PackUpload.isRateLimited(RuntimeException("nope")))
    }

    @Test
    fun retryDelayGrowsAndIsCapped() {
        val plain = RuntimeException("M_LIMIT_EXCEEDED")
        assertEquals(1000, PackUpload.retryDelayMs(plain, 0))
        assertEquals(2000, PackUpload.retryDelayMs(plain, 1))
        assertEquals(30_000, PackUpload.retryDelayMs(plain, 9))
        assertEquals(2500, PackUpload.retryDelayMs(RuntimeException("M_LIMIT_EXCEEDED retry_after_ms: 2500"), 0))
        assertEquals(250, PackUpload.retryDelayMs(RuntimeException("retry_after_ms: 5"), 0))
    }

    @Test
    fun rateLimitedCallsAreRetriedThenGiveUp() = runBlocking {
        val sleeps = mutableListOf<Long>()
        var calls = 0
        val result = PackUpload.withRateLimitRetry(sleep = { sleeps.add(it) }) {
            calls += 1
            if (calls < 3) throw RuntimeException("M_LIMIT_EXCEEDED")
            "ok"
        }
        assertEquals("ok", result)
        assertEquals(listOf(1000L, 2000L), sleeps)

        calls = 0
        val failure = runCatching {
            PackUpload.withRateLimitRetry(attempts = 2, sleep = {}) {
                calls += 1
                throw RuntimeException("M_LIMIT_EXCEEDED")
            }
        }
        assertTrue(failure.isFailure)
        assertEquals(2, calls)

        calls = 0
        runCatching { PackUpload.withRateLimitRetry(sleep = {}) { calls += 1; throw RuntimeException("M_FORBIDDEN") } }
        assertEquals(1, calls)
    }

    @Test
    fun poolUploadsEverythingInOrder() = runBlocking {
        val done = mutableMapOf<String, UploadedImage>()
        val progress = mutableListOf<Int>()
        val result = PackUpload.uploadPooled(
            listOf("a", "b", "c", "d", "e", "f"),
            key = { it },
            upload = { uploaded(it) },
            done = done,
            concurrency = 3,
            onProgress = { completed, _, _ -> progress.add(completed) },
        )
        assertEquals(listOf("a", "b", "c", "d", "e", "f").map { "mxc://x/$it" }, result.uploaded.map { it?.mxc })
        assertTrue(result.errors.isEmpty())
        assertFalse(result.cancelled)
        assertEquals(6, done.size)
        assertEquals(6, progress.max())
    }

    @Test
    fun retryOnlyUploadsWhatFailed() = runBlocking {
        val done = mutableMapOf<String, UploadedImage>()
        val calls = mutableListOf<String>()
        val first = PackUpload.uploadPooled(
            listOf("a", "b", "c"),
            key = { it },
            upload = {
                calls.add(it)
                if (it == "b") throw RuntimeException("boom")
                uploaded(it)
            },
            done = done,
        )
        assertEquals(mapOf(1 to "boom"), first.errors)
        assertNull(first.uploaded[1])

        calls.clear()
        val second = PackUpload.uploadPooled(listOf("a", "b", "c"), key = { it }, upload = { calls.add(it); uploaded(it) }, done = done)
        assertEquals(listOf("b"), calls)
        assertTrue(second.errors.isEmpty())
        assertTrue(second.uploaded.all { it != null })
    }

    @Test
    fun cancelStopsStartingNewFilesAndKeepsWhatFinished() = runBlocking {
        val done = mutableMapOf<String, UploadedImage>()
        var cancelled = false
        val result = PackUpload.uploadPooled(
            listOf("a", "b", "c", "d"),
            key = { it },
            upload = {
                if (it == "b") cancelled = true
                uploaded(it)
            },
            done = done,
            concurrency = 1,
            isCancelled = { cancelled },
        )
        assertTrue(result.cancelled)
        assertEquals(listOf("mxc://x/a", "mxc://x/b", null, null), result.uploaded.map { it?.mxc })
        assertEquals(setOf("a", "b"), done.keys)
    }

    @Test
    fun resumeKeyIdentifiesFileBySizeToo() {
        assertEquals("content://a/1:42", PackUpload.resumeKey("content://a/1", 42))
        assertEquals("content://a/1:-1", PackUpload.resumeKey("content://a/1", null))
    }

    @Test
    fun animatedGifNeedsTwoFrames() {
        val frame = byteArrayOf(0x21, 0xF9.toByte(), 0x04, 0, 0, 0, 0, 0)
        assertFalse(PackUpload.isAnimatedGif(byteArrayOf()))
        assertFalse(PackUpload.isAnimatedGif(frame))
        assertTrue(PackUpload.isAnimatedGif(frame + frame))
    }

    @Test
    fun splittingKeepsImageOrder() {
        val images = linkedMapOf<String, JsonObject>("z" to entry(1), "a" to entry(2))
        assertEquals(listOf("z", "a"), PackUpload.splitImagesBySize(header, images).single().keys.toList())
    }

    @Test
    fun onePartKeepsItsName() {
        val parts = PackUpload.partContents(header, "Cats", mapOf("a" to entry(1)))
        assertEquals(1, parts.size)
        assertEquals(JsonPrimitive("Cats"), (parts[0]["pack"] as JsonObject)["display_name"])
        assertEquals(setOf("a"), (parts[0]["images"] as JsonObject).keys)
    }

    @Test
    fun severalPartsAreNumberedAndTheFirstImageIsTheIcon() {
        val images = (1..900).associate { "image_$it" to entry(it) }
        val parts = PackUpload.partContents(header, "Cats", images, iconFromFirst = true)
        assertTrue(parts.size > 1)
        parts.forEachIndexed { i, part ->
            val pack = part["pack"] as JsonObject
            assertEquals(JsonPrimitive("Cats (${i + 1})"), pack["display_name"])
            val firstUrl = ((part["images"] as JsonObject).values.first() as JsonObject)["url"]
            assertEquals(firstUrl, pack["avatar_url"])
            assertTrue(PackSize.contentBytes(part) <= PackSize.BUDGET_BYTES)
        }
        assertEquals(900, parts.sumOf { (it["images"] as JsonObject).size })
    }

    @Test
    fun anExistingIconIsKept() {
        val withIcon = buildJsonObject {
            put("pack", buildJsonObject { put("display_name", "Cats"); put("avatar_url", "mxc://x/icon") })
        }
        val part = PackUpload.partContents(withIcon, "Cats", mapOf("a" to entry(1)), iconFromFirst = true).single()
        assertEquals(JsonPrimitive("mxc://x/icon"), (part["pack"] as JsonObject)["avatar_url"])
    }

    @Test
    fun plannedPackCountGrowsWithTheFiles() {
        assertEquals(1, PackUpload.plannedPackCount((1..10).map { "i$it" }, "example.org", "Cats"))
        assertTrue(PackUpload.plannedPackCount((1..900).map { "image_$it" }, "example.org", "Cats") > 1)
    }
}
