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
        assertTrue(BuiltinEffects.draws("falling-stars"))
        assertTrue(BuiltinEffects.isBuiltin("eevee-stars"))
        assertEquals(false, BuiltinEffects.draws("eevee-stars"))
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
    }
}
