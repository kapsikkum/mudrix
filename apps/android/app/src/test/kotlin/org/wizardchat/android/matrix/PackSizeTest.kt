package org.wizardchat.android.matrix

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

/** [PackSize]: the web's byte count, thresholds and labels */
class PackSizeTest {
    @Test
    fun classesMatchTheWeb() {
        assertEquals(PackSize.Level.Ok, PackSize.level(0, 1000))
        assertEquals(PackSize.Level.Ok, PackSize.level(800, 1000))
        assertEquals(PackSize.Level.Near, PackSize.level(801, 1000))
        assertEquals(PackSize.Level.Near, PackSize.level(1000, 1000))
        assertEquals(PackSize.Level.Over, PackSize.level(1001, 1000))
    }

    @Test
    fun budgetThresholds() {
        assertEquals(PackSize.Level.Ok, PackSize.level(40 * 1024))
        assertEquals(PackSize.Level.Near, PackSize.level(50 * 1024))
        assertEquals(PackSize.Level.Near, PackSize.level(PackSize.BUDGET_BYTES))
        assertEquals(PackSize.Level.Over, PackSize.level(PackSize.BUDGET_BYTES + 1))
        assertEquals(65536, PackSize.EVENT_CAP_BYTES)
        assertEquals(61440, PackSize.BUDGET_BYTES)
    }

    @Test
    fun formatsLikeTheWeb() {
        assertEquals("0.0 KB", PackSize.formatKb(0))
        assertEquals("8.3 KB", PackSize.formatKb(8_500))
        assertEquals("10 KB", PackSize.formatKb(10 * 1024))
        assertEquals("60 KB", PackSize.formatKb(PackSize.BUDGET_BYTES))
        assertEquals("64 KB", PackSize.formatKb(PackSize.EVENT_CAP_BYTES))
    }

    @Test
    fun countsUtf8Bytes() {
        val content = buildJsonObject {
            put("pack", buildJsonObject { put("display_name", JsonPrimitive("x")) })
            put("images", JsonObject(emptyMap()))
        }
        assertEquals(41, PackSize.contentBytes(content))
        val accented = buildJsonObject {
            put("pack", buildJsonObject { put("display_name", JsonPrimitive("é")) })
            put("images", JsonObject(emptyMap()))
        }
        assertEquals(42, PackSize.contentBytes(accented))
    }
}
