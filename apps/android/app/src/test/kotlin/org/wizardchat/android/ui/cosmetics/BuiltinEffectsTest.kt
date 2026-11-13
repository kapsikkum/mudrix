package org.wizardchat.android.ui.cosmetics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BuiltinEffectsTest {
    private val webIds = listOf(
        "falling-stars", "hearts", "snow", "sparkles", "claude-sparks", "bubbles", "confetti",
        "fireflies", "autumn-leaves", "mud-splatter", "creeping-hands", "signal-intrusion",
        "broadcast-hijack", "eevee-stars",
    )

    @Test
    fun idsMatchTheWebList() {
        assertEquals(webIds, BuiltinEffects.IDS)
        assertEquals(webIds, BuiltinEffects.DRAWN_IDS)
        assertTrue(BuiltinEffects.draws("falling-stars"))
        assertTrue(BuiltinEffects.isBuiltin("eevee-stars"))
        assertTrue(BuiltinEffects.draws("eevee-stars"))
    }

    @Test
    fun particlesStayInBoundsAndRecycle() {
        for (id in BuiltinEffects.DRAWN_IDS) {
            val field = BuiltinEffects.Field(id, 220f, 160f, seed = 7L)
            val expected = field.particles.size
            for (step in 0 until 2000) {
                field.step(1f / 60f, step / 60f)
                for (p in field.particles) {
                    assertTrue("$id x=${p.x}", p.x >= -40f && p.x <= 260f)
                    assertTrue("$id y=${p.y}", p.y >= -40f && p.y <= 200f)
                }
            }
            assertEquals("$id count", expected, field.particles.size)
            assertTrue("$id recycles", field.respawns > 0)
        }
    }

    @Test
    fun theSameSeedAndStepsAgree() {
        val first = BuiltinEffects.Field("mud-splatter", 200f, 150f, seed = 11L)
        val second = BuiltinEffects.Field("mud-splatter", 200f, 150f, seed = 11L)
        repeat(120) { step ->
            first.step(1f / 60f, step / 60f)
            second.step(1f / 60f, step / 60f)
        }
        assertEquals(first.particles, second.particles)
    }

    @Test
    fun aStillFrameDoesNotMove() {
        val still = BuiltinEffects.still("snow", 200f, 150f, seed = 3L)
        assertEquals(28, still.size)
        assertEquals(still, BuiltinEffects.still("snow", 200f, 150f, seed = 3L))
        assertEquals(still, BuiltinEffects.Field("snow", 200f, 150f, seed = 3L).particles)
        assertEquals(18, BuiltinEffects.still("signal-intrusion", 200f, 150f, seed = 3L).size)
        assertEquals(14, BuiltinEffects.still("eevee-stars", 200f, 150f, seed = 3L).size)
    }

    @Test
    fun theEeveeStripAdvancesAndWraps() {
        assertEquals(0, BuiltinEffects.eeveeFrame(0f, 0f))
        assertEquals(1, BuiltinEffects.eeveeFrame(0.1f, 0f))
        assertEquals(62, BuiltinEffects.eeveeFrame(3.7f, 0f))
        assertEquals(124, BuiltinEffects.eeveeFrame(7.39f, 0f))
        assertEquals(BuiltinEffects.eeveeFrame(1f, 0f), BuiltinEffects.eeveeFrame(1f + BuiltinEffects.EEVEE_CYCLE, 0f))
        assertEquals(16, BuiltinEffects.eeveeFrame(0f, 0.95f))
        assertEquals(0, BuiltinEffects.eeveeFrame(3.7f, 1.5f, animate = false))
    }
}
