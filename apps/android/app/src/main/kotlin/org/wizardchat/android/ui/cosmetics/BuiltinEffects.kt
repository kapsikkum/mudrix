package org.wizardchat.android.ui.cosmetics

import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/** The built-in profile effects: the web app's particle maths, deterministic for a seed and a time */
object BuiltinEffects {
    /** Every effect id the web knows, in its order */
    val IDS = listOf(
        "falling-stars",
        "hearts",
        "snow",
        "sparkles",
        "claude-sparks",
        "bubbles",
        "confetti",
        "fireflies",
        "autumn-leaves",
        "mud-splatter",
        "creeping-hands",
        "signal-intrusion",
        "broadcast-hijack",
        "eevee-stars",
    )

    /** The effects drawn as vectors; `eevee-stars` needs the web's bitmap sprite strip and is not drawn */
    val DRAWN_IDS = IDS - "eevee-stars"

    const val MAX_PARTICLES = 28

    const val MIST_SHAPE = 9

    private const val TWO_PI = (PI * 2).toFloat()
    private val CONFETTI_COLORS = listOf("#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6")
    private val LEAF_COLORS = listOf("#e0792b", "#c2410c", "#b45309", "#a16207", "#9a3412")

    /** One particle at one moment of its life; `life` is infinite for effects that never fade */
    data class Particle(
        val x: Float,
        val y: Float,
        val vx: Float,
        val vy: Float,
        val size: Float,
        val rot: Float,
        val vr: Float,
        val phase: Float,
        val age: Float,
        val life: Float,
        val tint: String? = null,
        val shape: Int? = null,
    )

    /** Whether an id is one of the built-in effects */
    fun isBuiltin(id: String): Boolean = id in IDS

    /** Whether an id is one of the drawn effects */
    fun draws(id: String): Boolean = id in DRAWN_IDS

    /** A still frame, used when motion is reduced and in the picker's tiles */
    fun still(effect: String, width: Float, height: Float, seed: Long = 0L): List<Particle> =
        Field(effect, width, height, seed).particles

    /** A live particle field; the same seed and the same steps always produce the same particles */
    class Field(val effect: String, val width: Float, val height: Float, seed: Long = 0L) {
        private val random = Random(seed)
        private val w = max(1f, width)
        private val h = max(1f, height)

        var particles: List<Particle> = List(min(countOf(effect), MAX_PARTICLES)) { spawn(true) }
            private set

        /** How many particles have been recycled since the field was made */
        var respawns: Int = 0
            private set

        /** Moves every particle by up to 50 ms and recycles the ones that left or ran out of life */
        fun step(dt: Float, now: Float) {
            val delta = dt.coerceIn(0f, 0.05f)
            val next = ArrayList<Particle>(particles.size)
            for (p in particles) {
                val aged = p.copy(
                    age = p.age + delta,
                    x = p.x + (p.vx + sin(now + p.phase) * 6f) * delta,
                    y = p.y + p.vy * delta,
                    rot = p.rot + p.vr * delta,
                )
                val out = aged.y > h + 40 || aged.y < -40 || aged.x < -40 || aged.x > w + 40 || aged.age > aged.life
                if (out) {
                    respawns++
                    next += spawn(false)
                } else {
                    next += aged
                }
            }
            particles = next
        }

        private fun spawn(initial: Boolean): Particle {
            val base = spawnBase(initial)
            val phase = random.nextFloat() * TWO_PI
            val age = if (initial) rand(0f, if (base.life.isInfinite()) 2f else base.life) else 0f
            return Particle(
                x = base.x, y = base.y, vx = base.vx, vy = base.vy, size = base.size, rot = base.rot,
                vr = base.vr, phase = phase, age = age, life = base.life, tint = base.tint, shape = base.shape,
            )
        }

        private fun spawnBase(initial: Boolean): Spawn = when (effect) {
            "falling-stars" -> Spawn(
                x = rand(0f, w), y = if (initial) rand(0f, h) else rand(-30f, -8f),
                vx = rand(-18f, -6f), vy = rand(35f, 75f), size = rand(4f, 8f),
                rot = rand(0f, TWO_PI), vr = rand(-2f, 2f),
            )
            "hearts" -> Spawn(
                x = rand(0f, w), y = if (initial) rand(0f, h) else h + rand(8f, 30f),
                vx = rand(-6f, 6f), vy = -rand(18f, 42f), size = rand(4f, 7f),
                rot = rand(-0.4f, 0.4f), vr = rand(-0.4f, 0.4f),
            )
            "snow" -> Spawn(
                x = rand(0f, w), y = if (initial) rand(0f, h) else rand(-20f, -4f),
                vx = rand(-6f, 6f), vy = rand(14f, 34f), size = rand(2.5f, 5f),
                rot = 0f, vr = 0f,
            )
            "sparkles" -> Spawn(
                x = rand(8f, max(8f, w - 8f)), y = rand(8f, max(8f, h - 8f)),
                vx = rand(-2f, 2f), vy = rand(-4f, -1f), size = rand(5f, 10f),
                rot = rand(0f, PI.toFloat()), vr = rand(-0.5f, 0.5f), life = rand(1.2f, 2.4f),
            )
            "claude-sparks" -> {
                val critter = random.nextFloat() < 0.18f
                Spawn(
                    x = rand(8f, max(8f, w - 8f)), y = if (initial) rand(0f, h) else h + rand(8f, 24f),
                    vx = rand(-4f, 4f), vy = if (critter) -rand(9f, 14f) else -rand(8f, 16f),
                    size = if (critter) rand(4f, 5.5f) else rand(4f, 7f),
                    rot = if (critter) 0f else rand(0f, TWO_PI),
                    vr = if (critter) 0f else rand(-0.8f, 0.8f),
                    life = if (critter) Float.POSITIVE_INFINITY else rand(3f, 5f),
                    shape = if (critter) 0 else pick(intArrayOf(4, 6, 8)),
                )
            }
            "bubbles" -> Spawn(
                x = rand(0f, w), y = if (initial) rand(0f, h) else h + rand(8f, 30f),
                vx = rand(-4f, 4f), vy = -rand(14f, 28f), size = rand(4f, 9f),
                rot = 0f, vr = 0f,
            )
            "confetti" -> Spawn(
                x = rand(0f, w), y = if (initial) rand(0f, h) else rand(-30f, -8f),
                vx = rand(-12f, 12f), vy = rand(40f, 70f), size = rand(3.5f, 5.5f),
                rot = rand(0f, TWO_PI), vr = rand(-6f, 6f), tint = pick(CONFETTI_COLORS),
            )
            "fireflies" -> Spawn(
                x = rand(0f, w), y = rand(0f, h), vx = rand(-7f, 7f), vy = rand(-7f, 7f),
                size = rand(1.8f, 2.8f), rot = 0f, vr = 0f, life = rand(3f, 6f),
            )
            "autumn-leaves" -> Spawn(
                x = rand(0f, w), y = if (initial) rand(0f, h) else rand(-30f, -8f),
                vx = rand(-8f, 8f), vy = rand(20f, 34f), size = rand(5f, 8f),
                rot = rand(0f, TWO_PI), vr = rand(-1.5f, 1.5f), tint = pick(LEAF_COLORS),
            )
            "mud-splatter" -> {
                val roll = random.nextFloat()
                val shape = if (roll < 0.18f) 2 else if (roll < 0.45f) 1 else 0
                val speck = shape == 2
                val drip = shape == 1
                Spawn(
                    x = rand(0f, w), y = if (initial) rand(0f, h) else rand(-30f, -8f),
                    vx = rand(-5f, 5f),
                    vy = when {
                        speck -> rand(60f, 90f)
                        drip -> rand(30f, 45f)
                        else -> rand(22f, 38f)
                    },
                    size = when {
                        speck -> rand(1f, 1.8f)
                        drip -> rand(4f, 6f)
                        else -> rand(5f, 9f)
                    },
                    rot = if (drip || speck) 0f else rand(0f, TWO_PI),
                    vr = if (drip || speck) 0f else rand(-0.3f, 0.3f),
                    shape = shape,
                )
            }
            "creeping-hands" -> if (random.nextFloat() < 0.4f) {
                Spawn(
                    x = if (initial) rand(0f, w) else -30f, y = rand(h * 0.3f, h * 0.95f),
                    vx = rand(6f, 12f), vy = rand(-3f, -1f), size = rand(22f, 34f),
                    rot = 0f, vr = 0f, shape = MIST_SHAPE,
                )
            } else {
                Spawn(
                    x = rand(12f, max(12f, w - 12f)), y = h - 6f, vx = 0f, vy = 0f,
                    size = rand(7f, 9f), rot = rand(-0.12f, 0.12f), vr = 0f, life = rand(9f, 13f),
                )
            }
            "signal-intrusion" -> {
                val roll = random.nextFloat()
                when {
                    roll < 0.46f -> Spawn(
                        x = rand(18f, max(18f, w - 18f)), y = rand(16f, max(16f, h - 16f)),
                        vx = 0f, vy = 0f, size = rand(12f, 20f), rot = rand(-0.26f, 0.26f),
                        vr = 0f, life = rand(3.2f, 6f), shape = 0,
                        tint = if (random.nextFloat() < 0.28f) "cyan" else "red",
                    )
                    roll < 0.8f -> Spawn(
                        x = rand(w * 0.15f, w * 0.85f), y = rand(8f, max(8f, h - 8f)),
                        vx = rand(-14f, 14f), vy = rand(-18f, 18f), size = rand(48f, 118f),
                        rot = 0f, vr = 0f, life = rand(0.9f, 2.1f), shape = 1,
                    )
                    else -> Spawn(
                        x = rand(8f, max(8f, w - 8f)), y = rand(8f, max(8f, h - 8f)),
                        vx = 0f, vy = rand(8f, 20f), size = rand(9f, 17f),
                        rot = 0f, vr = 0f, life = rand(1.2f, 2.6f), shape = 2,
                    )
                }
            }
            "broadcast-hijack" -> {
                val roll = random.nextFloat()
                when {
                    roll < 0.42f -> Spawn(
                        x = rand(22f, max(22f, w - 22f)), y = rand(24f, max(24f, h - 24f)),
                        vx = 0f, vy = 0f, size = rand(14f, 22f), rot = rand(-0.08f, 0.08f),
                        vr = 0f, life = rand(3.6f, 6.4f), shape = 0,
                    )
                    roll < 0.82f -> Spawn(
                        x = rand(w * 0.15f, w * 0.85f), y = rand(6f, max(6f, h - 6f)),
                        vx = rand(-10f, 10f), vy = rand(16f, 36f), size = rand(60f, 145f),
                        rot = 0f, vr = 0f, life = rand(1.1f, 2.4f), shape = 1,
                    )
                    else -> Spawn(
                        x = rand(24f, max(24f, w - 24f)), y = rand(16f, max(16f, h - 16f)),
                        vx = 0f, vy = 0f, size = rand(12f, 18f), rot = 0f, vr = 0f,
                        life = rand(1.4f, 2.8f), shape = 2,
                    )
                }
            }
            else -> Spawn(x = 0f, y = 0f, vx = 0f, vy = 0f, size = 0f, rot = 0f, vr = 0f)
        }

        private fun rand(min: Float, max: Float): Float = min + random.nextFloat() * (max - min)

        private fun pick(values: List<String>): String = values[random.nextInt(values.size)]

        private fun pick(values: IntArray): Int = values[random.nextInt(values.size)]
    }

    private fun countOf(effect: String): Int = when (effect) {
        "falling-stars" -> 18
        "hearts" -> 14
        "snow" -> 28
        "sparkles" -> 20
        "claude-sparks" -> 16
        "bubbles" -> 14
        "confetti" -> 22
        "fireflies" -> 16
        "autumn-leaves" -> 14
        "mud-splatter" -> 16
        "creeping-hands" -> 8
        "signal-intrusion" -> 18
        "broadcast-hijack" -> 16
        else -> 0
    }

    private data class Spawn(
        val x: Float,
        val y: Float,
        val vx: Float,
        val vy: Float,
        val size: Float,
        val rot: Float,
        val vr: Float,
        val life: Float = Float.POSITIVE_INFINITY,
        val tint: String? = null,
        val shape: Int? = null,
    )
}
